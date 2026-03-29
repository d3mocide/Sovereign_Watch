"""
SpacePulseService
=================
Orchestrates the unified space domain ingestion pipeline.

All sources share a single Kafka producer and Redis client, reducing per-container
overhead compared to running three separate poller containers.

Sources and their output paths:
  OrbitalSource       → Kafka topic: orbital_raw
  SatNOGSDBSource     → Kafka topic: satnogs_transmitters
  SatNOGSNetworkSource→ Kafka topic: satnogs_observations
  SpaceWeatherSource  → Redis + TimescaleDB (direct writes, no Kafka)
"""

import asyncio
import json
import logging
import os

import redis.asyncio as aioredis
from aiokafka import AIOKafkaProducer

from sources.orbital import OrbitalSource
from sources.satnogs_db import SatNOGSDBSource
from sources.satnogs_network import SatNOGSNetworkSource
from sources.space_weather import SpaceWeatherSource
from sources.iss import ISSSource

logger = logging.getLogger("space_pulse")

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "sovereign-redpanda:9092")
REDIS_HOST    = os.getenv("REDIS_HOST", "sovereign-redis")
REDIS_PORT    = int(os.getenv("REDIS_PORT", "6379"))
DATABASE_URL  = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password@sovereign-timescaledb:5432/sovereign_watch",
)

# Kafka topics
TOPIC_ORBITAL      = "orbital_raw"
TOPIC_SAT_TX       = "satnogs_transmitters"
TOPIC_SAT_OBS      = "satnogs_observations"

# Fetch intervals (configurable via env)
SATNOGS_DB_INTERVAL_H      = int(os.getenv("SATNOGS_DB_INTERVAL_H", "24"))
SATNOGS_NETWORK_INTERVAL_H = int(os.getenv("SATNOGS_NETWORK_INTERVAL_H", "1"))
AURORA_INTERVAL_S          = int(os.getenv("AURORA_INTERVAL_S", "300"))   # 5 min
KP_INTERVAL_S              = int(os.getenv("KP_INTERVAL_S", "900"))       # 15 min


class SpacePulseService:
    def __init__(self):
        self.running      = True
        self.producer     = None
        self.redis_client = None
        self.sources      = []

    async def setup(self):
        self.producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BROKERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            linger_ms=50,
        )
        await self.producer.start()
        logger.info("Kafka producer started")

        self.redis_client = await aioredis.from_url(
            f"redis://{REDIS_HOST}:{REDIS_PORT}", decode_responses=True
        )
        logger.info("Redis connected")

        self.sources = [
            OrbitalSource(
                producer=self.producer,
                redis_client=self.redis_client,
                topic=TOPIC_ORBITAL,
            ),
            SatNOGSDBSource(
                producer=self.producer,
                redis_client=self.redis_client,
                topic=TOPIC_SAT_TX,
                fetch_interval_h=SATNOGS_DB_INTERVAL_H,
            ),
            SatNOGSNetworkSource(
                producer=self.producer,
                redis_client=self.redis_client,
                topic=TOPIC_SAT_OBS,
                fetch_interval_h=SATNOGS_NETWORK_INTERVAL_H,
            ),
            SpaceWeatherSource(
                redis_client=self.redis_client,
                db_url=DATABASE_URL,
                aurora_interval_s=AURORA_INTERVAL_S,
                kp_interval_s=KP_INTERVAL_S,
            ),
            ISSSource(
                redis_client=self.redis_client,
                db_url=DATABASE_URL,
            ),
        ]

    async def run(self):
        """Run all source loops concurrently."""
        tasks = [asyncio.create_task(src.run()) for src in self.sources]
        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            pass

    async def shutdown(self):
        logger.info("space-pulse shutting down...")
        self.running = False
        if self.producer:
            await self.producer.stop()
        if self.redis_client:
            await self.redis_client.close()

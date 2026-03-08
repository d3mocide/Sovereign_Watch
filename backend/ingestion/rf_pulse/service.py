"""
RFPulseService
==============
Orchestrates multi-source RF infrastructure collection.
"""

import asyncio
import json
import logging
import os

import redis.asyncio as aioredis
from aiokafka import AIOKafkaProducer

from sources.repeaterbook import RepeaterBookSource
from sources.ard import ARDSource
from sources.noaa_nwr import NOAANWRSource
from sources.radioref import RadioReferenceSource

logger = logging.getLogger("rf_pulse")

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "sovereign-redpanda:9092")
REDIS_HOST    = os.getenv("REDIS_HOST", "sovereign-redis")
REDIS_PORT    = int(os.getenv("REDIS_PORT", "6379"))
TOPIC_OUT     = "rf_raw"

# Fetch intervals
REPEATERBOOK_INTERVAL_H = int(os.getenv("RF_REPEATERBOOK_INTERVAL_H", "6"))
ARD_INTERVAL_H          = int(os.getenv("RF_ARD_INTERVAL_H", "24"))
NOAA_INTERVAL_H         = int(os.getenv("RF_NOAA_INTERVAL_H", "168"))


class RFPulseService:
    def __init__(self):
        self.running       = True
        self.producer      = None
        self.redis_client  = None
        self.sources       = []

    async def setup(self):
        self.producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BROKERS,
            value_serializer=lambda v: json.dumps(v).encode(),
        )
        await self.producer.start()
        logger.info("Kafka producer started -> topic: %s", TOPIC_OUT)

        self.redis_client = await aioredis.from_url(
            f"redis://{REDIS_HOST}:{REDIS_PORT}", decode_responses=True
        )
        logger.info("Redis connected")

        # Instantiate sources
        self.sources = [
            RepeaterBookSource(
                producer=self.producer,
                redis_client=self.redis_client,
                topic=TOPIC_OUT,
                fetch_interval_h=REPEATERBOOK_INTERVAL_H,
            ),
            ARDSource(
                producer=self.producer,
                redis_client=self.redis_client,
                topic=TOPIC_OUT,
                fetch_interval_h=ARD_INTERVAL_H,
            ),
            NOAANWRSource(
                producer=self.producer,
                redis_client=self.redis_client,
                topic=TOPIC_OUT,
                fetch_interval_h=NOAA_INTERVAL_H,
            ),
            RadioReferenceSource(
                producer=self.producer,
                redis_client=self.redis_client,
                topic=TOPIC_OUT,
                # RR is fetched on-demand via an internal mechanism or API,
                # but we can set up a basic poller pattern if it needs to keep data fresh.
                # However, for RadioReference it's typically user-driven or
                # we just instantiate it to be available. We'll set a daily check if needed.
                fetch_interval_h=24,
            ),
        ]

    async def run(self):
        """Run all source loops concurrently."""
        tasks = [asyncio.create_task(src.loop()) for src in self.sources]
        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            pass

    async def shutdown(self):
        logger.info("rf-pulse shutting down...")
        self.running = False
        if self.producer:
            await self.producer.stop()
        if self.redis_client:
            await self.redis_client.close()

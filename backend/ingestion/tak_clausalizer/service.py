"""
TAK Clausalizer Service: Main orchestrator for the clausalizer microservice.
Consumes from Kafka, applies delta calculation, evaluates state changes, emits clauses.
"""

import asyncio
import json
import logging
import os
from typing import Dict, Optional

from aiokafka import AIOKafkaConsumer
import redis.asyncio as redis

from clause_emitter import ClauseEmitter
from delta_engine import DeltaEngine, MedialClause
from state_change_evaluator import StateChangeEvaluator
from utils import safe_float

logger = logging.getLogger(__name__)


class TakClausalizerService:
    """
    TAK Clausalizer: Transforms raw TAK telemetry into state-change narratives.
    - Consumes from adsb_raw + ais_raw Kafka topics
    - Filters GPS jitter via Haversine distance
    - Evaluates state changes (type, location, speed, etc.)
    - Emits state-change clauses to clausal_chains_state_changes topic
    """

    def __init__(self):
        self.running = True

        # Configuration from environment
        self.kafka_brokers = os.getenv("KAFKA_BROKERS", "sovereign-redpanda:9092")
        redis_host = os.getenv("REDIS_HOST", "sovereign-redis")
        redis_port = os.getenv("REDIS_PORT", "6379")
        self.redis_url = f"redis://{redis_host}:{redis_port}"
        self.input_topics = ["adsb_raw", "ais_raw"]
        self.output_topic = "clausal_chains_state_changes"

        # Components
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.redis_client: Optional[redis.Redis] = None
        self.delta_engine = DeltaEngine(self.redis_url)
        self.evaluator = StateChangeEvaluator()
        self.emitter = ClauseEmitter(self.kafka_brokers, self.output_topic)

        # Batch processing
        self.batch_size = 100
        self.batch_timeout_s = 2.0
        self.message_batch: Dict = {}
        self.last_flush_time = asyncio.get_event_loop().time()

        # Statistics
        self.stats = {
            "messages_consumed": 0,
            "messages_processed": 0,
            "jitter_filtered": 0,
            "state_changes_emitted": 0,
            "errors": 0,
        }

    async def setup(self):
        """Initialize all components."""
        logger.info("TAK Clausalizer Service starting up...")

        # Start Kafka consumer
        self.consumer = AIOKafkaConsumer(
            *self.input_topics,
            bootstrap_servers=self.kafka_brokers,
            group_id="tak-clausalizer",
            auto_offset_reset="latest",  # Start from latest messages
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            key_deserializer=lambda m: m.decode("utf-8") if m else None,
        )
        await self.consumer.start()
        logger.info(f"Consumer started, listening to topics: {self.input_topics}")

        # Connect to Redis
        self.redis_client = await redis.from_url(self.redis_url, decode_responses=True)
        logger.info("Connected to Redis")

        # Connect delta engine
        await self.delta_engine.connect()

        # Connect clause emitter
        await self.emitter.connect()

        logger.info("TAK Clausalizer Service setup complete")

    async def shutdown(self):
        """Graceful shutdown of all components."""
        logger.info("TAK Clausalizer Service shutting down...")
        self.running = False

        # Flush pending messages
        await self.flush_batch()

        # Stop consumer
        if self.consumer:
            await self.consumer.stop()

        # Close connections
        await self.delta_engine.disconnect()
        await self.emitter.disconnect()
        if self.redis_client:
            await self.redis_client.close()

        # Log final statistics
        logger.info(f"Final statistics: {self.stats}")

    async def run(self):
        """Main event loop."""
        logger.info("TAK Clausalizer Service running...")

        # Run consumer loop and batch flush loop concurrently
        await asyncio.gather(
            self.consumer_loop(),
            self.batch_flush_loop(),
        )

    async def consumer_loop(self):
        """Main consumer loop: process incoming messages."""
        try:
            async for message in self.consumer:
                if not self.running:
                    break

                self.stats["messages_consumed"] += 1

                try:
                    await self.process_message(message.value, message.topic)
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
                    self.stats["errors"] += 1

                # Batch flush check
                if len(self.message_batch) >= self.batch_size:
                    await self.flush_batch()

        except Exception as e:
            logger.error(f"Consumer loop error: {e}")
            self.stats["errors"] += 1

    async def batch_flush_loop(self):
        """Periodically flush pending messages."""
        while self.running:
            await asyncio.sleep(self.batch_timeout_s)

            current_time = asyncio.get_event_loop().time()
            if current_time - self.last_flush_time >= self.batch_timeout_s:
                if self.message_batch:
                    await self.flush_batch()

    async def process_message(self, message: dict, topic: str):
        """
        Process a single TAK message from Kafka.
        Applies delta calculation, evaluates state changes, emits if needed.

        Args:
            message: TAK message JSON dict
            topic: Source topic (adsb_raw or ais_raw)
        """
        uid = message.get("uid")
        if not uid:
            logger.warning("Message missing UID, skipping")
            return

        self.stats["messages_processed"] += 1

        # Map topic to source
        source = "TAK_ADSB" if topic == "adsb_raw" else "TAK_AIS"

        # Extract GPS error bounds (ce = circular error, le = linear error)
        detail = message.get("detail", {})
        precision = detail.get("precision_location", {})
        ce = safe_float(precision.get("ce"), default=0.0)
        le = safe_float(precision.get("le"), default=0.0)

        # Step 1: Query previous state from Redis
        prev_clause = await self.delta_engine.get_previous_state(uid)

        # Step 2: Validate and extract GPS coordinates
        # Treat missing or non-numeric lat/lon as a hard failure – silently
        # defaulting to 0.0 would create bogus tracks at the (0, 0) null island.
        point = message.get("point", {})
        raw_lat = point.get("lat")
        raw_lon = point.get("lon")
        new_lat = safe_float(raw_lat)
        new_lon = safe_float(raw_lon)
        if new_lat is None or new_lon is None:
            logger.warning("Dropping message for uid=%s: missing or invalid lat/lon (lat=%r, lon=%r)", uid, raw_lat, raw_lon)
            self.stats["errors"] += 1
            return

        if self.delta_engine.should_filter_as_jitter(
            uid, new_lat, new_lon, prev_clause, ce, le
        ):
            self.stats["jitter_filtered"] += 1
            return  # Drop jitter message

        # Step 3: Evaluate state changes
        state_changes = self.evaluator.evaluate_transitions(uid, message, prev_clause)

        if not state_changes:
            # No state changes detected: update cache but don't emit
            new_hae = safe_float(point.get("hae"), default=0.0)
            track = detail.get("track", {})
            status = detail.get("status", {})

            clause = MedialClause(
                uid=uid,
                time=message.get("time", 0),
                source=source,
                predicate_type=message.get("type", ""),
                lat=new_lat,
                lon=new_lon,
                hae=new_hae,
                adverbial_context={
                    "speed": safe_float(track.get("speed"), default=0.0),
                    "course": safe_float(track.get("course"), default=0.0),
                    "altitude": new_hae,
                    "battery_pct": safe_float(status.get("battery"), default=100.0),
                },
            )
            await self.delta_engine.cache_medial_clause(clause)
            return

        # Step 4: Emit state-change clauses
        success = await self.emitter.emit_state_change(
            uid=uid,
            source=source,
            state_changes=state_changes,
            new_state=message,
            prev_clause=prev_clause,
        )

        if success:
            self.stats["state_changes_emitted"] += 1

            # Update cache with new state
            new_hae = safe_float(point.get("hae"), default=0.0)
            track = detail.get("track", {})
            status = detail.get("status", {})

            clause = MedialClause(
                uid=uid,
                time=message.get("time", 0),
                source=source,
                predicate_type=message.get("type", ""),
                lat=new_lat,
                lon=new_lon,
                hae=new_hae,
                adverbial_context={
                    "speed": safe_float(track.get("speed"), default=0.0),
                    "course": safe_float(track.get("course"), default=0.0),
                    "altitude": new_hae,
                    "battery_pct": safe_float(status.get("battery"), default=100.0),
                },
                state_change_reason=state_changes[0].reason if state_changes else None,
            )
            await self.delta_engine.cache_medial_clause(clause)

    async def flush_batch(self):
        """Flush pending batch (currently unused, but kept for future optimization)."""
        self.message_batch.clear()
        self.last_flush_time = asyncio.get_event_loop().time()

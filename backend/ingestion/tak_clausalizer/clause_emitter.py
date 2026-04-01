"""
Clause Emitter: Formats medial clauses and emits to Redpanda topic.
Ensures TAK Protobuf schema compatibility for downstream consumption.
"""

import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

from aiokafka import AIOKafkaProducer

from delta_engine import MedialClause
from state_change_evaluator import StateChangeEvent
from utils import safe_float

logger = logging.getLogger(__name__)


class ClauseEmitter:
    """Emits state-change clauses to Redpanda topic for downstream consumption."""

    def __init__(self, kafka_brokers: str, topic_name: str = "clausal_chains_state_changes"):
        self.kafka_brokers = kafka_brokers
        self.topic_name = topic_name
        self.producer: Optional[AIOKafkaProducer] = None

    async def connect(self):
        """Connect to Kafka broker."""
        self.producer = AIOKafkaProducer(bootstrap_servers=self.kafka_brokers)
        await self.producer.start()
        logger.info(f"ClauseEmitter connected to {self.kafka_brokers}, topic={self.topic_name}")

    async def disconnect(self):
        """Disconnect from Kafka broker."""
        if self.producer:
            await self.producer.stop()

    async def emit_state_change(
        self,
        uid: str,
        source: str,
        state_changes: List[StateChangeEvent],
        new_state: dict,
        prev_clause: Optional[MedialClause],
    ) -> bool:
        """
        Format medial clause and emit to Kafka topic.

        Args:
            uid: Entity identifier
            source: Source type ('TAK_ADSB', 'TAK_AIS', 'GDELT')
            state_changes: List of detected state-change events
            new_state: New TAK message dict
            prev_clause: Previous medial clause (for comparison)

        Returns:
            True if successful, False otherwise
        """
        if not self.producer:
            logger.error("Producer not connected")
            return False

        if not state_changes:
            # No state changes detected
            return False

        try:
            # Extract fields from new_state
            new_type = new_state.get("type", "")
            new_point = new_state.get("point", {})
            new_lat = safe_float(new_point.get("lat"))
            new_lon = safe_float(new_point.get("lon"))
            new_hae = safe_float(new_point.get("hae"), default=0.0)
            new_detail = new_state.get("detail", {})
            new_track = new_detail.get("track", {})
            new_status = new_detail.get("status", {})

            # Primary state-change reason
            primary_reason = state_changes[0].reason if state_changes else "UNKNOWN"

            # Build adverbial context
            adverbial_context = {
                "speed": safe_float(new_track.get("speed"), default=0.0),
                "course": safe_float(new_track.get("course"), default=0.0),
                "altitude": new_hae,
                "battery_pct": safe_float(new_status.get("battery"), default=100.0),
                "confidence": max(
                    event.confidence for event in state_changes
                ) if state_changes else 0.85,
                "state_change_reasons": [event.reason for event in state_changes],
            }

            # Build medial clause (JSON)
            # Prefer the observation timestamp from the TAK message so that
            # ordering and correlation are accurate during backfill/replay.
            # Only fall back to the current wall-clock time when the message
            # carries no parseable timestamp.
            raw_event_time = new_state.get("time")
            _MIN_TS_S = 946_684_800.0   # 2000-01-01 UTC
            _MAX_TS_S = 4_102_444_800.0  # 2100-01-01 UTC
            try:
                if isinstance(raw_event_time, (int, float)):
                    # TAK COT time is typically milliseconds since epoch.
                    # Detect seconds vs ms: values > _MAX_TS_S are almost certainly ms.
                    ts_s = raw_event_time / 1000 if raw_event_time > _MAX_TS_S else raw_event_time
                    if not (_MIN_TS_S <= ts_s <= _MAX_TS_S):
                        raise ValueError(f"timestamp {ts_s} outside plausible range")
                    event_ts = datetime.fromtimestamp(ts_s, tz=timezone.utc).isoformat()
                elif isinstance(raw_event_time, str) and raw_event_time:
                    # Accept ISO strings as-is (normalise 'Z' suffix)
                    event_ts = raw_event_time.replace("Z", "+00:00")
                else:
                    raise ValueError("no usable time field")
            except (TypeError, ValueError, OSError):
                event_ts = datetime.now(timezone.utc).isoformat()

            clause = {
                "time": event_ts,
                "uid": uid,
                "source": source,
                "predicate_type": new_type,
                "locative_lat": new_lat,
                "locative_lon": new_lon,
                "locative_hae": new_hae,
                "state_change_reason": primary_reason,
                "adverbial_context": adverbial_context,
            }

            # Serialize to JSON
            message_bytes = json.dumps(clause).encode("utf-8")

            # Emit to Kafka with UID as partition key (ensures ordering per entity)
            await self.producer.send_and_wait(
                self.topic_name,
                value=message_bytes,
                key=uid.encode("utf-8"),
            )

            logger.debug(
                f"Emitted state-change for {uid}: {primary_reason} (confidence={adverbial_context['confidence']:.2f})"
            )
            return True

        except Exception as e:
            logger.error(f"Error emitting state-change for {uid}: {e}")
            return False

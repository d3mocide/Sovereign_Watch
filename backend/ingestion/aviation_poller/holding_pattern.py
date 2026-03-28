"""
Holding Pattern Detection — Aircraft Circulation Analysis (Ingest-05).

Maintains a rolling time window of heading changes per aircraft.
Detects when cumulative turn angle exceeds threshold (e.g., >300°) within window.
Publishes detected holding patterns to Redis for frontend/API layer.

Detection logic:
  - Track heading changes per aircraft over rolling window (default: 5 min)
  - Accumulate turn angle (shortest path between headings, handles 360° wraparound)
  - Trigger: total_turn ≥ HOLDING_PATTERN_THRESHOLD (default: 300°)
  - Only flag if min_velocity_knots threshold met (default: no minimum)

Confidence scoring (0.0–1.0):
  - Base: min(turns_completed / 1.5, 1.0)  # 1.5 complete circles = high confidence
  - Bonus +0.15 if pattern duration ≥ 2 min (sustained pattern)
  - Bonus +0.1 if turn consistency high (avg turn rate stable)
  - Clamped to [0.2, 1.0]
"""

import json
import logging
import os
import time
from collections import deque
from typing import Dict, Optional

import h3
import redis.asyncio as aioredis

logger = logging.getLogger("holding_pattern_detector")


def _env_int(name: str, default: int, *, min_value: int, max_value: int) -> int:
    """Read and clamp integer env values to avoid invalid detector configs."""
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        logger.warning("Invalid %s=%r, using default=%s", name, raw, default)
        return default
    return max(min_value, min(value, max_value))


def _env_float(
    name: str, default: float, *, min_value: float, max_value: float
) -> float:
    """Read and clamp float env values to avoid invalid detector configs."""
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError:
        logger.warning("Invalid %s=%r, using default=%s", name, raw, default)
        return default
    return max(min_value, min(value, max_value))


# Thresholds & Configuration (set via ENV in docker-compose/.env)
HOLDING_WINDOW_S = _env_int("HOLDING_WINDOW_S", 300, min_value=60, max_value=3600)
HOLDING_PATTERN_THRESHOLD = _env_int(
    "HOLDING_PATTERN_THRESHOLD", 360, min_value=180, max_value=1080
)
MIN_VELOCITY_KNOTS = _env_float(
    "MIN_VELOCITY_KNOTS", 0.0, min_value=0.0, max_value=450.0
)
HEADING_CHANGE_THRESHOLD = _env_float(
    "HEADING_CHANGE_THRESHOLD", 2.0, min_value=0.5, max_value=30.0
)
MIN_CIRCLE_DURATION = _env_int("MIN_CIRCLE_DURATION", 60, min_value=0, max_value=1800)
MIN_DIRECTIONAL_CONSISTENCY = _env_float(
    "MIN_DIRECTIONAL_CONSISTENCY", 0.7, min_value=0.5, max_value=1.0
)

# H3 resolution for zone grouping (same as jamming for consistency)
H3_RESOLUTION = 6

# Redis TTL for active zones (2x the detection window)
ACTIVE_ZONES_TTL = HOLDING_WINDOW_S * 2


class HoldingPatternDetector:
    """
    Stateful detector that tracks heading changes per aircraft
    and identifies sustained holding patterns (circling).
    """

    def __init__(self, redis_url: str):
        self._redis_url = redis_url
        self._redis: Optional[aioredis.Redis] = None

        # Per-aircraft state: {hex_id: {
        #   'heading_history': deque of (timestamp, heading),
        #   'last_recorded_heading': float,
        #   'total_turn': float,  # Cumulative turn angle
        #   'in_holding': bool,
        #   'lat': float, 'lon': float,  # Last known position
        #   'speed': float,  # Last known speed (knots)
        #   'callsign': str,  # Callsign for alerts
        #   'altitude': float,  # Last known altitude
        #   'pattern_start_time': float,  # When pattern was first detected
        # }}
        self._aircraft_state: Dict[str, Dict] = {}

    async def start(self):
        self._redis = await aioredis.from_url(self._redis_url, decode_responses=True)

    async def close(self):
        if self._redis:
            await self._redis.aclose()

    @staticmethod
    def _normalize_heading(heading: float) -> float:
        """Normalize heading to [0, 360) range."""
        return (heading % 360.0 + 360.0) % 360.0

    @staticmethod
    def _shortest_turn_angle(prev_heading: float, curr_heading: float) -> float:
        """
        Calculate the shortest angle between two headings.
        Always returns positive angle (0 to 180).
        Example: 350° → 10° = 20° (not 340°)
        """
        prev_heading = HoldingPatternDetector._normalize_heading(prev_heading)
        curr_heading = HoldingPatternDetector._normalize_heading(curr_heading)

        diff = abs(curr_heading - prev_heading)
        # Take the shorter arc
        return min(diff, 360 - diff)

    @staticmethod
    def _signed_turn_angle(prev_heading: float, curr_heading: float) -> float:
        """
        Calculate signed turn angle in range [-180, 180].
        Positive = clockwise/right turn, negative = counter-clockwise/left turn.
        """
        prev_heading = HoldingPatternDetector._normalize_heading(prev_heading)
        curr_heading = HoldingPatternDetector._normalize_heading(curr_heading)
        return (curr_heading - prev_heading + 540.0) % 360.0 - 180.0

    @staticmethod
    def _directional_consistency(state: Dict) -> float:
        """Return ratio of dominant turn direction in [0.0, 1.0]."""
        cw = float(state.get("clockwise_turn", 0.0))
        ccw = float(state.get("counterclockwise_turn", 0.0))
        total = cw + ccw
        if total <= 0:
            return 0.0
        return max(cw, ccw) / total

    def _recalculate_window_metrics(self, state: Dict) -> None:
        """Rebuild turn totals from in-window heading history."""
        history = state.get("heading_history", deque())
        if len(history) < 2:
            state["total_turn"] = 0.0
            state["clockwise_turn"] = 0.0
            state["counterclockwise_turn"] = 0.0
            state["first_turn_time"] = None
            return

        total_turn = 0.0
        clockwise_turn = 0.0
        counterclockwise_turn = 0.0
        first_turn_time = None

        for i in range(1, len(history)):
            prev_ts, prev_heading = history[i - 1]
            curr_ts, curr_heading = history[i]
            signed = self._signed_turn_angle(prev_heading, curr_heading)
            angle = abs(signed)
            if angle < HEADING_CHANGE_THRESHOLD:
                continue
            if first_turn_time is None:
                first_turn_time = curr_ts
            total_turn += angle
            if signed >= 0:
                clockwise_turn += angle
            else:
                counterclockwise_turn += angle

        state["total_turn"] = total_turn
        state["clockwise_turn"] = clockwise_turn
        state["counterclockwise_turn"] = counterclockwise_turn
        state["first_turn_time"] = first_turn_time

    def ingest(
        self,
        hex_id: str,
        heading: Optional[float],
        speed: float,
        lat: float,
        lon: float,
        altitude: Optional[float] = None,
        callsign: Optional[str] = None,
        timestamp: Optional[float] = None,
    ) -> None:
        """
        Record a new ADS-B observation with heading and position.
        Called from the aviation poller's process_aircraft_batch for every aircraft.
        """
        if timestamp is None:
            timestamp = time.time()

        if heading is None or speed < MIN_VELOCITY_KNOTS:
            # Clear state if speed drops below minimum
            if hex_id in self._aircraft_state:
                self._aircraft_state[hex_id]["in_holding"] = False
            return

        heading = self._normalize_heading(heading)

        # Initialize state if new aircraft
        if hex_id not in self._aircraft_state:
            self._aircraft_state[hex_id] = {
                "heading_history": deque(),
                "last_recorded_heading": heading,
                "total_turn": 0.0,
                "clockwise_turn": 0.0,
                "counterclockwise_turn": 0.0,
                "first_turn_time": None,
                "in_holding": False,
                "lat": lat,
                "lon": lon,
                "speed": speed,
                "callsign": callsign or "",
                "altitude": altitude or 0,
                "pattern_start_time": None,
            }
            return

        state = self._aircraft_state[hex_id]
        state["lat"] = lat
        state["lon"] = lon
        state["speed"] = speed
        state["callsign"] = callsign or state["callsign"]
        state["altitude"] = altitude or state["altitude"]

        # Only process if heading changed by at least HEADING_CHANGE_THRESHOLD
        signed_turn = self._signed_turn_angle(state["last_recorded_heading"], heading)
        turn_angle = abs(signed_turn)
        if turn_angle < HEADING_CHANGE_THRESHOLD:
            return

        state["last_recorded_heading"] = heading
        state["heading_history"].append((timestamp, heading))

        # Accumulate turn angle
        state["total_turn"] += turn_angle
        if signed_turn >= 0:
            state["clockwise_turn"] += turn_angle
        else:
            state["counterclockwise_turn"] += turn_angle
        if state["first_turn_time"] is None:
            state["first_turn_time"] = timestamp

        circling_duration = 0.0
        if state["first_turn_time"] is not None:
            circling_duration = max(0.0, timestamp - state["first_turn_time"])
        directional_consistency = self._directional_consistency(state)

        # Check if pattern detected (turn amount + sustained duration + consistent turn direction)
        if (
            state["total_turn"] >= HOLDING_PATTERN_THRESHOLD
            and circling_duration >= MIN_CIRCLE_DURATION
            and directional_consistency >= MIN_DIRECTIONAL_CONSISTENCY
        ):
            if not state["in_holding"]:
                state["in_holding"] = True
                state["pattern_start_time"] = timestamp
                logger.debug(
                    f"Holding pattern detected for {hex_id} ({callsign}): "
                    f"total_turn={state['total_turn']:.1f}°, "
                    f"duration={circling_duration:.1f}s, "
                    f"directional_consistency={directional_consistency:.2f}"
                )
        elif state["in_holding"]:
            # Exit hold state if criteria no longer met inside rolling window.
            state["in_holding"] = False
            state["pattern_start_time"] = None

    def _evict_stale(self) -> None:
        """Remove observations older than WINDOW_SECONDS and stale aircraft entries."""
        now = time.time()
        cutoff = now - HOLDING_WINDOW_S
        empty_aircraft = []

        for hex_id, state in self._aircraft_state.items():
            # Evict old heading observations
            state["heading_history"] = deque(
                (ts, h) for ts, h in state["heading_history"] if ts >= cutoff
            )

            # Recompute metrics so total_turn remains truly window-scoped.
            self._recalculate_window_metrics(state)

            # Check if aircraft is stale (no updates in 30s)
            last_observation = (
                state["heading_history"][-1][0] if state["heading_history"] else 0
            )
            if now - last_observation > 30:
                # Reset pattern state for stale aircraft
                state["total_turn"] = 0.0
                state["clockwise_turn"] = 0.0
                state["counterclockwise_turn"] = 0.0
                state["first_turn_time"] = None
                state["in_holding"] = False
                state["pattern_start_time"] = None

                # Remove if completely stale (no data in 5 min)
                if now - last_observation > HOLDING_WINDOW_S:
                    empty_aircraft.append(hex_id)

        for hex_id in empty_aircraft:
            del self._aircraft_state[hex_id]

    def is_holding_pattern(self, hex_id: str) -> bool:
        """Check if aircraft is currently in a holding pattern."""
        return self._aircraft_state.get(hex_id, {}).get("in_holding", False)

    def get_total_turns(self, hex_id: str) -> float:
        """Get total accumulated turn angle for aircraft."""
        return self._aircraft_state.get(hex_id, {}).get("total_turn", 0.0)

    def _calculate_confidence(self, hex_id: str, duration: float) -> float:
        """
        Calculate confidence score (0.0-1.0) for holding pattern.
        Base on number of complete circles and pattern duration.
        """
        state = self._aircraft_state.get(hex_id, {})
        total_turn = state.get("total_turn", 0.0)

        # Base: number of complete turns (360° per turn)
        turns_completed = total_turn / 360.0
        confidence = min(turns_completed / 1.5, 1.0)  # 1.5 turns = high confidence

        # Bonus: sustained pattern (≥2 min)
        if duration >= MIN_CIRCLE_DURATION:
            confidence = min(confidence + 0.15, 1.0)

        # Calculate turn consistency (if we have history)
        heading_history = state.get("heading_history", deque())
        if len(heading_history) >= 2:
            # Measure variance of turn angles
            turn_angles = []
            for i in range(1, len(heading_history)):
                prev_ts, prev_h = heading_history[i - 1]
                curr_ts, curr_h = heading_history[i]
                angle = self._shortest_turn_angle(prev_h, curr_h)
                turn_angles.append(angle)

            if turn_angles:
                avg_turn = sum(turn_angles) / len(turn_angles)
                # Low variance = consistent circular pattern
                variance = sum((a - avg_turn) ** 2 for a in turn_angles) / len(
                    turn_angles
                )
                std_dev = variance**0.5
                # Bonus if low std dev (≤10° variation)
                if std_dev <= 10:
                    confidence = min(confidence + 0.1, 1.0)

        return max(confidence, 0.2)  # Minimum 0.2 if pattern detected

    async def analyze_and_publish(self) -> list:
        """
        Evaluate all active aircraft and publish detected holding patterns to Redis.
        Returns the list of zone dicts for logging.
        """
        self._evict_stale()

        if not self._redis:
            return []

        zones = []
        now = time.time()

        for hex_id, state in self._aircraft_state.items():
            if not state["in_holding"]:
                continue

            # Calculate pattern duration
            pattern_start = state.get("pattern_start_time", now)
            duration = now - pattern_start

            # Calculate confidence
            confidence = self._calculate_confidence(hex_id, duration)

            # Get H3 cell for grouping
            try:
                cell = h3.latlng_to_cell(state["lat"], state["lon"], H3_RESOLUTION)
            except Exception:
                cell = None

            zones.append(
                {
                    "hex_id": hex_id,
                    "callsign": state["callsign"],
                    "centroid_lat": state["lat"],
                    "centroid_lon": state["lon"],
                    "altitude": int(state["altitude"]),
                    "speed": round(state["speed"], 1),
                    "total_turn_degrees": round(state["total_turn"], 1),
                    "turns_completed": round(state["total_turn"] / 360.0, 2),
                    "pattern_duration_sec": int(duration),
                    "confidence": round(confidence, 3),
                    "directional_consistency": round(
                        self._directional_consistency(state), 3
                    ),
                    "h3_index": cell,
                    "active": True,
                    "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            )

        # Write to Redis as GeoJSON FeatureCollection
        features = [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [z["centroid_lon"], z["centroid_lat"]],
                },
                "properties": {
                    k: v
                    for k, v in z.items()
                    if k not in ("centroid_lat", "centroid_lon")
                },
            }
            for z in zones
        ]
        geojson = {"type": "FeatureCollection", "features": features}
        await self._redis.setex(
            "holding_pattern:active_zones",
            ACTIVE_ZONES_TTL,
            json.dumps(geojson),
        )

        if zones:
            logger.info("Holding pattern analysis: %d active pattern(s)", len(zones))

        return zones

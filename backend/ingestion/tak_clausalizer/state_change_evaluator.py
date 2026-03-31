"""
State Change Evaluator: Detects semantic transitions in TAK telemetry.
Evaluates type code changes, H3 boundary crosses, adverbial thresholds.
"""

import logging
from dataclasses import dataclass
from typing import List, Optional

import h3

from delta_engine import MedialClause
from utils import safe_float

logger = logging.getLogger(__name__)


@dataclass
class StateChangeEvent:
    """Represents a detected state-change."""

    reason: str  # LOCATION_TRANSITION, TYPE_CHANGE, SPEED_TRANSITION, etc.
    confidence: float  # 0.0 - 1.0
    details: dict  # Additional context


class StateChangeEvaluator:
    """
    Evaluates incoming TAK messages for state transitions.
    Classifies state changes by type, geospatial, and adverbial criteria.
    """

    # H3 resolution for geofence boundaries
    H3_RESOLUTION = 9

    # Thresholds
    SPEED_STATIONARY_MS = 0.5  # < 0.5 m/s = stationary
    COURSE_CHANGE_DEG = 30.0  # > 30° delta = direction change
    ALTITUDE_CHANGE_M = 500.0  # > 500m delta = altitude change
    BATTERY_CRITICAL_PCT = 20.0  # < 20% = critical

    def __init__(self):
        pass

    def evaluate_transitions(
        self,
        uid: str,
        new_state: dict,
        prev_clause: Optional[MedialClause],
    ) -> List[StateChangeEvent]:
        """
        Evaluate incoming TAK message for state changes.
        Returns list of detected state-change events.

        Args:
            uid: Entity identifier
            new_state: New TAK message dict with keys: type, point, detail, time
            prev_clause: Previous cached medial clause

        Returns:
            List of StateChangeEvent objects
        """
        events: List[StateChangeEvent] = []

        if prev_clause is None:
            # First observation: no baseline to compare
            return events

        # Extract new state fields
        new_type = new_state.get("type", "")
        new_point = new_state.get("point", {})
        new_lat = safe_float(new_point.get("lat"))
        new_lon = safe_float(new_point.get("lon"))
        new_detail = new_state.get("detail", {})
        new_track = new_detail.get("track", {})
        new_speed = safe_float(new_track.get("speed"), default=0.0)
        new_course = safe_float(new_track.get("course"), default=0.0)
        new_status = new_detail.get("status", {})
        new_battery = safe_float(new_status.get("battery"), default=100.0)

        # 1. Type Code Change Detection
        if new_type != prev_clause.predicate_type:
            events.append(
                StateChangeEvent(
                    reason="TYPE_CHANGE",
                    confidence=0.95,
                    details={
                        "previous_type": prev_clause.predicate_type,
                        "new_type": new_type,
                    },
                )
            )

        # 2. H3 Geofence Boundary Cross
        if self._detect_h3_boundary_cross(
            prev_clause.lat, prev_clause.lon, new_lat, new_lon
        ):
            events.append(
                StateChangeEvent(
                    reason="LOCATION_TRANSITION",
                    confidence=0.90,
                    details={
                        "previous_h3": h3.latlng_to_cell(
                            prev_clause.lat, prev_clause.lon, self.H3_RESOLUTION
                        ),
                        "new_h3": h3.latlng_to_cell(
                            new_lat, new_lon, self.H3_RESOLUTION
                        ),
                    },
                )
            )

        # 3. Speed State Transition (stationary <-> moving)
        prev_speed = safe_float(
            prev_clause.adverbial_context.get("speed"), default=0.0
        )
        if self._detect_speed_transition(prev_speed, new_speed):
            events.append(
                StateChangeEvent(
                    reason="SPEED_TRANSITION",
                    confidence=0.85,
                    details={
                        "previous_speed": prev_speed,
                        "new_speed": new_speed,
                        "threshold": self.SPEED_STATIONARY_MS,
                    },
                )
            )

        # 4. Course Change
        prev_course = safe_float(
            prev_clause.adverbial_context.get("course"), default=0.0
        )
        if self._detect_course_change(prev_course, new_course):
            events.append(
                StateChangeEvent(
                    reason="COURSE_CHANGE",
                    confidence=0.80,
                    details={
                        "previous_course": prev_course,
                        "new_course": new_course,
                        "delta": abs(new_course - prev_course),
                        "threshold": self.COURSE_CHANGE_DEG,
                    },
                )
            )

        # 5. Altitude Change
        prev_alt = safe_float(prev_clause.adverbial_context.get("altitude"), default=0.0)
        if self._detect_altitude_change(prev_alt, new_state.get("point", {}).get("hae", 0.0)):
            alt_delta = abs(new_state.get("point", {}).get("hae", 0.0) - prev_alt)
            events.append(
                StateChangeEvent(
                    reason="ALTITUDE_CHANGE",
                    confidence=0.85,
                    details={
                        "previous_altitude": prev_alt,
                        "new_altitude": new_state.get("point", {}).get("hae", 0.0),
                        "delta": alt_delta,
                        "threshold": self.ALTITUDE_CHANGE_M,
                    },
                )
            )

        # 6. Battery Critical
        prev_battery = safe_float(
            prev_clause.adverbial_context.get("battery_pct"), default=100.0
        )
        if self._detect_battery_critical(prev_battery, new_battery):
            events.append(
                StateChangeEvent(
                    reason="BATTERY_CRITICAL",
                    confidence=0.95,
                    details={
                        "previous_battery": prev_battery,
                        "new_battery": new_battery,
                        "threshold": self.BATTERY_CRITICAL_PCT,
                    },
                )
            )

        return events

    def _detect_h3_boundary_cross(
        self, lat1: float, lon1: float, lat2: float, lon2: float
    ) -> bool:
        """Check if H3 cell changed between positions."""
        try:
            cell1 = h3.latlng_to_cell(lat1, lon1, self.H3_RESOLUTION)
            cell2 = h3.latlng_to_cell(lat2, lon2, self.H3_RESOLUTION)
            return cell1 != cell2
        except Exception as e:
            logger.warning(f"Error detecting H3 boundary cross: {e}")
            return False

    def _detect_type_change(self, type1: str, type2: str) -> bool:
        """Check if TAK type code changed."""
        return type1 != type2

    def _detect_speed_transition(self, prev_speed: float, new_speed: float) -> bool:
        """Detect transition between stationary and moving."""
        prev_stationary = prev_speed < self.SPEED_STATIONARY_MS
        new_stationary = new_speed < self.SPEED_STATIONARY_MS
        return prev_stationary != new_stationary

    def _detect_course_change(self, prev_course: float, new_course: float) -> bool:
        """Detect significant heading change."""
        delta = abs(new_course - prev_course)
        # Handle wraparound at 360 degrees
        if delta > 180:
            delta = 360 - delta
        return delta > self.COURSE_CHANGE_DEG

    def _detect_altitude_change(self, prev_alt: float, new_alt: float) -> bool:
        """Detect significant altitude change."""
        delta = abs(new_alt - prev_alt)
        return delta > self.ALTITUDE_CHANGE_M

    def _detect_battery_critical(self, prev_battery: float, new_battery: float) -> bool:
        """Detect battery crossing critical threshold."""
        prev_critical = prev_battery < self.BATTERY_CRITICAL_PCT
        new_critical = new_battery < self.BATTERY_CRITICAL_PCT
        return prev_critical != new_critical

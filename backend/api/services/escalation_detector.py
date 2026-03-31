"""
Escalation Detector: Identifies prototypical escalation patterns and anomalies.
Cross-references GDELT event sequences with TAK behavioral anomalies.
"""

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import h3

logger = logging.getLogger(__name__)


@dataclass
class AnomalyMetric:
    """Quantifies anomaly severity in a region."""

    metric_type: str  # 'clustering', 'directional_change', 'emergency', etc.
    score: float  # 0.0 - 1.0
    affected_uids: List[str]
    description: str


class EscalationDetector:
    """Detects escalation patterns and anomalies in multi-INT data."""

    # Prototypical escalation sequences (GDELT CAMEO codes)
    ESCALATION_PATTERNS = [
        ["PROTEST", "POLICE_DEPLOYMENT", "VIOLENT_CLASHES"],
        ["DEMONSTRATE", "LAW_ENFORCEMENT", "ARRESTS"],
        ["STRIKE", "MILITARY_MOBILIZATION"],
        ["ARMED_CONFLICT", "CIVILIAN_CASUALTIES"],
        ["CURFEW", "ARMED_POLICE", "GUNFIRE"],
    ]

    # H3 resolution for anomaly detection
    H3_ANOMALY_RES = 9

    # Thresholds
    CLUSTERING_THRESHOLD = 5  # Entities to trigger clustering anomaly
    CLUSTERING_DISTANCE_M = 2000.0  # 2 km radius
    EMERGENCY_TRANSPONDER_CODES = ["7700", "7600", "7500"]  # Aviation emergency codes

    def __init__(self):
        pass

    def detect_pattern(
        self, gdelt_events: List[Dict]
    ) -> Tuple[Optional[List[Dict]], float]:
        """
        Detect prototypical escalation patterns in GDELT events.

        Args:
            gdelt_events: List of GDELT events with 'event_code' field

        Returns:
            Tuple of (matching_pattern, confidence_0_to_1)
        """
        if not gdelt_events or len(gdelt_events) < 2:
            return None, 0.0

        # Extract event codes in temporal order
        event_codes = [e.get("event_code", "").upper() for e in gdelt_events]
        event_codes = [c for c in event_codes if c]  # Filter empty

        # Check for pattern matches
        best_match = None
        best_confidence = 0.0

        for pattern in self.ESCALATION_PATTERNS:
            confidence, match_indices = self._match_pattern(event_codes, pattern)
            if confidence > best_confidence:
                best_confidence = confidence
                best_match = [gdelt_events[i] for i in match_indices]

        return best_match, best_confidence

    def _match_pattern(self, event_codes: List[str], pattern: List[str]) -> Tuple[float, List[int]]:
        """
        Match event sequence against pattern (allowing gaps).

        Returns:
            Tuple of (confidence, match_indices)
        """
        if len(pattern) > len(event_codes):
            return 0.0, []

        # Simple substring matching with some tolerance
        match_indices = []
        pattern_idx = 0

        for event_idx, code in enumerate(event_codes):
            if pattern_idx >= len(pattern):
                break

            pattern_code = pattern[pattern_idx]
            if code.startswith(pattern_code) or pattern_code in code:
                match_indices.append(event_idx)
                pattern_idx += 1

        # Confidence based on how many pattern elements matched
        confidence = len(match_indices) / len(pattern)
        if confidence >= 0.5:  # Require at least 50% match
            return confidence, match_indices

        return 0.0, []

    def detect_anomaly_concentration(
        self,
        tak_clauses: List[Dict],
        h3_cell: Optional[str] = None,
    ) -> AnomalyMetric:
        """
        Detect sudden clustering of TAK entities in spatial region.

        Args:
            tak_clauses: List of TAK medial clauses
            h3_cell: Optional H3 cell to query (if None, analyzes all)

        Returns:
            AnomalyMetric quantifying clustering anomaly
        """
        if not tak_clauses:
            return AnomalyMetric(
                metric_type="clustering",
                score=0.0,
                affected_uids=[],
                description="No TAK data",
            )

        # Group by H3 cell
        cell_clusters: Dict[str, List[str]] = {}
        for clause in tak_clauses:
            lat = clause.get("locative_lat")
            lon = clause.get("locative_lon")
            uid = clause.get("uid")

            if lat is None or lon is None or not uid:
                continue

            try:
                cell = h3.latlng_to_cell(lat, lon, self.H3_ANOMALY_RES)
                if cell not in cell_clusters:
                    cell_clusters[cell] = []
                cell_clusters[cell].append(uid)
            except Exception as e:
                logger.warning(f"Error grouping TAK clause to H3: {e}")

        # Find most densely populated cell
        if not cell_clusters:
            return AnomalyMetric(
                metric_type="clustering",
                score=0.0,
                affected_uids=[],
                description="No valid TAK positions",
            )

        densest_cell = max(cell_clusters.items(), key=lambda x: len(x[1]))
        cell_id, uids = densest_cell

        # Score based on concentration
        unique_uids = list(set(uids))
        if len(unique_uids) < self.CLUSTERING_THRESHOLD:
            return AnomalyMetric(
                metric_type="clustering",
                score=0.0,
                affected_uids=unique_uids,
                description=f"Insufficient clustering ({len(unique_uids)} < {self.CLUSTERING_THRESHOLD})",
            )

        # Normalize score (0.0 - 1.0)
        max_expected = 100  # Arbitrary high threshold for saturation
        score = min(len(unique_uids) / max_expected, 1.0)

        return AnomalyMetric(
            metric_type="clustering",
            score=score,
            affected_uids=unique_uids,
            description=f"{len(unique_uids)} entities clustered in H3 cell {cell_id}",
        )

    def detect_directional_anomalies(
        self, tak_clauses: List[Dict]
    ) -> List[AnomalyMetric]:
        """Detect sudden heading/course changes."""
        anomalies = []

        if not tak_clauses or len(tak_clauses) < 2:
            return anomalies

        # Group by UID
        uid_traces: Dict[str, List[Dict]] = {}
        for clause in tak_clauses:
            uid = clause.get("uid")
            if uid:
                if uid not in uid_traces:
                    uid_traces[uid] = []
                uid_traces[uid].append(clause)

        # Check each trace for anomalies
        for uid, trace in uid_traces.items():
            if len(trace) < 2:
                continue

            # Look for sudden course changes
            recent = trace[-1]
            prev = trace[-2]

            prev_course = prev.get("adverbial_context", {}).get("course", 0.0)
            curr_course = recent.get("adverbial_context", {}).get("course", 0.0)

            delta = abs(curr_course - prev_course)
            if delta > 180:
                delta = 360 - delta  # Handle wraparound

            if delta > 90:  # >90 degree change
                anomalies.append(
                    AnomalyMetric(
                        metric_type="directional_change",
                        score=min(delta / 180, 1.0),  # Normalize to 0-1
                        affected_uids=[uid],
                        description=f"{uid}: {delta:.0f}° course change",
                    )
                )

        return anomalies

    def detect_emergency_transponders(self, tak_clauses: List[Dict]) -> List[AnomalyMetric]:
        """Detect aviation emergency transponder codes (7700, 7600, 7500)."""
        anomalies = []

        for clause in tak_clauses:
            adverbial = clause.get("adverbial_context", {})
            # Check if classification contains emergency code
            classification = clause.get("detail", {}).get("classification", {})
            squawk = classification.get("squawk", "")

            if squawk in self.EMERGENCY_TRANSPONDER_CODES:
                anomalies.append(
                    AnomalyMetric(
                        metric_type="emergency",
                        score=1.0,  # High confidence emergency
                        affected_uids=[clause.get("uid")],
                        description=f"{clause.get('uid')}: Emergency transponder {squawk}",
                    )
                )

        return anomalies

    def compute_risk_score(
        self,
        pattern_confidence: float,
        anomaly_score: float,
        alignment_score: float,
        anomaly_count: int = 0,
    ) -> float:
        """
        Compute composite risk score from pattern matching and anomalies.

        Args:
            pattern_confidence: GDELT escalation pattern confidence (0.0 - 1.0)
            anomaly_score: TAK behavioral anomaly score (0.0 - 1.0)
            alignment_score: Spatial-temporal alignment score (0.0 - 1.0)
            anomaly_count: Number of distinct anomalies detected

        Returns:
            Composite risk score (0.0 - 1.0)
        """
        # Weighted combination
        pattern_weight = 0.4
        anomaly_weight = 0.35
        alignment_weight = 0.25

        # Boost score if multiple anomalies
        anomaly_multiplier = 1.0 + (0.1 * min(anomaly_count, 5))

        risk = (
            pattern_weight * pattern_confidence
            + anomaly_weight * anomaly_score * anomaly_multiplier
            + alignment_weight * alignment_score
        )

        # Normalize to 0.0 - 1.0
        return min(risk, 1.0)

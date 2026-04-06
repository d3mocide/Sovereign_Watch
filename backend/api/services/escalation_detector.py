"""
Escalation Detector: Identifies prototypical escalation patterns and anomalies.
Cross-references GDELT event sequences with TAK behavioral anomalies.
"""

import json
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import h3
from services.hmm_trajectory import classify_trajectory
from services.risk_taxonomy import CONVERGENCE_BOOST_PER_DOMAIN
from services.stdbscan import detect_clusters

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

    # Space weather & comms context
    KP_INDEX_THRESHOLD = 6.0  # Kp >= 6 = significant geomagnetic storm
    SATNOGS_SIGNAL_LOSS_DBM = -10.0  # Threshold for signal loss event

    # Maps anomaly metric_type to its intelligence domain.
    # "multi" means the signal is domain-agnostic (behavioural / positional).
    # Only domain-specific signals (non-"multi") count toward convergence boosting.
    ANOMALY_DOMAIN_MAP: Dict[str, str] = {
        "clustering":            "multi",
        "directional_change":    "multi",
        "emergency":             "aviation",
        "rendezvous":            "multi",
        "holding_pattern":       "multi",
        "maneuvering":           "multi",
        "converging":            "multi",
        "stdbscan_cluster":      "multi",
        "hmm_trajectory":        "multi",
        "satellite_signal_loss": "orbital",
        "space_weather":         "orbital",
        "internet_outage":       "infrastructure",
    }

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

    def _match_pattern(
        self, event_codes: List[str], pattern: List[str]
    ) -> Tuple[float, List[int]]:
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
            h3_cell: Optional H3 macro cell (resolution <= H3_ANOMALY_RES).
                     When provided, only clauses whose position maps to a
                     child/descendant of this cell are considered.

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

        # Pre-compute the parent cell for fast child-membership checks when a
        # region filter is requested.
        filter_parent: Optional[str] = None
        filter_res: Optional[int] = None
        if h3_cell:
            try:
                filter_res = h3.get_resolution(h3_cell)
                filter_parent = h3_cell
            except Exception as exc:
                logger.warning(
                    "Invalid h3_cell '%s' for concentration filter: %s", h3_cell, exc
                )

        # Group by H3 cell (at anomaly resolution), optionally filtered to h3_cell region
        cell_clusters: Dict[str, List[str]] = {}
        for clause in tak_clauses:
            lat = clause.get("locative_lat")
            lon = clause.get("locative_lon")
            uid = clause.get("uid")

            if lat is None or lon is None or not uid:
                continue

            try:
                cell = h3.latlng_to_cell(lat, lon, self.H3_ANOMALY_RES)

                # Apply spatial filter: skip clauses outside the requested region
                if filter_parent is not None and filter_res is not None:
                    try:
                        parent_at_filter_res = h3.cell_to_parent(cell, filter_res)
                        if parent_at_filter_res != filter_parent:
                            continue
                    except Exception:
                        continue

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

            def _get_ctx(c: Dict) -> Dict:
                raw = c.get("adverbial_context") or {}
                if isinstance(raw, str):
                    try:
                        return json.loads(raw)
                    except (json.JSONDecodeError, TypeError):
                        return {}
                return raw

            prev_course = _get_ctx(prev).get("course", 0.0)
            curr_course = _get_ctx(recent).get("course", 0.0)

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

    def detect_emergency_transponders(
        self, tak_clauses: List[Dict]
    ) -> List[AnomalyMetric]:
        """Detect aviation emergency transponder codes (7700, 7600, 7500)."""
        anomalies = []

        for clause in tak_clauses:
            # Prefer squawk from adverbial_context (current schema), fallback to detail.classification
            raw_ctx = clause.get("adverbial_context") or {}
            if isinstance(raw_ctx, str):
                try:
                    adverbial_context = json.loads(raw_ctx)
                except (json.JSONDecodeError, TypeError):
                    adverbial_context = {}
            else:
                adverbial_context = raw_ctx

            squawk = adverbial_context.get("squawk")

            if not squawk:
                classification = (
                    clause.get("detail", {}).get("classification", {}) or {}
                )
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

    def detect_internet_outage_correlation(
        self, outage_data: Optional[Dict]
    ) -> AnomalyMetric:
        """
        Detect correlation between TAK movements and internet outages.

        Args:
            outage_data: Internet outage context (country, severity, etc.)

        Returns:
            AnomalyMetric with outage correlation score
        """
        if not outage_data:
            return AnomalyMetric(
                metric_type="internet_outage",
                score=0.0,
                affected_uids=[],
                description="No internet outage data",
            )

        severity = outage_data.get("severity", 0.0)
        country = outage_data.get("country_code", "UNKNOWN")
        asn_name = outage_data.get("asn_name", "")

        return AnomalyMetric(
            metric_type="internet_outage",
            score=severity,  # Use actual severity as score
            affected_uids=[],
            description=f"Internet outage in {country} ({asn_name}): severity={severity:.2f}",
        )

    def detect_space_weather_anomaly(self, kp_index: Optional[float]) -> AnomalyMetric:
        """
        Detect space weather events that could explain GPS/comms anomalies.

        Args:
            kp_index: Kp-index value (0-9)

        Returns:
            AnomalyMetric with space weather impact
        """
        if kp_index is None or kp_index < self.KP_INDEX_THRESHOLD:
            return AnomalyMetric(
                metric_type="space_weather",
                score=0.0,
                affected_uids=[],
                description="Normal space weather conditions",
            )

        # Higher Kp index = higher likelihood of GPS/comms degradation
        normalized_score = min(kp_index / 9.0, 1.0)  # Normalize to 0-1

        categories = {
            6: "G1 - Minor Geomagnetic Storm",
            7: "G2 - Moderate Geomagnetic Storm",
            8: "G3 - Strong Geomagnetic Storm",
            9: "G4/G5 - Severe/Extreme Geomagnetic Storm",
        }
        category = categories.get(int(kp_index), "Extreme Storm")

        return AnomalyMetric(
            metric_type="space_weather",
            score=normalized_score,
            affected_uids=[],
            description=f"Space weather: {category} (Kp={kp_index:.1f})",
        )

    @staticmethod
    def should_suppress_signal_loss(suppression_payload: dict | None) -> bool:
        """
        Return True when the Redis suppress_signal_loss key is active.

        The key is set by SpaceWeatherSource._poll_noaa_scales() whenever
        R-scale >= R3 (Radio Blackout) or G-scale >= G3 (Geomagnetic Storm).
        These events cause widespread satellite signal degradation that would
        otherwise trigger false-positive jamming/interference alerts.

        Args:
            suppression_payload: Decoded JSON from Redis key
              ``space_weather:suppress_signal_loss``, or None if the key is
              absent (TTL expired → no active suppression).
        """
        if not suppression_payload:
            return False
        return bool(suppression_payload.get("active", False))

    def detect_satnogs_signal_loss(
        self, signal_events: Optional[List[Dict]]
    ) -> List[AnomalyMetric]:
        """
        Detect satellite signal loss events (potential jamming/orbital anomaly).

        Args:
            signal_events: SatNOGS observation data

        Returns:
            List of AnomalyMetrics for signal loss events
        """
        anomalies = []

        if not signal_events:
            return anomalies

        for event in signal_events:
            signal_strength = event.get("signal_strength")
            norad_id = event.get("norad_id")
            station = event.get("ground_station_name", "Unknown")

            if signal_strength and signal_strength < self.SATNOGS_SIGNAL_LOSS_DBM:
                anomalies.append(
                    AnomalyMetric(
                        metric_type="satellite_signal_loss",
                        score=min(abs(signal_strength) / 100.0, 1.0),  # Normalize
                        affected_uids=[f"SAT-{norad_id}"],
                        description=f"Signal loss for satellite {norad_id} at {station}: {signal_strength:.1f} dBm",
                    )
                )

        return anomalies

    def detect_rendezvous(
        self,
        tak_clauses: List[Dict],
        window_minutes: int = 30,
    ) -> List[AnomalyMetric]:
        """
        Detect multi-entity rendezvous: two or more distinct UIDs converging
        to the same H3-9 cell within ``window_minutes``.

        A rendezvous is significant when multiple entities (from potentially
        different sources) arrive at the same micro-cell in a short window —
        a pattern associated with coordinated activity, handoffs, or assembly.

        Args:
            tak_clauses: List of TAK medial clauses (dict with 'uid',
                         'locative_lat', 'locative_lon', 'time').
            window_minutes: Look-back window for co-location (default 30 min).

        Returns:
            List of AnomalyMetrics, one per rendezvous cell detected.
        """
        from datetime import datetime, timedelta, timezone

        if not tak_clauses or len(tak_clauses) < 2:
            return []

        # Parse times and group latest clause per UID into H3-9 cells.
        # We keep only the most-recent position for each UID so that a single
        # entity loitering in a cell doesn't inflate the entity count.
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)

        uid_latest: Dict[str, Dict] = {}
        for clause in tak_clauses:
            uid = clause.get("uid")
            if not uid:
                continue

            raw_time = clause.get("time")
            try:
                if isinstance(raw_time, datetime):
                    clause_time = (
                        raw_time
                        if raw_time.tzinfo
                        else raw_time.replace(tzinfo=timezone.utc)
                    )
                else:
                    ts = str(raw_time or "").replace("Z", "+00:00")
                    clause_time = datetime.fromisoformat(ts)
            except (TypeError, ValueError, AttributeError):
                continue

            if clause_time < cutoff:
                continue

            # Keep the most recent observation per UID
            prev = uid_latest.get(uid)
            if prev is None or clause_time > prev["_time"]:
                uid_latest[uid] = {**clause, "_time": clause_time}

        # Group UIDs by H3-9 cell of their latest position
        cell_uids: Dict[str, List[str]] = {}
        for uid, clause in uid_latest.items():
            lat = clause.get("locative_lat")
            lon = clause.get("locative_lon")
            if lat is None or lon is None:
                continue
            try:
                cell = h3.latlng_to_cell(lat, lon, self.H3_ANOMALY_RES)
            except Exception as exc:
                logger.warning("H3 cell error for uid=%s: %s", uid, exc)
                continue
            cell_uids.setdefault(cell, []).append(uid)

        anomalies: List[AnomalyMetric] = []
        for cell, uids in cell_uids.items():
            unique_uids = list(set(uids))
            if len(unique_uids) < 2:
                continue

            # Score scales with the number of entities, saturating at 10+
            score = min(len(unique_uids) / 10.0, 1.0)
            anomalies.append(
                AnomalyMetric(
                    metric_type="rendezvous",
                    score=score,
                    affected_uids=unique_uids,
                    description=(
                        f"{len(unique_uids)} entities rendezvoused in H3 cell {cell} "
                        f"within {window_minutes} min"
                    ),
                )
            )

        return anomalies

    def detect_stdbscan_clusters(
        self, tak_clauses: List[Dict]
    ) -> List[AnomalyMetric]:
        """Run ST-DBSCAN; return AnomalyMetric for each cluster with >= min_samples entities."""
        if not tak_clauses:
            return []

        points = []
        for c in tak_clauses:
            uid = c.get("uid")
            lat = c.get("locative_lat")
            lon = c.get("locative_lon")
            t = c.get("time")
            if uid and lat is not None and lon is not None and t is not None:
                points.append({"uid": uid, "lat": lat, "lon": lon, "time": t})

        if not points:
            return []

        try:
            result = detect_clusters(points)
        except Exception as exc:
            logger.warning("ST-DBSCAN failed: %s", exc)
            return []

        anomalies: List[AnomalyMetric] = []
        for cluster in result.clusters:
            score = min(cluster.entity_count / 20.0, 1.0)
            anomalies.append(
                AnomalyMetric(
                    metric_type="stdbscan_cluster",
                    score=score,
                    affected_uids=cluster.uids,
                    description=(
                        f"ST-DBSCAN cluster {cluster.cluster_id}: "
                        f"{cluster.entity_count} entities near "
                        f"({cluster.centroid_lat:.4f}, {cluster.centroid_lon:.4f})"
                    ),
                )
            )
        return anomalies

    def detect_hmm_anomalies(
        self, uid_tracks: Dict[str, List[Dict]]
    ) -> List[AnomalyMetric]:
        """Run HMM classifier per UID; flag MANEUVERING/HOLDING_PATTERN/CONVERGING dominant states."""
        _ANOMALOUS = {"MANEUVERING", "HOLDING_PATTERN", "CONVERGING"}
        anomalies: List[AnomalyMetric] = []

        for uid, tracks in uid_tracks.items():
            try:
                hmm_result = classify_trajectory(uid, tracks)
            except Exception as exc:
                logger.warning("HMM classification failed for uid=%s: %s", uid, exc)
                continue

            if hmm_result.dominant_state in _ANOMALOUS:
                anomalies.append(
                    AnomalyMetric(
                        metric_type="hmm_trajectory",
                        score=hmm_result.anomaly_score,
                        affected_uids=[uid],
                        description=(
                            f"{uid}: HMM dominant state {hmm_result.dominant_state} "
                            f"(anomaly_score={hmm_result.anomaly_score:.2f})"
                        ),
                    )
                )

        return anomalies

    def compute_risk_score(
        self,
        pattern_confidence: float,
        anomaly_score: float,
        alignment_score: float,
        anomaly_count: int = 0,
        context_anomalies: Optional[List[AnomalyMetric]] = None,
    ) -> float:
        """
        Compute composite risk score from pattern matching and anomalies.

        Uses a multiplicative cross-domain convergence model: when anomalies from
        two or more distinct intelligence domains (aviation, orbital, infrastructure)
        co-occur, a multiplicative boost is applied rather than a simple additive sum.
        This reflects the operational reality that multi-domain threat convergence
        is disproportionately significant compared to single-domain spikes.

        Args:
            pattern_confidence: GDELT escalation pattern confidence (0.0 - 1.0)
            anomaly_score: TAK behavioral anomaly score (0.0 - 1.0)
            alignment_score: Spatial-temporal alignment score (0.0 - 1.0)
            anomaly_count: Number of distinct anomalies detected (unused; kept for compat)
            context_anomalies: Optional list of contextual anomalies (outages, space weather)

        Returns:
            Composite risk score (0.0 - 1.0)
        """
        # Base additive weighted sum of primary signal sources.
        pattern_weight = 0.4
        anomaly_weight = 0.35
        alignment_weight = 0.25

        risk = (
            pattern_weight * pattern_confidence
            + anomaly_weight * anomaly_score
            + alignment_weight * alignment_score
        )

        if context_anomalies:
            active_context = [a for a in context_anomalies if a.score > 0.0]

            if active_context:
                context_score = sum(a.score for a in active_context) / len(active_context)
                # Blend context score to avoid hard zeroes when only context signals fire.
                context_weight = 0.2
                risk = (1.0 - context_weight) * risk + context_weight * context_score

            # Cross-domain convergence: count distinct non-generic domains active.
            active_domains = {
                self.ANOMALY_DOMAIN_MAP.get(a.metric_type, "multi")
                for a in active_context
            } - {"multi"}
            if len(active_domains) >= 2:
                # Each domain beyond the first adds a multiplicative boost.
                convergence_factor = 1.0 + CONVERGENCE_BOOST_PER_DOMAIN * (
                    len(active_domains) - 1
                )
                risk *= convergence_factor

            # Domain-specific dampening / boosting (retain original logic).
            for anomaly in active_context:
                if anomaly.metric_type == "space_weather" and anomaly.score > 0.5:
                    risk *= 0.9  # 10% dampening — expected behaviour during storms
                elif anomaly.metric_type == "internet_outage" and anomaly.score > 0.7:
                    risk *= 1.1  # 10% boost — unusual movement during major outages

        return min(risk, 1.0)

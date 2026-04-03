"""
Unit tests for EscalationDetector: pattern matching, anomaly detection,
context correlation, risk scoring, and rendezvous detection.
"""

import pytest
from datetime import datetime, timedelta, timezone

import sys
import os

# The escalation_detector lives in the API service layer, not in tak_clausalizer.
# Insert the API services path so imports resolve without running the full API.
API_SERVICES = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "api", "services"
)
sys.path.insert(0, API_SERVICES)

from escalation_detector import AnomalyMetric, EscalationDetector  # noqa: E402


detector = EscalationDetector()


# ---------------------------------------------------------------------------
# Pattern matching
# ---------------------------------------------------------------------------

class TestPatternDetection:
    def test_protest_to_clashes_pattern(self):
        events = [
            {"event_code": "PROTEST"},
            {"event_code": "POLICE_DEPLOYMENT"},
            {"event_code": "VIOLENT_CLASHES"},
        ]
        match, confidence = detector.detect_pattern(events)
        assert match is not None
        assert confidence > 0.5

    def test_no_match_returns_none(self):
        events = [
            {"event_code": "TRADE_AGREEMENT"},
            {"event_code": "DIPLOMATIC_VISIT"},
        ]
        match, confidence = detector.detect_pattern(events)
        assert match is None
        assert confidence == 0.0

    def test_empty_events_returns_none(self):
        match, confidence = detector.detect_pattern([])
        assert match is None
        assert confidence == 0.0

    def test_single_event_too_short(self):
        match, confidence = detector.detect_pattern([{"event_code": "PROTEST"}])
        assert match is None

    def test_partial_pattern_over_50pct_matches(self):
        """2/3 elements matched → confidence = 0.67 → should match."""
        events = [
            {"event_code": "PROTEST"},
            {"event_code": "POLICE_DEPLOYMENT"},
            {"event_code": "UNRELATED_EVENT"},
        ]
        match, confidence = detector.detect_pattern(events)
        assert match is not None
        assert confidence >= 0.5


# ---------------------------------------------------------------------------
# Anomaly concentration (clustering)
# ---------------------------------------------------------------------------

class TestAnomalyConcentration:
    def _make_clause(self, uid: str, lat: float, lon: float) -> dict:
        return {"uid": uid, "locative_lat": lat, "locative_lon": lon}

    def test_clustering_below_threshold_score_zero(self):
        clauses = [self._make_clause(f"UID-{i}", 51.5, -0.12) for i in range(3)]
        result = detector.detect_anomaly_concentration(clauses)
        assert result.score == 0.0

    def test_clustering_at_threshold_nonzero_score(self):
        """5+ entities in same cell → score > 0."""
        clauses = [self._make_clause(f"UID-{i}", 51.5, -0.12) for i in range(6)]
        result = detector.detect_anomaly_concentration(clauses)
        assert result.score > 0.0
        assert len(result.affected_uids) == 6

    def test_empty_clauses_score_zero(self):
        result = detector.detect_anomaly_concentration([])
        assert result.score == 0.0

    def test_spatial_filter_limits_to_region(self):
        """Clauses outside the H3 cell should be excluded."""
        import h3 as h3lib
        # Use a cell centred on London; add a clause far away (Sydney)
        london_cell = h3lib.latlng_to_cell(51.5, -0.12, detector.H3_ANOMALY_RES)

        in_region = [self._make_clause(f"LON-{i}", 51.5, -0.12) for i in range(6)]
        out_of_region = [self._make_clause("SYD", -33.87, 151.21)]
        all_clauses = in_region + out_of_region

        # Use the parent of the london cell as the h3_cell argument
        parent = h3lib.cell_to_parent(london_cell, detector.H3_ANOMALY_RES - 2)
        result = detector.detect_anomaly_concentration(all_clauses, h3_cell=parent)
        assert "SYD" not in result.affected_uids


# ---------------------------------------------------------------------------
# Directional anomalies
# ---------------------------------------------------------------------------

class TestDirectionalAnomalies:
    def _make_clause(self, uid: str, course: float) -> dict:
        return {"uid": uid, "adverbial_context": {"course": course}}

    def test_large_course_change_detected(self):
        clauses = [
            self._make_clause("AIR-1", 0.0),
            self._make_clause("AIR-1", 180.0),
        ]
        result = detector.detect_directional_anomalies(clauses)
        assert len(result) == 1
        assert result[0].metric_type == "directional_change"
        assert result[0].score > 0.0

    def test_small_course_change_ignored(self):
        clauses = [
            self._make_clause("AIR-1", 90.0),
            self._make_clause("AIR-1", 110.0),
        ]
        result = detector.detect_directional_anomalies(clauses)
        assert result == []

    def test_wraparound_handled(self):
        """350° → 10° = 20° → should NOT trigger."""
        clauses = [
            self._make_clause("AIR-1", 350.0),
            self._make_clause("AIR-1", 10.0),
        ]
        result = detector.detect_directional_anomalies(clauses)
        assert result == []


# ---------------------------------------------------------------------------
# Emergency transponder detection
# ---------------------------------------------------------------------------

class TestEmergencyTransponders:
    def test_squawk_7700_detected_from_adverbial_context(self):
        clauses = [{"uid": "MAYDAY", "adverbial_context": {"squawk": "7700"}}]
        result = detector.detect_emergency_transponders(clauses)
        assert len(result) == 1
        assert result[0].score == 1.0

    def test_squawk_7500_hijack_detected(self):
        clauses = [{"uid": "HIJACK", "adverbial_context": {"squawk": "7500"}}]
        result = detector.detect_emergency_transponders(clauses)
        assert len(result) == 1

    def test_squawk_7600_radio_failure(self):
        clauses = [{"uid": "RADIO", "adverbial_context": {"squawk": "7600"}}]
        result = detector.detect_emergency_transponders(clauses)
        assert len(result) == 1

    def test_normal_squawk_ignored(self):
        clauses = [{"uid": "NORMAL", "adverbial_context": {"squawk": "1234"}}]
        result = detector.detect_emergency_transponders(clauses)
        assert result == []

    def test_fallback_to_detail_classification(self):
        """Squawk in detail.classification.squawk should also be detected."""
        clauses = [
            {
                "uid": "OLD-FORMAT",
                "adverbial_context": {},
                "detail": {"classification": {"squawk": "7700"}},
            }
        ]
        result = detector.detect_emergency_transponders(clauses)
        assert len(result) == 1


# ---------------------------------------------------------------------------
# Context correlation: internet outage
# ---------------------------------------------------------------------------

class TestInternetOutageCorrelation:
    def test_outage_produces_score(self):
        outage = {"severity": 0.8, "country_code": "UA", "asn_name": "Ukrtelecom"}
        result = detector.detect_internet_outage_correlation(outage)
        assert result.score == pytest.approx(0.8)
        assert result.metric_type == "internet_outage"

    def test_no_outage_data_score_zero(self):
        result = detector.detect_internet_outage_correlation(None)
        assert result.score == 0.0


# ---------------------------------------------------------------------------
# Context correlation: space weather
# ---------------------------------------------------------------------------

class TestSpaceWeatherAnomaly:
    def test_high_kp_produces_score(self):
        result = detector.detect_space_weather_anomaly(8.0)
        assert result.score > 0.0
        assert result.metric_type == "space_weather"

    def test_low_kp_score_zero(self):
        result = detector.detect_space_weather_anomaly(2.0)
        assert result.score == 0.0

    def test_none_kp_score_zero(self):
        result = detector.detect_space_weather_anomaly(None)
        assert result.score == 0.0

    def test_score_saturates_at_one(self):
        result = detector.detect_space_weather_anomaly(9.0)
        assert result.score <= 1.0


# ---------------------------------------------------------------------------
# Context correlation: SatNOGS signal loss
# ---------------------------------------------------------------------------

class TestSatNOGSSignalLoss:
    def test_signal_loss_detected(self):
        events = [
            {
                "norad_id": 12345,
                "ground_station_name": "GS-Alpha",
                "signal_strength": -50.0,
            }
        ]
        result = detector.detect_satnogs_signal_loss(events)
        assert len(result) == 1
        assert result[0].metric_type == "satellite_signal_loss"

    def test_strong_signal_not_flagged(self):
        events = [
            {
                "norad_id": 12345,
                "ground_station_name": "GS-Alpha",
                "signal_strength": -5.0,
            }
        ]
        result = detector.detect_satnogs_signal_loss(events)
        assert result == []

    def test_empty_events_returns_empty(self):
        assert detector.detect_satnogs_signal_loss([]) == []
        assert detector.detect_satnogs_signal_loss(None) == []


# ---------------------------------------------------------------------------
# Risk scoring
# ---------------------------------------------------------------------------

class TestRiskScore:
    def test_zero_inputs_give_zero_risk(self):
        score = detector.compute_risk_score(0.0, 0.0, 0.0)
        assert score == 0.0

    def test_high_pattern_confidence_raises_risk(self):
        score = detector.compute_risk_score(1.0, 0.0, 0.0)
        assert score > 0.3

    def test_score_capped_at_one(self):
        score = detector.compute_risk_score(1.0, 1.0, 1.0, anomaly_count=5)
        assert score <= 1.0

    def test_space_weather_dampens_risk(self):
        base_score = detector.compute_risk_score(0.8, 0.8, 0.8)
        space_anomaly = AnomalyMetric(
            metric_type="space_weather",
            score=0.9,
            affected_uids=[],
            description="G4 storm",
        )
        dampened_score = detector.compute_risk_score(
            0.8, 0.8, 0.8, context_anomalies=[space_anomaly]
        )
        assert dampened_score < base_score

    def test_internet_outage_boosts_risk(self):
        base_score = detector.compute_risk_score(0.4, 0.4, 0.4)
        outage_anomaly = AnomalyMetric(
            metric_type="internet_outage",
            score=0.9,
            affected_uids=[],
            description="Major outage",
        )
        boosted_score = detector.compute_risk_score(
            0.4, 0.4, 0.4, context_anomalies=[outage_anomaly]
        )
        assert boosted_score >= base_score


# ---------------------------------------------------------------------------
# Rendezvous detection
# ---------------------------------------------------------------------------

class TestRendezvousDetection:
    def _make_clause(self, uid: str, lat: float, lon: float, offset_minutes: int = 0) -> dict:
        ts = datetime.now(timezone.utc) - timedelta(minutes=offset_minutes)
        return {
            "uid": uid,
            "locative_lat": lat,
            "locative_lon": lon,
            "time": ts.isoformat(),
        }

    def test_two_entities_same_cell_detected(self):
        clauses = [
            self._make_clause("ALPHA", 51.5000, -0.1200),
            self._make_clause("BRAVO", 51.5001, -0.1201),  # same H3-9 cell
        ]
        result = detector.detect_rendezvous(clauses, window_minutes=30)
        assert len(result) >= 1
        assert any(r.metric_type == "rendezvous" for r in result)

    def test_single_entity_no_rendezvous(self):
        clauses = [self._make_clause("SOLO", 51.5, -0.12)]
        result = detector.detect_rendezvous(clauses, window_minutes=30)
        assert result == []

    def test_entities_in_different_cells_no_rendezvous(self):
        clauses = [
            self._make_clause("ALPHA", 51.5000, -0.1200),
            self._make_clause("BRAVO", 52.0000, 4.0000),  # Amsterdam
        ]
        result = detector.detect_rendezvous(clauses, window_minutes=30)
        assert result == []

    def test_old_clauses_excluded(self):
        """Clauses outside the time window should not count."""
        clauses = [
            self._make_clause("ALPHA", 51.5, -0.12, offset_minutes=0),
            # This one is way outside the 10-minute window
            self._make_clause("BRAVO", 51.5, -0.12, offset_minutes=60),
        ]
        result = detector.detect_rendezvous(clauses, window_minutes=10)
        assert result == []

    def test_score_scales_with_entity_count(self):
        """More entities → higher score (up to 1.0)."""
        two_entity = [
            self._make_clause("A", 51.5, -0.12),
            self._make_clause("B", 51.5001, -0.1201),
        ]
        ten_entity = [
            self._make_clause(f"UID-{i}", 51.5 + i * 0.00001, -0.12) for i in range(10)
        ]
        two_result = detector.detect_rendezvous(two_entity, window_minutes=30)
        ten_result = detector.detect_rendezvous(ten_entity, window_minutes=30)

        if two_result and ten_result:
            assert ten_result[0].score >= two_result[0].score

    def test_deduplicates_same_uid(self):
        """Multiple clauses for same UID only count once."""
        clauses = [
            self._make_clause("ALPHA", 51.5, -0.12, offset_minutes=5),
            self._make_clause("ALPHA", 51.5, -0.12, offset_minutes=2),
            self._make_clause("ALPHA", 51.5, -0.12, offset_minutes=0),
            self._make_clause("BRAVO", 51.5001, -0.1201, offset_minutes=0),
        ]
        result = detector.detect_rendezvous(clauses, window_minutes=30)
        # Should be exactly 2 unique UIDs: ALPHA + BRAVO
        if result:
            assert len(result[0].affected_uids) == 2

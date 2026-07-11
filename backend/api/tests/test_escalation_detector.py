"""
Unit tests for EscalationDetector: pattern matching, anomaly detection,
context correlation, risk scoring, and rendezvous detection.

Moved from backend/ingestion/tak_clausalizer/tests/ — the detector lives in
the API service layer and depends on other services modules (hmm_trajectory,
stdbscan, risk_taxonomy), so its tests belong in the API test suite.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.escalation_detector import AnomalyMetric, EscalationDetector  # noqa: E402


detector = EscalationDetector()


def _ts(minutes_ago: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)


# ---------------------------------------------------------------------------
# Pattern matching (CAMEO root-code sequences)
# ---------------------------------------------------------------------------

class TestPatternDetection:
    def test_protest_to_assault_pattern(self):
        """CAMEO 14x (protest) → 17x (coerce) → 18x (assault) is an escalation."""
        events = [
            {"event_code": "141", "time": _ts(120)},
            {"event_code": "171", "time": _ts(60)},
            {"event_code": "183", "time": _ts(10)},
        ]
        match, confidence = detector.detect_pattern(events)
        assert match is not None
        assert confidence > 0.5

    def test_reverse_chronology_input_still_matches(self):
        """Events arriving newest-first (DB order) must be re-sorted before matching."""
        events = [
            {"event_code": "183", "time": _ts(10)},
            {"event_code": "171", "time": _ts(60)},
            {"event_code": "141", "time": _ts(120)},
        ]
        match, confidence = detector.detect_pattern(events)
        assert match is not None
        assert confidence > 0.5

    def test_deescalation_sequence_does_not_match(self):
        """Assault followed by protest is de-escalation, not escalation."""
        events = [
            {"event_code": "183", "time": _ts(120)},
            {"event_code": "141", "time": _ts(10)},
        ]
        match, confidence = detector.detect_pattern(events)
        assert match is None
        assert confidence == 0.0

    def test_cooperation_codes_do_not_match(self):
        events = [
            {"event_code": "042", "time": _ts(60)},  # consult / visit
            {"event_code": "051", "time": _ts(10)},  # diplomatic cooperation
        ]
        match, confidence = detector.detect_pattern(events)
        assert match is None
        assert confidence == 0.0

    def test_textual_codes_are_ignored(self):
        """ReliefWeb-style category names cannot match numeric roots."""
        events = [
            {"event_code": "Conflict and Violence", "time": _ts(60)},
            {"event_code": "Conflict and Violence", "time": _ts(10)},
        ]
        match, confidence = detector.detect_pattern(events)
        assert match is None

    def test_empty_events_returns_none(self):
        match, confidence = detector.detect_pattern([])
        assert match is None
        assert confidence == 0.0

    def test_single_event_too_short(self):
        match, confidence = detector.detect_pattern([{"event_code": "141"}])
        assert match is None

    def test_single_matched_element_is_not_a_sequence(self):
        """One matching root alone must not produce a pattern hit."""
        events = [
            {"event_code": "141", "time": _ts(60)},
            {"event_code": "036", "time": _ts(10)},  # cooperation code
        ]
        match, confidence = detector.detect_pattern(events)
        assert match is None
        assert confidence == 0.0

    def test_partial_match_two_of_three(self):
        """2/3 elements matched (≥2 events, ≥66%) still counts with lower confidence."""
        events = [
            {"event_code": "141", "time": _ts(120)},
            {"event_code": "171", "time": _ts(60)},
            {"event_code": "042", "time": _ts(10)},  # unrelated cooperation event
        ]
        match, confidence = detector.detect_pattern(events)
        assert match is not None
        assert 0.5 < confidence < 1.0

    def test_cameo_root_extraction(self):
        assert EscalationDetector._cameo_root("141") == "14"
        assert EscalationDetector._cameo_root("1411") == "14"
        assert EscalationDetector._cameo_root("19") == "19"
        assert EscalationDetector._cameo_root("Conflict and Violence") is None
        assert EscalationDetector._cameo_root(None) is None
        assert EscalationDetector._cameo_root("") is None


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

    def test_clustering_at_threshold_material_score(self):
        """A qualifying cluster (≥ threshold) must score at least 0.5."""
        clauses = [self._make_clause(f"UID-{i}", 51.5, -0.12) for i in range(6)]
        result = detector.detect_anomaly_concentration(clauses)
        assert result.score >= 0.5
        assert len(result.affected_uids) == 6

    def test_clustering_score_saturates(self):
        clauses = [self._make_clause(f"UID-{i}", 51.5, -0.12) for i in range(20)]
        result = detector.detect_anomaly_concentration(clauses)
        assert result.score == 1.0

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
    def _make_clause(self, uid: str, course: float, minutes_ago: int = 0) -> dict:
        return {
            "uid": uid,
            "time": _ts(minutes_ago),
            "adverbial_context": {"course": course},
        }

    def test_large_course_change_detected(self):
        clauses = [
            self._make_clause("AIR-1", 0.0, minutes_ago=10),
            self._make_clause("AIR-1", 180.0, minutes_ago=0),
        ]
        result = detector.detect_directional_anomalies(clauses)
        assert len(result) == 1
        assert result[0].metric_type == "directional_change"
        assert result[0].score > 0.0

    def test_compares_most_recent_pair_regardless_of_input_order(self):
        """DB rows arrive newest-first; the detector must evaluate the two
        most recent clauses, not the two oldest."""
        clauses = [
            self._make_clause("AIR-1", 180.0, minutes_ago=0),   # newest
            self._make_clause("AIR-1", 0.0, minutes_ago=5),
            self._make_clause("AIR-1", 0.0, minutes_ago=60),    # oldest
        ]
        result = detector.detect_directional_anomalies(clauses)
        assert len(result) == 1  # 0° → 180° between the two most recent

    def test_small_course_change_ignored(self):
        clauses = [
            self._make_clause("AIR-1", 90.0, minutes_ago=10),
            self._make_clause("AIR-1", 110.0, minutes_ago=0),
        ]
        result = detector.detect_directional_anomalies(clauses)
        assert result == []

    def test_wraparound_handled(self):
        """350° → 10° = 20° → should NOT trigger."""
        clauses = [
            self._make_clause("AIR-1", 350.0, minutes_ago=10),
            self._make_clause("AIR-1", 10.0, minutes_ago=0),
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
    def test_curated_loss_event_without_dbm_detected(self):
        """Bad/failed observations arrive with signal_strength NULL and a
        confidence — presence in the feed is the loss signal."""
        events = [
            {
                "norad_id": 12345,
                "ground_station_name": "GS-Alpha",
                "signal_strength": None,
                "confidence": 0.9,
            }
        ]
        result = detector.detect_satnogs_signal_loss(events)
        assert len(result) == 1
        assert result[0].metric_type == "satellite_signal_loss"
        assert result[0].score == pytest.approx(0.9)

    def test_dbm_below_weak_signal_floor_detected(self):
        events = [
            {
                "norad_id": 12345,
                "ground_station_name": "GS-Alpha",
                "signal_strength": -120.0,
            }
        ]
        result = detector.detect_satnogs_signal_loss(events)
        assert len(result) == 1
        assert result[0].score == pytest.approx(1.0)

    def test_normal_reception_not_flagged(self):
        """-50 dBm is a normal-to-strong received signal, not a loss."""
        events = [
            {
                "norad_id": 12345,
                "ground_station_name": "GS-Alpha",
                "signal_strength": -50.0,
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

    def test_space_weather_alone_does_not_raise_risk(self):
        """A geomagnetic storm is an explanatory factor, not a threat signal —
        with no other evidence it must not create risk from nothing."""
        space_anomaly = AnomalyMetric(
            metric_type="space_weather",
            score=0.9,
            affected_uids=[],
            description="G4 storm",
        )
        score = detector.compute_risk_score(
            0.0, 0.0, 0.0, context_anomalies=[space_anomaly]
        )
        assert score == 0.0

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

    def test_weak_context_evidence_never_lowers_risk(self):
        """Adding a mild context anomaly must not reduce a strong base score."""
        base_score = detector.compute_risk_score(0.9, 0.9, 0.9)
        mild_outage = AnomalyMetric(
            metric_type="internet_outage",
            score=0.1,
            affected_uids=[],
            description="Minor outage",
        )
        with_context = detector.compute_risk_score(
            0.9, 0.9, 0.9, context_anomalies=[mild_outage]
        )
        assert with_context >= base_score

    def test_cross_domain_convergence_counts_behavioral_anomalies(self):
        """Aviation (behavioral emergency) + orbital (context signal loss)
        co-active must trigger the convergence boost."""
        emergency = AnomalyMetric(
            metric_type="emergency",
            score=1.0,
            affected_uids=["A1"],
            description="7700",
        )
        signal_loss = AnomalyMetric(
            metric_type="satellite_signal_loss",
            score=0.8,
            affected_uids=["SAT-1"],
            description="loss",
        )
        without_behavioral = detector.compute_risk_score(
            0.3, 0.5, 0.2, context_anomalies=[signal_loss]
        )
        with_behavioral = detector.compute_risk_score(
            0.3, 0.5, 0.2,
            context_anomalies=[signal_loss],
            behavioral_anomalies=[emergency],
        )
        assert with_behavioral > without_behavioral


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

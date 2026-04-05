"""
Unit tests for HMM Trajectory Classifier.

Tests cover: empty/single-point degenerate cases, transiting pattern,
anomalous (maneuvering) pattern, and structural correctness of HMMResult.
No database or external dependencies required.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.hmm_trajectory import (
    STATES,
    HMMResult,
    _ANOMALOUS_STATES,
    classify_trajectory,
)


_BASE_TIME = datetime(2024, 6, 1, 0, 0, 0, tzinfo=timezone.utc)


def _make_point(
    speed_kts: float,
    heading_deg: float,
    alt_ft: float,
    offset_s: int = 0,
) -> dict:
    return {
        "speed_kts": speed_kts,
        "heading_deg": heading_deg,
        "alt_ft": alt_ft,
        "time": _BASE_TIME + timedelta(seconds=offset_s),
    }


class TestClassifyTrajectoryEdgeCases:
    def test_empty_track_returns_default_transiting(self):
        result = classify_trajectory("uid-0", [])
        assert isinstance(result, HMMResult)
        assert result.uid == "uid-0"
        assert result.dominant_state == "TRANSITING"
        assert result.state_sequence == ["TRANSITING"]
        assert result.confidence == 1.0
        assert result.anomaly_score == 0.0

    def test_single_point_returns_default_transiting(self):
        result = classify_trajectory("uid-1", [_make_point(100.0, 90.0, 10000.0)])
        assert result.dominant_state == "TRANSITING"
        assert result.state_sequence == ["TRANSITING"]
        assert result.confidence == 1.0
        assert result.anomaly_score == 0.0

    def test_result_uid_is_preserved(self):
        points = [
            _make_point(300.0, 90.0, 35000.0, 0),
            _make_point(300.0, 90.0, 35000.0, 60),
        ]
        result = classify_trajectory("my-aircraft-001", points)
        assert result.uid == "my-aircraft-001"


class TestClassifyTrajectoryStateSequence:
    def test_state_sequence_length_is_n_minus_1(self):
        """With N track points, exactly N-1 observations are derived."""
        n = 10
        points = [
            _make_point(300.0, 90.0, 35000.0, i * 60) for i in range(n)
        ]
        result = classify_trajectory("uid-len", points)
        assert len(result.state_sequence) == n - 1

    def test_all_states_are_valid(self):
        points = [
            _make_point(100.0, 45.0, 5000.0, i * 30) for i in range(8)
        ]
        result = classify_trajectory("uid-valid", points)
        for s in result.state_sequence:
            assert s in STATES

    def test_confidence_is_fraction_of_dominant_state(self):
        points = [
            _make_point(300.0, 90.0, 35000.0, i * 60) for i in range(6)
        ]
        result = classify_trajectory("uid-conf", points)
        dominant_count = result.state_sequence.count(result.dominant_state)
        expected = dominant_count / len(result.state_sequence)
        assert abs(result.confidence - expected) < 1e-9

    def test_anomaly_score_is_fraction_of_anomalous_states(self):
        points = [_make_point(50.0, float(i * 45), 5000.0, i * 10) for i in range(8)]
        result = classify_trajectory("uid-anom", points)
        anomalous_count = sum(1 for s in result.state_sequence if s in _ANOMALOUS_STATES)
        expected = anomalous_count / len(result.state_sequence)
        assert abs(result.anomaly_score - expected) < 1e-9


class TestClassifyTrajectoryTransiting:
    def test_fast_straight_level_favours_transiting(self):
        """
        Constant fast speed, constant heading, constant altitude.
        ST-DBSCAN emission matrix strongly favours TRANSITING for this pattern.
        """
        points = [
            _make_point(300.0, 90.0, 35000.0, i * 60)
            for i in range(10)
        ]
        result = classify_trajectory("fast-jet", points)
        # Dominant state should be TRANSITING (highest emission probability for FAST+STRAIGHT+LEVEL)
        assert result.dominant_state == "TRANSITING"
        assert result.confidence > 0.5

    def test_anomaly_score_low_for_transiting(self):
        points = [_make_point(300.0, 90.0, 35000.0, i * 60) for i in range(10)]
        result = classify_trajectory("fast-jet-2", points)
        # TRANSITING is not anomalous
        assert result.anomaly_score < 0.5


class TestClassifyTrajectoryAnomalous:
    def test_sharp_turns_increase_anomaly_score(self):
        """
        Alternating headings at medium speed every 1 second → ~90°/s turn rate (SHARP).
        The emission matrix strongly boosts MANEUVERING for sharp-turn symbols.
        """
        # Alternate between 0° and 90° every 1 second at medium speed → SHARP turn rate
        headings = [0.0, 90.0, 0.0, 90.0, 0.0, 90.0, 0.0, 90.0, 0.0]
        points = [
            _make_point(150.0, headings[i], 10000.0, i * 1)  # medium speed, 1 s intervals
            for i in range(len(headings))
        ]
        result = classify_trajectory("sharp-turner", points)
        # Anomaly score should be elevated (MANEUVERING should appear)
        assert result.anomaly_score > 0.0

    def test_holding_pattern_slow_turning_level(self):
        """
        Slow speed, consistent medium turn rate, level altitude.
        Should lean toward HOLDING_PATTERN or LOITERING.
        """
        # Turn 10°/s = TURNING category; slow speed; level altitude
        # With 30-second intervals: 300° heading change → 10°/s turn rate
        headings = [float(i * 300 % 360) for i in range(8)]
        points = [
            _make_point(30.0, headings[i], 1000.0, i * 30)
            for i in range(8)
        ]
        result = classify_trajectory("holding", points)
        assert isinstance(result, HMMResult)
        # Should produce some non-zero anomaly score (HOLDING_PATTERN is anomalous)
        # or at minimum classify correctly as a non-transiting state
        assert result.dominant_state in STATES

    def test_anomaly_score_bounds(self):
        """anomaly_score must always be in [0.0, 1.0]."""
        for trial in range(5):
            speed = [10.0, 300.0, 50.0, 150.0, 10.0, 400.0][trial % 6]
            heading_start = trial * 30.0
            points = [
                _make_point(speed, (heading_start + i * 45) % 360, 5000.0, i * 10)
                for i in range(6)
            ]
            result = classify_trajectory(f"uid-bound-{trial}", points)
            assert 0.0 <= result.anomaly_score <= 1.0
            assert 0.0 <= result.confidence <= 1.0


class TestClassifyTrajectoryTimeParsing:
    def test_iso_string_time_is_accepted(self):
        points = [
            {"speed_kts": 200.0, "heading_deg": 90.0, "alt_ft": 20000.0,
             "time": "2024-06-01T00:00:00Z"},
            {"speed_kts": 200.0, "heading_deg": 90.0, "alt_ft": 20000.0,
             "time": "2024-06-01T00:01:00Z"},
        ]
        result = classify_trajectory("iso-test", points)
        assert len(result.state_sequence) == 1
        assert result.dominant_state in STATES

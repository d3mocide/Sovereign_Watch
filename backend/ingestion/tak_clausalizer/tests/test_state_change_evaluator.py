"""
Unit tests for StateChangeEvaluator: all 6 transition types.
"""

import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from delta_engine import MedialClause  # noqa: E402
from state_change_evaluator import StateChangeEvaluator  # noqa: E402


def _make_prev(
    lat: float = 51.5,
    lon: float = -0.12,
    predicate_type: str = "a-f-A-C-F",
    speed: float = 50.0,
    course: float = 90.0,
    altitude: float = 1000.0,
    battery: float = 80.0,
) -> MedialClause:
    return MedialClause(
        uid="TEST-1",
        time=1_700_000_000,
        source="TAK_ADSB",
        predicate_type=predicate_type,
        lat=lat,
        lon=lon,
        hae=altitude,
        adverbial_context={
            "speed": speed,
            "course": course,
            "altitude": altitude,
            "battery_pct": battery,
        },
    )


def _make_new(
    lat: float = 51.5,
    lon: float = -0.12,
    predicate_type: str = "a-f-A-C-F",
    speed: float = 50.0,
    course: float = 90.0,
    altitude: float = 1000.0,
    battery: float = 80.0,
) -> dict:
    return {
        "type": predicate_type,
        "time": 1_700_000_060,
        "point": {"lat": lat, "lon": lon, "hae": altitude},
        "detail": {
            "track": {"speed": speed, "course": course},
            "status": {"battery": battery},
        },
    }


evaluator = StateChangeEvaluator()


class TestNoChanges:
    def test_no_events_when_nothing_changed(self):
        prev = _make_prev()
        new = _make_new()
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        assert events == []

    def test_no_events_with_no_previous(self):
        new = _make_new()
        events = evaluator.evaluate_transitions("TEST-1", new, None)
        assert events == []


class TestTypeChange:
    def test_type_change_detected(self):
        prev = _make_prev(predicate_type="a-f-A-C-F")
        new = _make_new(predicate_type="a-f-A-M-F")
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "TYPE_CHANGE" in reasons

    def test_same_type_no_event(self):
        prev = _make_prev(predicate_type="a-f-A-C-F")
        new = _make_new(predicate_type="a-f-A-C-F")
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "TYPE_CHANGE" not in reasons

    def test_type_change_confidence_high(self):
        prev = _make_prev(predicate_type="a-f-A-C-F")
        new = _make_new(predicate_type="a-f-S-W")
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        type_events = [e for e in events if e.reason == "TYPE_CHANGE"]
        assert type_events[0].confidence == 0.95


class TestLocationTransition:
    def test_h3_boundary_cross_detected(self):
        """Move far enough to cross an H3-9 boundary (~100 m cells)."""
        prev = _make_prev(lat=51.5000, lon=-0.1200)
        # ~5 km — guaranteed cross
        new = _make_new(lat=51.5450, lon=-0.1200)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "LOCATION_TRANSITION" in reasons

    def test_no_h3_cross_within_cell(self):
        """Tiny movement that stays inside the same H3-9 cell."""
        prev = _make_prev(lat=51.50000, lon=-0.12000)
        # ~1 m — will stay in same cell
        new = _make_new(lat=51.50001, lon=-0.12000)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "LOCATION_TRANSITION" not in reasons


class TestSpeedTransition:
    def test_moving_to_stationary(self):
        prev = _make_prev(speed=10.0)
        new = _make_new(speed=0.0)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "SPEED_TRANSITION" in reasons

    def test_stationary_to_moving(self):
        prev = _make_prev(speed=0.0)
        new = _make_new(speed=5.0)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "SPEED_TRANSITION" in reasons

    def test_both_moving_no_event(self):
        prev = _make_prev(speed=10.0)
        new = _make_new(speed=20.0)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "SPEED_TRANSITION" not in reasons

    def test_both_stationary_no_event(self):
        prev = _make_prev(speed=0.1)
        new = _make_new(speed=0.2)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "SPEED_TRANSITION" not in reasons


class TestCourseChange:
    def test_large_course_change_detected(self):
        prev = _make_prev(course=0.0)
        new = _make_new(course=180.0)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "COURSE_CHANGE" in reasons

    def test_small_course_change_ignored(self):
        prev = _make_prev(course=90.0)
        new = _make_new(course=105.0)  # 15° delta < threshold
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "COURSE_CHANGE" not in reasons

    def test_wraparound_handled(self):
        """350° → 10° is only a 20° change — should NOT trigger."""
        prev = _make_prev(course=350.0)
        new = _make_new(course=10.0)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "COURSE_CHANGE" not in reasons

    def test_wraparound_large_change(self):
        """350° → 210° is 140° change — should trigger."""
        prev = _make_prev(course=350.0)
        new = _make_new(course=210.0)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "COURSE_CHANGE" in reasons


class TestAltitudeChange:
    def test_large_altitude_change_detected(self):
        prev = _make_prev(altitude=1000.0)
        new = _make_new(altitude=6000.0)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "ALTITUDE_CHANGE" in reasons

    def test_small_altitude_change_ignored(self):
        prev = _make_prev(altitude=1000.0)
        new = _make_new(altitude=1100.0)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "ALTITUDE_CHANGE" not in reasons

    def test_altitude_change_details(self):
        prev = _make_prev(altitude=1000.0)
        new = _make_new(altitude=9000.0)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        alt_events = [e for e in events if e.reason == "ALTITUDE_CHANGE"]
        assert alt_events[0].details["delta"] == pytest.approx(8000.0)


class TestBatteryCritical:
    def test_battery_entering_critical_detected(self):
        prev = _make_prev(battery=50.0)
        new = _make_new(battery=10.0)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "BATTERY_CRITICAL" in reasons

    def test_battery_recovering_from_critical_detected(self):
        prev = _make_prev(battery=10.0)
        new = _make_new(battery=50.0)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "BATTERY_CRITICAL" in reasons

    def test_both_critical_no_event(self):
        prev = _make_prev(battery=5.0)
        new = _make_new(battery=15.0)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "BATTERY_CRITICAL" not in reasons

    def test_both_normal_no_event(self):
        prev = _make_prev(battery=80.0)
        new = _make_new(battery=70.0)
        events = evaluator.evaluate_transitions("TEST-1", new, prev)
        reasons = [e.reason for e in events]
        assert "BATTERY_CRITICAL" not in reasons



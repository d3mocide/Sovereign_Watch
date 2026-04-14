"""Unit tests for SpaceWeatherSource helper logic."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sources.space_weather import _kp_to_storm_level, SpaceWeatherSource


def test_kp_storm_levels():
    assert _kp_to_storm_level(0.0) == "quiet"
    assert _kp_to_storm_level(2.9) == "quiet"
    assert _kp_to_storm_level(3.0) == "unsettled"
    assert _kp_to_storm_level(4.0) == "active"
    assert _kp_to_storm_level(5.0) == "G1"
    assert _kp_to_storm_level(7.0) == "G3"
    assert _kp_to_storm_level(9.0) == "G5"


def test_source_instantiation():
    src = SpaceWeatherSource(
        client=None,
        redis_client=None,
        db_url="postgresql://localhost/test",
        aurora_interval_s=300,
        kp_interval_s=900,
    )
    assert src.aurora_interval == 300
    assert src.kp_interval == 900


def test_seen_kp_times_dedup():
    src = SpaceWeatherSource(
        client=None,
        redis_client=None,
        db_url="postgresql://localhost/test",
        aurora_interval_s=300,
        kp_interval_s=900,
    )
    src._seen_kp_times.add("2026-03-21T10:00:00")
    assert "2026-03-21T10:00:00" in src._seen_kp_times
    assert "2026-03-21T10:01:00" not in src._seen_kp_times

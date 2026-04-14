"""Unit tests for OrbitalSource TLE parsing logic."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sources.orbital import OrbitalSource

# ISS TLE (public, used for testing only)
_TLE_NAME = "ISS (ZARYA)"
_TLE_L1   = "1 25544U 98067A   24001.50000000  .00020000  00000-0  36000-3 0  9999"
_TLE_L2   = "2 25544  51.6412 123.4567 0001234  56.7890 303.2109 15.49530000000012"


def make_source():
    return OrbitalSource(client=None, producer=None, redis_client=None, topic="orbital_raw")


def test_parse_tle_data_valid():
    src = make_source()
    tle_text = f"{_TLE_NAME}\n{_TLE_L1}\n{_TLE_L2}\n"
    result = src._parse_tle_data(tle_text, "stations")
    assert len(result) == 1
    sat_id = list(result.keys())[0]
    meta = result[sat_id]["meta"]
    assert meta["name"] == _TLE_NAME
    assert meta["category"] == "leo"
    assert meta["constellation"] is None  # "stations" not in constellation map
    assert meta["tle_line1"] == _TLE_L1
    assert meta["tle_line2"] == _TLE_L2


def test_parse_tle_data_category_mapping():
    src = make_source()
    tle_text = f"GPS BIIR-2  (PRN 13)\n{_TLE_L1}\n{_TLE_L2}\n"
    result = src._parse_tle_data(tle_text, "gps-ops")
    meta = list(result.values())[0]["meta"]
    assert meta["category"] == "gps"
    assert meta["constellation"] == "GPS"


def test_parse_tle_data_empty_returns_empty():
    src = make_source()
    assert src._parse_tle_data("", "starlink") == {}


def test_parse_tle_data_invalid_tle_skipped():
    src = make_source()
    # Only two lines — no valid TLE triplet
    tle_text = "BADSAT\n1 99999U 00000A   24001.50000000  .00000000  00000-0  00000-0 0  0000\n"
    result = src._parse_tle_data(tle_text, "starlink")
    assert result == {}

"""Unit tests for OrbitalSource TLE parsing logic."""
import asyncio
import sys
import os
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

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


def test_seconds_until_next_fetch_window_waits_for_configured_hour():
    src = make_source()
    src.fetch_hour = 2
    now_dt = datetime(2026, 4, 14, 1, 30, tzinfo=UTC)

    wait_result = src._seconds_until_next_fetch_window(now_dt, None)

    assert wait_result is not None
    wait_sec, reason = wait_result
    assert reason == "scheduled hour not reached"
    assert wait_sec == 1800


def test_seconds_until_next_fetch_window_skips_same_day_refetch():
    src = make_source()
    src.fetch_hour = 2
    now_dt = datetime(2026, 4, 14, 2, 30, tzinfo=UTC)
    last_fetch_ts = datetime(2026, 4, 14, 2, 5, tzinfo=UTC).timestamp()

    wait_result = src._seconds_until_next_fetch_window(now_dt, last_fetch_ts)

    assert wait_result is not None
    wait_sec, reason = wait_result
    assert reason == "already fetched in this UTC window"
    assert wait_sec == 84600


def test_seconds_until_next_fetch_window_allows_fetch_in_new_window():
    src = make_source()
    src.fetch_hour = 2
    now_dt = datetime(2026, 4, 15, 2, 15, tzinfo=UTC)
    last_fetch_ts = datetime(2026, 4, 14, 2, 5, tzinfo=UTC).timestamp()

    assert src._seconds_until_next_fetch_window(now_dt, last_fetch_ts) is None


def test_load_cached_tle_data_primes_sat_arrays(tmp_path):
    src = make_source()
    src.groups = [("gp.php", "stations")]

    cache_path = tmp_path / "gp.php_GROUP_stations.txt"
    cache_path.write_text(f"{_TLE_NAME}\n{_TLE_L1}\n{_TLE_L2}\n", encoding="utf-8")

    with patch("sources.orbital.CACHE_DIR", str(tmp_path)):
        loaded_count = asyncio.run(src._load_cached_tle_data())

    assert loaded_count == 1
    assert len(src.satrecs) == 1
    assert src.sat_array is not None
    assert src.sat_meta[0]["name"] == _TLE_NAME


def test_tle_update_loop_seeds_immediately_when_cache_missing():
    src = make_source()
    src.running = True
    src.fetch_hour = 2
    src.redis_client = AsyncMock()
    src._load_cached_tle_data = AsyncMock(return_value=0)
    src.fetch_tle_data = AsyncMock(side_effect=_stop_after_seed(src))

    asyncio.run(src.tle_update_loop())

    src._load_cached_tle_data.assert_awaited_once()
    src.fetch_tle_data.assert_awaited_once()


def _stop_after_seed(src: OrbitalSource):
    async def _stop():
        src.running = False

    return _stop

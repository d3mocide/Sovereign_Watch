"""Unit tests for OrbitalSource OMM parsing logic."""
import asyncio
import sys
import os
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sources.orbital import OrbitalSource

# ISS OMM CSV (public-like test fixture)
_OMM_CSV = """OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT
ISS (ZARYA),1998-067A,25544,2024-01-01T12:00:00.000000,15.49530000,0.0001234,51.6412,123.4567,56.7890,303.2109,0,U,999,12,0.00036000,0.00020000,0.0
"""


def make_source():
    return OrbitalSource(client=None, producer=None, redis_client=None, topic="orbital_raw")


def test_parse_omm_csv_data_valid():
    src = make_source()
    result = src._parse_omm_csv_data(_OMM_CSV, "stations")
    assert len(result) == 1
    sat_id = list(result.keys())[0]
    meta = result[sat_id]["meta"]
    assert meta["name"] == "ISS (ZARYA)"
    assert meta["category"] == "leo"
    assert meta["constellation"] is None  # "stations" not in constellation map
    assert meta["object_id"] == "1998-067A"
    assert meta["epoch"] == "2024-01-01T12:00:00.000000"


def test_parse_omm_csv_data_category_mapping():
    src = make_source()
    csv_text = _OMM_CSV.replace("ISS (ZARYA)", "GPS BIIR-2  (PRN 13)")
    result = src._parse_omm_csv_data(csv_text, "gps-ops")
    meta = list(result.values())[0]["meta"]
    assert meta["category"] == "gps"
    assert meta["constellation"] == "GPS"


def test_parse_omm_csv_data_empty_returns_empty():
    src = make_source()
    assert src._parse_omm_csv_data("", "starlink") == {}


def test_parse_omm_csv_data_invalid_row_skipped():
    src = make_source()
    bad_csv = "OBJECT_NAME,NORAD_CAT_ID,EPOCH\nBADSAT,99999,2024-01-01T12:00:00.000000\n"
    result = src._parse_omm_csv_data(bad_csv, "starlink")
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

    cache_path = tmp_path / "gp.php_GROUP_stations.omm.csv"
    cache_path.write_text(_OMM_CSV, encoding="utf-8")

    with patch("sources.orbital.CACHE_DIR", str(tmp_path)):
        loaded_count = asyncio.run(src._load_cached_tle_data())

    assert loaded_count == 1
    assert len(src.satrecs) == 1
    assert src.sat_array is not None
    assert src.sat_meta[0]["name"] == "ISS (ZARYA)"


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

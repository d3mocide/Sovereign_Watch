"""
FIRMS source tests.

Unit tests: no network, no Docker, no API key needed.
Integration test: set FIRMS_MAP_KEY env var to run a live end-to-end fetch.

Run unit tests only:
    uv run python -m pytest tests/test_firms.py -v -m "not integration"

Run all including live feed check (requires FIRMS_MAP_KEY):
    $env:FIRMS_MAP_KEY="YOUR_KEY_HERE"
    uv run python -m pytest tests/test_firms.py -v
"""

import os
import sys
import textwrap
from datetime import UTC, datetime

import pytest

# ---------------------------------------------------------------------------
# Path setup — allow importing from the sources/ sibling directory
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Patch env BEFORE importing firms so module-level constants pick up our values
os.environ.setdefault("FIRMS_MAP_KEY", "test-placeholder")

from sources.firms import (  # noqa: E402
    FIRMSSource,
    _bbox_from_mission,
    _parse_modis_confidence,
    _parse_viirs_confidence,
    _rows_to_geojson,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_source() -> FIRMSSource:
    """Instantiate FIRMSSource without real Redis/DB (won't be called in unit tests)."""
    return FIRMSSource(client=None, redis_client=None, db_url="postgresql://localhost/test")


# ---------------------------------------------------------------------------
# Bounding-box helpers
# ---------------------------------------------------------------------------

class TestBboxFromMission:
    def test_output_order(self):
        west, south, east, north = _bbox_from_mission(45.5, -122.7, 150)
        assert west < east
        assert south < north

    def test_symmetry_around_center(self):
        lat, lon = 45.5, -122.7
        west, south, east, north = _bbox_from_mission(lat, lon, 150)
        # Within floating-point tolerance the bbox should be symmetric
        assert abs((lon - west) - (east - lon)) < 0.001
        assert abs((lat - south) - (north - lat)) < 0.001

    def test_clamps_to_valid_range(self):
        # Use a point very close to the north pole — north should clamp to 90
        _, _, _, north = _bbox_from_mission(89.9, 0.0, 1000)
        assert north <= 90.0

    def test_radius_scaling(self):
        _, s1, _, n1 = _bbox_from_mission(45.0, 0.0, 100)
        _, s2, _, n2 = _bbox_from_mission(45.0, 0.0, 200)
        # Larger radius → wider bbox
        assert (n2 - s2) > (n1 - s1)


# ---------------------------------------------------------------------------
# Confidence parsing
# ---------------------------------------------------------------------------

class TestViirConfidence:
    def test_nominal_accepted(self):
        assert _parse_viirs_confidence("nominal") == "nominal"
        assert _parse_viirs_confidence("  Nominal  ") == "nominal"

    def test_high_accepted(self):
        assert _parse_viirs_confidence("high") == "high"

    def test_low_stored(self):
        assert _parse_viirs_confidence("low") == "low"

    def test_single_char_n_is_nominal(self):
        assert _parse_viirs_confidence("n") == "nominal"

    def test_single_char_h_is_high(self):
        assert _parse_viirs_confidence("h") == "high"

    def test_single_char_l_is_low(self):
        assert _parse_viirs_confidence("l") == "low"

    def test_unknown_returns_none(self):
        assert _parse_viirs_confidence("") is None
        assert _parse_viirs_confidence("n/a") is None
        assert _parse_viirs_confidence("99") is None


class TestModisConfidence:
    def test_high_band(self):
        assert _parse_modis_confidence("80") == "high"
        assert _parse_modis_confidence("100") == "high"

    def test_nominal_band(self):
        assert _parse_modis_confidence("50") == "nominal"
        assert _parse_modis_confidence("79") == "nominal"

    def test_low_band(self):
        assert _parse_modis_confidence("0") == "low"
        assert _parse_modis_confidence("49") == "low"

    def test_invalid_string_returns_low(self):
        assert _parse_modis_confidence("not-a-number") == "low"
        assert _parse_modis_confidence("") == "low"


# ---------------------------------------------------------------------------
# GeoJSON builder
# ---------------------------------------------------------------------------

class TestRowsToGeojson:
    def _sample_row(self, lat=45.0, lon=-122.0, frp=5.0):
        return {
            "latitude": lat, "longitude": lon, "brightness": 310.0,
            "frp": frp, "confidence": "nominal", "satellite": "N-NPP",
            "instrument": "VIIRS", "source": "VIIRS_SNPP_NRT",
            "daynight": "D", "acq_date": "2026-04-14", "acq_time": "1430",
            "time": datetime.now(UTC).isoformat(),
        }

    def test_feature_collection_structure(self):
        rows = [self._sample_row()]
        gj = _rows_to_geojson(rows)
        assert gj["type"] == "FeatureCollection"
        assert len(gj["features"]) == 1
        assert "metadata" in gj

    def test_coordinates_are_lon_lat(self):
        row = self._sample_row(lat=45.0, lon=-122.0)
        gj = _rows_to_geojson([row])
        coords = gj["features"][0]["geometry"]["coordinates"]
        # GeoJSON is [lon, lat]
        assert coords == [-122.0, 45.0]

    def test_empty_rows(self):
        gj = _rows_to_geojson([])
        assert gj["features"] == []
        assert gj["metadata"]["count"] == 0

    def test_metadata_count(self):
        rows = [self._sample_row() for _ in range(5)]
        gj = _rows_to_geojson(rows)
        assert gj["metadata"]["count"] == 5


# ---------------------------------------------------------------------------
# CSV parser (the core ingest logic)
# ---------------------------------------------------------------------------

# Minimal realistic VIIRS NRT CSV header & row
_VIIRS_CSV = textwrap.dedent("""\
    latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
    45.1234,-122.5678,315.2,0.38,0.39,2026-04-14,1430,N,VIIRS,nominal,2.0NRT,295.1,12.5,D
    45.9876,-121.1234,320.0,0.40,0.41,2026-04-14,1432,N,VIIRS,high,2.0NRT,300.0,25.0,N
    45.0000,-122.0000,290.0,0.35,0.36,2026-04-14,1435,N,VIIRS,low,2.0NRT,285.0,0.3,D
""")

# Row with zero lat/lon — should be skipped
_VIIRS_CSV_ZERO = textwrap.dedent("""\
    latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
    0.0,0.0,315.2,0.38,0.39,2026-04-14,1430,N,VIIRS,nominal,2.0NRT,295.1,12.5,D
""")

_MODIS_CSV = textwrap.dedent("""\
    latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type
    45.5,-122.6,320.0,1.0,1.0,2026-04-14,1400,T,MODIS,75,6.7NRT,295.0,8.0,D,0
""")


class TestParseCsv:
    def _parse_with_source(self, csv_body: str, source: str = "VIIRS_SNPP_NRT"):
        """Parse CSV with a temporarily overridden FIRMS_SOURCE constant."""
        import sources.firms as firms_mod
        from unittest.mock import patch
        src = make_source()
        with patch.object(firms_mod, "FIRMS_SOURCE", source):
            return src._parse_csv(csv_body)

    def test_viirs_parses_two_valid_rows(self):
        db_rows, dicts = self._parse_with_source(_VIIRS_CSV, "VIIRS_SNPP_NRT")
        # low-confidence row has frp=0.3 MW < default FIRMS_MIN_FRP=0.5, so excluded
        # nominal + high rows both pass frp filter
        assert len(db_rows) == 2
        assert len(dicts) == 2

    def test_viirs_frp_filter(self):
        db_rows, _ = self._parse_with_source(_VIIRS_CSV, "VIIRS_SNPP_NRT")
        frps = [r[5] for r in db_rows]   # index 5 in tuple is frp
        assert all(f >= 0.5 for f in frps)

    def test_viirs_zero_latlon_skipped(self):
        db_rows, _ = self._parse_with_source(_VIIRS_CSV_ZERO, "VIIRS_SNPP_NRT")
        assert db_rows == []

    def test_modis_parses_single_row(self):
        db_rows, dicts = self._parse_with_source(_MODIS_CSV, "MODIS_NRT")
        assert len(db_rows) == 1
        assert dicts[0]["instrument"] == "MODIS"

    def test_empty_csv_returns_empty(self):
        db_rows, dicts = self._parse_with_source("", "VIIRS_SNPP_NRT")
        assert db_rows == []
        assert dicts == []

    def test_header_only_csv_returns_empty(self):
        header = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"
        db_rows, _ = self._parse_with_source(header, "VIIRS_SNPP_NRT")
        assert db_rows == []

    def test_deduplication(self):
        # Feed the same CSV twice through the same src instance — second pass yields 0 rows
        import sources.firms as firms_mod
        from unittest.mock import patch
        src = make_source()
        with patch.object(firms_mod, "FIRMS_SOURCE", "VIIRS_SNPP_NRT"):
            rows1, _ = src._parse_csv(_VIIRS_CSV)
            rows2, _ = src._parse_csv(_VIIRS_CSV)
        assert len(rows1) == 2
        assert len(rows2) == 0   # all keys already in _seen_keys

    def test_db_row_tuple_length(self):
        """DB row must have exactly 16 elements to match INSERT template."""
        db_rows, _ = self._parse_with_source(_VIIRS_CSV, "VIIRS_SNPP_NRT")
        for row in db_rows:
            assert len(row) == 16, f"Expected 16 elements, got {len(row)}: {row}"

    def test_timestamp_is_utc_datetime(self):
        db_rows, _ = self._parse_with_source(_VIIRS_CSV, "VIIRS_SNPP_NRT")
        for row in db_rows:
            ts = row[0]  # first element is the time
            assert isinstance(ts, datetime)
            assert ts.tzinfo is not None

    def test_brightness_field_fallback(self):
        """If bright_ti4 is missing but brightness exists, it should still parse."""
        csv = textwrap.dedent("""\
            latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
            45.1,-122.5,320.0,0.38,0.39,2026-04-14,1430,N,MODIS,75,6.7NRT,295.0,5.0,D
        """)
        db_rows, _ = self._parse_with_source(csv, "MODIS_NRT")
        assert len(db_rows) == 1


# ---------------------------------------------------------------------------
# FIRMSSource instantiation
# ---------------------------------------------------------------------------

class TestFIRMSSourceInstantiation:
    def test_default_interval_is_seconds(self):
        src = FIRMSSource(redis_client=None, db_url="postgresql://x/y", fetch_interval_m=10)
        assert src.fetch_interval == 600  # 10 min × 60

    def test_seen_keys_starts_empty(self):
        src = make_source()
        assert len(src._seen_keys) == 0


# ---------------------------------------------------------------------------
# Live integration test — skipped unless FIRMS_MAP_KEY is set in environment
# ---------------------------------------------------------------------------

@pytest.mark.integration
@pytest.mark.skipif(
    not os.environ.get("FIRMS_MAP_KEY") or os.environ.get("FIRMS_MAP_KEY") == "test-placeholder",
    reason="FIRMS_MAP_KEY not set — skipping live integration test",
)
def test_live_firms_fetch():
    """
    Live integration test.
    Set FIRMS_MAP_KEY in env before running:
        $env:FIRMS_MAP_KEY="YOUR_KEY_HERE"
        uv run python -m pytest tests/test_firms.py::test_live_firms_fetch -v -s

    Validates that:
    1. The real FIRMS NRT endpoint is reachable with the provided key.
    2. The response is valid CSV (or an expected empty response if no fires in area).
    3. Parsing produces structurally correct DB tuples.
    """
    import asyncio
    import httpx

    import sources.firms as firms_mod

    # Pick up the real key that was set before the import-time default
    real_key = os.environ["FIRMS_MAP_KEY"]
    firms_mod.FIRMS_MAP_KEY = real_key

    # Use Portland, OR area — CENTER_LAT/LON defaults
    west, south, east, north = _bbox_from_mission(45.5152, -122.6784, 150)
    bbox_str = f"{west:.4f},{south:.4f},{east:.4f},{north:.4f}"
    url = f"{firms_mod.FIRMS_BASE_URL}/{real_key}/VIIRS_SNPP_NRT/{bbox_str}/1"

    print(f"\n[FIRMS live test] GET {url}")

    async def _fetch():
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(url)
            return resp

    resp = asyncio.run(_fetch())
    print(f"[FIRMS live test] HTTP {resp.status_code} — content length: {len(resp.text)} chars")
    print(f"[FIRMS live test] First 500 chars:\n{resp.text[:500]}")

    assert resp.status_code == 200, (
        f"Expected HTTP 200, got {resp.status_code}.\n"
        f"Body: {resp.text[:300]}\n"
        f"Check that FIRMS_MAP_KEY='{real_key}' is valid at "
        "https://firms.modaps.eosdis.nasa.gov/api/area/"
    )

    # Parse the response
    src = FIRMSSource(redis_client=None, db_url="postgresql://localhost/test")
    db_rows, dicts = src._parse_csv(resp.text)

    print(f"[FIRMS live test] Parsed {len(db_rows)} hotspots (after FRP filter >= {firms_mod.FIRMS_MIN_FRP} MW)")

    # Structural checks on whatever came back
    for row in db_rows:
        assert len(row) == 16, f"Bad tuple length: {row}"
        ts = row[0]
        assert isinstance(ts, datetime), f"row[0] should be datetime: {ts!r}"
        lat, lon = row[1], row[2]
        assert -90 <= lat <= 90, f"Lat out of range: {lat}"
        assert -180 <= lon <= 180, f"Lon out of range: {lon}"

    print(f"[FIRMS live test] PASSED — {len(db_rows)} valid hotspots in area")

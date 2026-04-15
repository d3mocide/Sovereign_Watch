from __future__ import annotations

import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

import routers.firms as firms_router  # noqa: E402


def test_extract_land_geometry_geojson_keeps_only_polygonal_features() -> None:
    feature_collection = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 0.0]]],
                },
                "properties": {"name": "Land"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [0.0, 0.0]},
                "properties": {"name": "Ignore"},
            },
        ],
    }

    geometries = firms_router._extract_land_geometry_geojson(feature_collection)

    assert len(geometries) == 1
    assert json.loads(geometries[0])["type"] == "Polygon"


def test_parse_firms_csv_to_rows_filters_and_normalizes_live_world_feed() -> None:
    csv_body = """latitude,longitude,bright_ti4,frp,confidence,satellite,acq_date,acq_time,daynight\n45.5,-122.6,330.1,12.4,h,SNPP,2026-04-14,0402,N\n46.1,-123.0,310.0,0.1,l,SNPP,2026-04-14,0404,D\n"""

    rows = firms_router._parse_firms_csv_to_rows(
        csv_body,
        source="VIIRS_SNPP_NRT",
        hours_back=72,
        min_frp=0.5,
        confidence="",
        limit=2000,
    )

    assert len(rows) == 1
    assert rows[0]["confidence"] == "high"
    assert rows[0]["instrument"] == "VIIRS"
    assert rows[0]["source"] == "VIIRS_SNPP_NRT"


@pytest.mark.asyncio
async def test_get_firms_hotspots_prefers_live_global_fallback_when_not_ingesting_global() -> None:
    redis_client = AsyncMock()
    redis_client.get = AsyncMock(return_value=None)
    redis_client.setex = AsyncMock()

    with patch.object(firms_router.db, "redis_client", redis_client), patch.object(
        firms_router.db, "pool", None
    ), patch.object(
        firms_router, "FIRMS_BBOX_MODE", "mission"
    ), patch.object(
        firms_router, "_fetch_live_global_hotspots", new_callable=AsyncMock
    ) as mock_live_fetch:
        mock_live_fetch.return_value = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [-122.6, 45.5]},
                    "properties": {"frp": 12.4},
                }
            ],
            "metadata": {"count": 1, "scope": "global_live"},
        }

        result = await firms_router.get_firms_hotspots(
            min_lat=-90.0,
            max_lat=90.0,
            min_lon=-180.0,
            max_lon=180.0,
            hours_back=24,
            min_frp=0.0,
            confidence="",
            limit=2000,
        )

    assert len(result["features"]) == 1
    mock_live_fetch.assert_awaited_once()
    redis_client.setex.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_firms_hotspots_uses_primary_cache_only_when_ingesting_global() -> None:
    cached = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [1, 2]},
                "properties": {},
            }
        ],
    }
    redis_client = AsyncMock()
    redis_client.get = AsyncMock(return_value=json.dumps(cached))

    with patch.object(firms_router.db, "redis_client", redis_client), patch.object(
        firms_router.db, "pool", None
    ), patch.object(
        firms_router, "FIRMS_BBOX_MODE", "global"
    ), patch.object(
        firms_router, "_fetch_live_global_hotspots", new_callable=AsyncMock
    ) as mock_live_fetch:
        result = await firms_router.get_firms_hotspots(
            min_lat=-90.0,
            max_lat=90.0,
            min_lon=-180.0,
            max_lon=180.0,
            hours_back=24,
            min_frp=0.0,
            confidence="",
            limit=2000,
        )

    assert result == cached
    mock_live_fetch.assert_not_called()


class _Acquire:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.mark.asyncio
async def test_get_dark_vessels_applies_land_mask_geometries() -> None:
    conn = MagicMock()
    conn.fetch = AsyncMock(return_value=[])
    pool = MagicMock()
    pool.acquire.return_value = _Acquire(conn)
    land_geometries = ['{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}']

    with patch.object(firms_router.db, "redis_client", None), patch.object(
        firms_router.db, "pool", pool
    ), patch.object(
        firms_router, "_WORLD_LAND_GEOMETRIES", land_geometries
    ):
        result = await firms_router.get_dark_vessels()

    assert result["type"] == "FeatureCollection"
    fetch_args = conn.fetch.await_args.args
    assert "land_polygons" in fetch_args[0]
    assert "ST_Intersects" in fetch_args[0]
    assert fetch_args[10] == land_geometries

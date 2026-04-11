"""
Unit tests for the FAA NOTAM router (/api/notam/*).

Covers:
  - GET /api/notam/active     — Redis cache hit, miss, and not-ready
  - GET /api/notam/history    — DB query success, optional filters, not-ready
  - GET /api/notam/{notam_id} — detail lookup, 404 case, DB not-ready
"""

import json
import os
import sys
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs(include_psutil=True)

from core.auth import get_current_user  # noqa: E402
from main import app  # noqa: E402

# ── Fixtures ──────────────────────────────────────────────────────────────────

_SAMPLE_NOTAM_ROW = {
    "time": datetime(2026, 4, 11, 12, 0, 0, tzinfo=timezone.utc),
    "notam_id": "7/7894",
    "icao_id": "KORD",
    "feature_name": "CHICAGO",
    "classification": "DOM",
    "keyword": "TFR",
    "effective_start": datetime(2026, 4, 11, 10, 0, 0, tzinfo=timezone.utc),
    "effective_end": datetime(2026, 4, 12, 10, 0, 0, tzinfo=timezone.utc),
    "lat": 41.98,
    "lon": -87.90,
    "radius_nm": 5.0,
    "min_alt_ft": 0,
    "max_alt_ft": 18000,
    "raw_text": "!ORD 04/123 ORD AIRSPACE TFR ...",
    "geom_type": "POINT",
}

_SAMPLE_GEOJSON = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-87.90, 41.98]},
            "properties": {
                "notam_id": "7/7894",
                "keyword": "TFR",
                "category": "TFR",
            },
        }
    ],
}


@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user] = lambda: {
        "id": 1,
        "username": "admin",
        "role": "admin",
        "is_active": True,
    }
    yield
    app.dependency_overrides.clear()


# ── /api/notam/active ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_active_notams_redis_not_ready():
    """503 when Redis is unavailable."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.redis_client", None):
            response = await client.get("/api/notam/active")
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_active_notams_redis_hit():
    """Returns parsed GeoJSON from Redis cache on hit."""
    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(_SAMPLE_GEOJSON))

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.redis_client", mock_redis):
            response = await client.get("/api/notam/active")

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 1
    assert body["features"][0]["properties"]["keyword"] == "TFR"


@pytest.mark.asyncio
async def test_active_notams_redis_miss():
    """Returns empty FeatureCollection when Redis key is absent."""
    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=None)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.redis_client", mock_redis):
            response = await client.get("/api/notam/active")

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert body["features"] == []


# ── /api/notam/history ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notam_history_db_not_ready():
    """503 when database pool is unavailable."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", None):
            response = await client.get("/api/notam/history")
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_notam_history_success():
    """Returns GeoJSON FeatureCollection with correct geometry."""
    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=[_SAMPLE_NOTAM_ROW])

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", mock_pool):
            response = await client.get("/api/notam/history?hours=24")

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 1
    feat = body["features"][0]
    assert feat["geometry"]["type"] == "Point"
    assert feat["geometry"]["coordinates"] == [-87.90, 41.98]
    assert feat["properties"]["notam_id"] == "7/7894"
    assert feat["properties"]["keyword"] == "TFR"


@pytest.mark.asyncio
async def test_notam_history_keyword_filter():
    """keyword query param is accepted without error."""
    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=[])

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", mock_pool):
            response = await client.get("/api/notam/history?keyword=GPS")

    assert response.status_code == 200
    body = response.json()
    assert body["features"] == []


@pytest.mark.asyncio
async def test_notam_history_skips_missing_coords():
    """Features without lat/lon are silently dropped."""
    null_row = dict(_SAMPLE_NOTAM_ROW)
    null_row["lat"] = None
    null_row["lon"] = None

    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=[null_row])

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", mock_pool):
            response = await client.get("/api/notam/history")

    assert response.status_code == 200
    assert response.json()["features"] == []


# ── /api/notam/{notam_id} ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notam_detail_db_not_ready():
    """503 when database pool is unavailable."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", None):
            response = await client.get("/api/notam/7%2F7894")
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_notam_detail_found():
    """Returns full NOTAM detail object for a known ID."""
    mock_conn = MagicMock()
    mock_conn.fetchrow = AsyncMock(return_value=_SAMPLE_NOTAM_ROW)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", mock_pool):
            response = await client.get("/api/notam/7%2F7894")

    assert response.status_code == 200
    body = response.json()
    assert body["notam_id"] == "7/7894"
    assert body["icao_id"] == "KORD"
    assert body["lat"] == 41.98
    assert body["lon"] == -87.90


@pytest.mark.asyncio
async def test_notam_detail_not_found():
    """Returns 404 when NOTAM ID is unknown."""
    mock_conn = MagicMock()
    mock_conn.fetchrow = AsyncMock(return_value=None)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", mock_pool):
            response = await client.get("/api/notam/UNKNOWN")

    assert response.status_code == 404

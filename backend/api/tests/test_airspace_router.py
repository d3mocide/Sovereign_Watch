"""
Unit tests for the OpenAIP Airspace Zones router (/api/airspace/*).

Covers:
  - GET /api/airspace/zones     — Redis cache hit, miss, not-ready
  - GET /api/airspace/history   — DB query, type/country filters, not-ready
  - GET /api/airspace/types     — type summary, DB not-ready
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

_POLYGON_GEOM = {
    "type": "Polygon",
    "coordinates": [
        [[-87.5, 41.5], [-87.5, 42.5], [-88.5, 42.5], [-88.5, 41.5], [-87.5, 41.5]]
    ],
}

_SAMPLE_ROW = {
    "time": datetime(2026, 4, 11, 12, 0, 0, tzinfo=timezone.utc),
    "zone_id": "abc123",
    "name": "Chicago Restricted",
    "type": "RESTRICTED",
    "icao_class": None,
    "country": "US",
    "upper_limit": "FL 180",
    "lower_limit": "GND",
    "geometry_json": json.dumps(_POLYGON_GEOM),
}

_SAMPLE_FC = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "geometry": _POLYGON_GEOM,
            "properties": {"zone_id": "abc123", "type": "RESTRICTED", "country": "US"},
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


# ── /api/airspace/zones ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_airspace_zones_redis_not_ready():
    """503 when Redis is unavailable."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.redis_client", None):
            response = await client.get("/api/airspace/zones")
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_airspace_zones_redis_hit():
    """Returns parsed GeoJSON FeatureCollection from Redis on hit."""
    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(_SAMPLE_FC))

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.redis_client", mock_redis):
            response = await client.get("/api/airspace/zones")

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 1
    assert body["features"][0]["properties"]["type"] == "RESTRICTED"


@pytest.mark.asyncio
async def test_airspace_zones_redis_miss():
    """Returns empty FeatureCollection when key is absent."""
    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=None)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.redis_client", mock_redis):
            response = await client.get("/api/airspace/zones")

    assert response.status_code == 200
    assert response.json() == {"type": "FeatureCollection", "features": []}


# ── /api/airspace/history ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_airspace_history_db_not_ready():
    """503 when database pool is unavailable."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", None):
            response = await client.get("/api/airspace/history")
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_airspace_history_success():
    """Returns GeoJSON FeatureCollection with correct polygon geometry."""
    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=[_SAMPLE_ROW])

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", mock_pool):
            response = await client.get("/api/airspace/history?hours=24")

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 1
    feat = body["features"][0]
    assert feat["geometry"]["type"] == "Polygon"
    assert feat["properties"]["type"] == "RESTRICTED"
    assert feat["properties"]["country"] == "US"


@pytest.mark.asyncio
async def test_airspace_history_type_filter():
    """zone_type query param is accepted without error."""
    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=[])

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", mock_pool):
            response = await client.get("/api/airspace/history?zone_type=DANGER")

    assert response.status_code == 200
    assert response.json()["features"] == []


@pytest.mark.asyncio
async def test_airspace_history_country_filter():
    """country query param is accepted without error."""
    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=[])

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", mock_pool):
            response = await client.get("/api/airspace/history?country=DE")

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_airspace_history_skips_bad_geometry():
    """Rows with unparseable geometry_json are silently dropped."""
    bad_row = dict(_SAMPLE_ROW)
    bad_row["geometry_json"] = "not valid json {"

    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=[bad_row])

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", mock_pool):
            response = await client.get("/api/airspace/history")

    assert response.status_code == 200
    assert response.json()["features"] == []


@pytest.mark.asyncio
async def test_airspace_history_rejects_hours_too_large():
    """hours > 720 should return 422 (FastAPI validation)."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/api/airspace/history?hours=9999")
    assert response.status_code == 422


# ── /api/airspace/types ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_airspace_types_db_not_ready():
    """503 when database pool is unavailable."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", None):
            response = await client.get("/api/airspace/types")
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_airspace_types_success():
    """Returns type summary list."""
    mock_rows = [
        {"type": "RESTRICTED", "count": 42},
        {"type": "DANGER", "count": 17},
    ]
    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=mock_rows)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.pool", mock_pool):
            response = await client.get("/api/airspace/types")

    assert response.status_code == 200
    body = response.json()
    assert "types" in body
    assert body["types"][0] == {"type": "RESTRICTED", "count": 42}

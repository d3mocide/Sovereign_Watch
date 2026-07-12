import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

# Add the api directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

# Mock heavy dependencies before importing main
install_common_test_stubs(include_psutil=True)

from core.auth import get_current_user  # noqa: E402
from main import app  # noqa: E402


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


@pytest.mark.asyncio
async def test_get_activity_stats_no_pool():
    """Test that 503 is returned if database is not ready."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("core.database.db.pool", None):
            response = await client.get("/api/stats/activity")
            assert response.status_code == 503


@pytest.mark.asyncio
async def test_get_tak_breakdown_success():
    """Test successful TAK breakdown retrieval with mocked database."""
    transport = ASGITransport(app=app)

    mock_records = [
        {"type": "a-f-A-C-F", "count": 100},
        {"type": "a-f-S-C-M", "count": 50},
    ]

    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=mock_records)

    mock_pool = MagicMock()
    # Mocking the async context manager for pool.acquire()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("core.database.db.pool", mock_pool):
            response = await client.get("/api/stats/tak-breakdown")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "ok"
            assert len(data["data"]) == 2
            assert data["data"][0]["label"] == "Civilian Fixed Wing"
            assert data["data"][1]["label"] == "Maritime Surface"


@pytest.mark.asyncio
async def test_get_activity_stats_success():
    """Test successful activity stats retrieval with mocked database."""
    transport = ASGITransport(app=app)

    from datetime import datetime

    mock_records = [
        {"bucket": datetime(2026, 3, 26, 10, 0), "type": "a-f-A-C-F", "count": 10},
        {"bucket": datetime(2026, 3, 26, 10, 0), "type": "a-f-S-C-M", "count": 5},
    ]

    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=mock_records)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("core.database.db.pool", mock_pool):
            response = await client.get("/api/stats/activity?hours=1")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "ok"
            assert len(data["data"]) == 1
            assert data["data"][0]["counts"]["a-f-A-C-F"] == 10


def _clausalizer_mock_pool():
    """Pool whose conn records every SQL string passed to fetch/fetchrow."""
    executed: list[str] = []
    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
        executed.append(sql)
        return []

    async def _fetchrow(sql: str, *params):
        executed.append(sql)
        return None

    mock_conn.fetch = AsyncMock(side_effect=_fetch)
    mock_conn.fetchrow = AsyncMock(side_effect=_fetchrow)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
    return mock_pool, executed


@pytest.mark.asyncio
async def test_clausalizer_timeline_uses_hourly_aggregate_for_long_windows():
    from core.database import db

    mock_pool, executed = _clausalizer_mock_pool()
    with patch.object(db, "pool", mock_pool):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/stats/clausalizer?hours=72")

    assert resp.status_code == 200
    body = resp.json()
    assert body["timeline_bucket_minutes"] == 60
    assert any("hourly_clausal_summaries" in sql for sql in executed)


@pytest.mark.asyncio
async def test_clausalizer_timeline_uses_minute_buckets_for_short_windows():
    from core.database import db

    mock_pool, executed = _clausalizer_mock_pool()
    with patch.object(db, "pool", mock_pool):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/stats/clausalizer?hours=6")

    assert resp.status_code == 200
    body = resp.json()
    assert body["timeline_bucket_minutes"] == 1
    assert not any("hourly_clausal_summaries" in sql for sql in executed)

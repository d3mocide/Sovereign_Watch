import os
import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

# Add the api directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Mock heavy dependencies before importing main
_mock_asyncpg = MagicMock()
_mock_asyncpg.create_pool = AsyncMock()
sys.modules["asyncpg"] = _mock_asyncpg

_mock_redis_pkg = types.ModuleType("redis")
_mock_redis_asyncio = types.ModuleType("redis.asyncio")
_mock_redis_asyncio.from_url = AsyncMock()
_mock_redis_asyncio.Redis = MagicMock()
_mock_redis_pkg.asyncio = _mock_redis_asyncio
sys.modules["redis"] = _mock_redis_pkg
sys.modules["redis.asyncio"] = _mock_redis_asyncio

_mock_aiokafka = types.ModuleType("aiokafka")
_mock_aiokafka.AIOKafkaConsumer = MagicMock()
_mock_aiokafka.AIOKafkaProducer = MagicMock()
_mock_aiokafka_admin = types.ModuleType("aiokafka.admin")
_mock_aiokafka_admin.AIOKafkaAdminClient = MagicMock()
_mock_aiokafka.admin = _mock_aiokafka_admin
sys.modules["aiokafka"] = _mock_aiokafka
sys.modules["aiokafka.admin"] = _mock_aiokafka_admin

sys.modules["psutil"] = MagicMock()

_mock_numpy = types.ModuleType("numpy")
_mock_numpy.bool_ = bool
_mock_numpy.isscalar = lambda _obj: False
_mock_numpy.ndarray = tuple
sys.modules["numpy"] = _mock_numpy

sys.modules["litellm"] = MagicMock()

from main import app  # noqa: E402


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

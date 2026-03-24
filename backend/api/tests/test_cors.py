
import pytest
from unittest.mock import AsyncMock, MagicMock
import os
import sys
import types
from httpx import AsyncClient, ASGITransport

# Add the api directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Mock heavy dependencies before importing main so that modules which are
# not installed (asyncpg, redis, aiokafka, litellm) never need to be resolved.
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
sys.modules["aiokafka"] = _mock_aiokafka

_mock_numpy = types.ModuleType("numpy")
_mock_numpy.bool_ = bool
_mock_numpy.isscalar = lambda _obj: False
_mock_numpy.ndarray = tuple
sys.modules["numpy"] = _mock_numpy

sys.modules["litellm"] = MagicMock()

from main import app  # noqa: E402

@pytest.mark.asyncio
async def test_cors_allowed_origin():
    """
    Test that CORS allows configured origins.
    """
    transport = ASGITransport(app=app)
    # Read origins from environment or fallback to default to match main.py logic
    allowed_list = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")]
    test_origin = allowed_list[0]
    
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health", headers={"Origin": test_origin})
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == test_origin

@pytest.mark.asyncio
async def test_cors_disallowed_origin():
    """
    Test that CORS disallows unconfigured origins.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # http://evil.com is not in the default allowed list
        response = await client.get("/health", headers={"Origin": "http://evil.com"})
        assert response.status_code == 200
        # The header should NOT be present for disallowed origins
        assert "access-control-allow-origin" not in response.headers

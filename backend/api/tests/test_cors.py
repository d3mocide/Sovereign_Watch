
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import os
import sys
from httpx import AsyncClient, ASGITransport

# Add the api directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Mock litellm
mock_litellm = MagicMock()
sys.modules["litellm"] = mock_litellm

# Mock dependencies
with patch("asyncpg.create_pool", new=AsyncMock()) as mock_pool, \
     patch("redis.from_url", new=AsyncMock()) as mock_redis, \
     patch("aiokafka.AIOKafkaConsumer", new=MagicMock()) as mock_kafka:

    from main import app

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

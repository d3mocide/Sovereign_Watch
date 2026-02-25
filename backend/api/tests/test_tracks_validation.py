
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
    from core.database import db

@pytest.mark.asyncio
async def test_history_limit_validation():
    """
    Test that excessive limits are rejected.
    """
    # Mock the database pool
    db.pool = AsyncMock()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Request with excessive limit
        response = await client.get("/api/tracks/history/123?limit=10000")
        assert response.status_code == 400
        assert "limit" in response.json()["detail"].lower()

        # Request with excessive hours
        response = await client.get("/api/tracks/history/123?hours=1000")
        assert response.status_code == 400
        assert "hours" in response.json()["detail"].lower()

@pytest.mark.asyncio
async def test_history_error_handling():
    """
    Test that database errors are sanitized.
    """
    # Mock the database pool
    db.pool = AsyncMock()
    # Mock fetch to raise an exception with a specific sensitive message
    sensitive_error = "SyntaxError: SELECT * FROM secrets"
    db.pool.fetch.side_effect = Exception(sensitive_error)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/tracks/history/123")

        # Should be 500
        assert response.status_code == 500
        # The sensitive error should NOT be in the response detail
        assert sensitive_error not in response.json()["detail"]
        assert response.json()["detail"] == "Internal server error"

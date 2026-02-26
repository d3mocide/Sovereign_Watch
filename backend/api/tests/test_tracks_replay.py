
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
async def test_replay_tracks_huge_range_blocked():
    """
    Test that requesting replay with a huge time range is now blocked with 400.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Request 1 year range
        start = "2023-01-01T00:00:00Z"
        end = "2024-01-01T00:00:00Z"
        response = await client.get(f"/api/tracks/replay?start={start}&end={end}")

        assert response.status_code == 400
        assert "Time range exceeds maximum allowed" in response.json()["detail"]

@pytest.mark.asyncio
async def test_replay_tracks_valid_range():
    """
    Test that a valid range is accepted (and returns 503 because DB is not ready).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Request 1 hour range
        start = "2023-01-01T00:00:00Z"
        end = "2023-01-01T01:00:00Z"
        response = await client.get(f"/api/tracks/replay?start={start}&end={end}")

        # It should pass validation and try to connect to DB, failing with 503
        assert response.status_code == 503

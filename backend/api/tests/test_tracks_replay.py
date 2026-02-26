
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import os
import sys
from datetime import datetime, timedelta, timezone
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
    from core.config import settings

@pytest.mark.asyncio
async def test_replay_limit_exceeded():
    """
    Test that requesting replay with limit exceeding the max limit returns 400.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Default max limit is 10000. Request 10001.
        start = datetime.now(timezone.utc).isoformat()
        end = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        params = {"start": start, "end": end, "limit": 10001}
        response = await client.get("/api/tracks/replay", params=params)
        assert response.status_code == 400
        assert "Limit exceeds maximum allowed" in response.json()["detail"]

@pytest.mark.asyncio
async def test_replay_time_window_exceeded():
    """
    Test that requesting replay with time window exceeding the max hours returns 400.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Default max hours is 168 (7 days). Request 8 days.
        start = datetime.now(timezone.utc)
        end = start + timedelta(days=8)

        params = {"start": start.isoformat(), "end": end.isoformat(), "limit": 100}
        response = await client.get("/api/tracks/replay", params=params)
        assert response.status_code == 400
        assert "Time range exceeds maximum allowed" in response.json()["detail"]

@pytest.mark.asyncio
async def test_replay_valid_request():
    """
    Test that a valid request passes validation.
    Expect 503 "Database not ready" which indicates validation passed.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Valid request
        start = datetime.now(timezone.utc)
        end = start + timedelta(hours=1)

        params = {"start": start.isoformat(), "end": end.isoformat(), "limit": 100}
        response = await client.get("/api/tracks/replay", params=params)

        # We expect 503 because db.pool is None in this test environment without full startup
        # But crucially, it is NOT 400.
        assert response.status_code == 503
        assert "Database not ready" in response.json()["detail"]

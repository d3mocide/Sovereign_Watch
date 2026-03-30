
import pytest
import os
import sys
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient, ASGITransport

# Add the api directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from test_stubs import install_common_test_stubs  # noqa: E402

# Mock heavy dependencies before importing main so that modules which are
# not installed (asyncpg, redis, aiokafka, litellm) never need to be resolved.
install_common_test_stubs(include_psutil=True)

from main import app  # noqa: E402

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

@pytest.mark.asyncio
async def test_replay_negative_duration():
    """
    Test that requesting replay with end time before start time returns 400.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # BUG-006: End time before start time
        start = datetime.now(timezone.utc)
        end = start - timedelta(hours=1)

        params = {"start": start.isoformat(), "end": end.isoformat(), "limit": 100}
        response = await client.get("/api/tracks/replay", params=params)
        assert response.status_code == 400
        assert "end must be after start" in response.json()["detail"]

@pytest.mark.asyncio
async def test_replay_zero_duration():
    """
    Test that requesting replay with end time equal to start time returns 400.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # BUG-006: End time equal to start time
        now = datetime.now(timezone.utc).isoformat()
        params = {"start": now, "end": now, "limit": 100}
        response = await client.get("/api/tracks/replay", params=params)
        assert response.status_code == 400
        assert "end must be after start" in response.json()["detail"]

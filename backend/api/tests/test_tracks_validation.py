
import pytest
import os
import sys
from httpx import AsyncClient, ASGITransport

# Add the api directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from test_stubs import install_common_test_stubs  # noqa: E402

# Mock heavy dependencies before importing main so that modules which are
# not installed (asyncpg, redis, aiokafka, litellm) never need to be resolved.
install_common_test_stubs(include_psutil=True)

from core.auth import get_current_user # noqa: E402
from core.config import settings  # noqa: E402
from main import app  # noqa: E402

@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "username": "admin", "role": "admin", "is_active": True}
    yield
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_track_history_limit_exceeded():
    """
    Test that requesting history exceeding the max limit returns 400.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        over_limit = settings.TRACK_HISTORY_MAX_LIMIT + 1
        response = await client.get(f"/api/tracks/history/test-entity?limit={over_limit}")
        assert response.status_code == 400
        assert "Limit exceeds maximum allowed" in response.json()["detail"]

@pytest.mark.asyncio
async def test_track_history_hours_exceeded():
    """
    Test that requesting history exceeding the max hours returns 400.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        over_hours = settings.TRACK_HISTORY_MAX_HOURS + 1
        response = await client.get(f"/api/tracks/history/test-entity?hours={over_hours}")
        assert response.status_code == 400
        assert "Hours exceeds maximum allowed" in response.json()["detail"]

@pytest.mark.asyncio
async def test_track_history_valid_request():
    """
    Test that a valid request passes validation.
    Note: Since we haven't mocked the DB pool explicitly in the app startup for this test execution context
    (unless we use a fixture that sets app.state.pool), it might return 503 "Database not ready".
    Getting 503 proves it PASSED the validation checks (which return 400).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Valid request: limit=100, hours=24
        response = await client.get("/api/tracks/history/test-entity?limit=100&hours=24")

        # We expect 503 because db.pool is None in this test environment without full startup
        # But crucially, it is NOT 400.
        assert response.status_code == 503
        assert "Database not ready" in response.json()["detail"]


@pytest.mark.asyncio
async def test_search_tracks_limit_exceeded():
    """
    Test that requesting search exceeding the max limit returns 400.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Default limit is 100. Request 101.
        response = await client.get("/api/tracks/search?q=test&limit=101")
        assert response.status_code == 400
        assert "Limit exceeds maximum allowed" in response.json()["detail"]

@pytest.mark.asyncio
async def test_search_tracks_negative_limit():
    """
    Test that requesting search with zero or negative limit returns 400.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/tracks/search?q=test&limit=0")
        assert response.status_code == 400
        assert "limit must be a positive integer" in response.json()["detail"]

@pytest.mark.asyncio
async def test_search_tracks_long_query():
    """
    Test that requesting search with extremely long query string returns 400.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        long_query = "a" * 101
        response = await client.get(f"/api/tracks/search?q={long_query}")
        assert response.status_code == 400
        assert "Query string is too long" in response.json()["detail"]

@pytest.mark.asyncio
async def test_search_tracks_valid_request():
    """
    Test that a valid search request passes validation.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/tracks/search?q=test&limit=10")
        assert response.status_code == 503  # DB not ready is expected
        assert "Database not ready" in response.json()["detail"]

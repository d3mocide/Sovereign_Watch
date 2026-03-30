
import pytest
import os
import sys
from httpx import AsyncClient, ASGITransport

# Add the api directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from test_stubs import install_common_test_stubs  # noqa: E402

# Mock heavy dependencies before importing main so that modules which are
# not installed (asyncpg, redis, aiokafka, litellm) never need to be resolved.
install_common_test_stubs()

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

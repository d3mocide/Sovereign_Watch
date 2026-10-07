"""Regression coverage for per-user proxy-safe configuration limits."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from .test_stubs import install_common_test_stubs

install_common_test_stubs()
from core.auth import get_current_user  # noqa: E402 -- dependency stubs must precede application imports
from main import app  # noqa: E402 -- dependency stubs must precede application imports
from services import rate_limit  # noqa: E402 -- dependency stubs must precede application imports


@pytest.mark.asyncio
async def test_users_and_operations_have_independent_buckets():
    redis = AsyncMock()
    redis.eval.return_value = [1, 60]
    with patch.object(rate_limit.db, "redis_client", redis):
        await rate_limit.check_write_rate_limit("config_location", {"id": 1})
        await rate_limit.check_write_rate_limit("config_location", {"id": 2})
        await rate_limit.check_write_rate_limit("config_ai", {"id": 1})
    keys = [call.args[2] for call in redis.eval.call_args_list]
    assert len(set(keys)) == 3
    assert keys[0] == "rate_limit:config_location:user:1"


@pytest.mark.asyncio
async def test_limit_boundary_and_retry_after():
    redis = AsyncMock()
    redis.eval.side_effect = [[20, 12], [21, 11]]
    with patch.object(rate_limit.db, "redis_client", redis):
        await rate_limit.check_write_rate_limit("config_ai", {"id": 1})
        with pytest.raises(HTTPException) as caught:
            await rate_limit.check_write_rate_limit("config_ai", {"id": 1})
    assert caught.value.status_code == 429
    assert caught.value.headers == {"Retry-After": "11"}


@pytest.mark.asyncio
async def test_limiter_failure_is_logged_and_does_not_block_writes(caplog):
    redis = AsyncMock()
    redis.eval.side_effect = ConnectionError("Redis unavailable")
    with patch.object(rate_limit.db, "redis_client", redis):
        await rate_limit.check_write_rate_limit("config_location", {"id": 1})
    assert "Write limiter unavailable" in caplog.text


@pytest.mark.asyncio
async def test_shared_proxy_clients_are_limited_by_authenticated_user():
    redis = AsyncMock()

    async def evaluate(_script, _count, key, _window):
        return [21 if key.endswith("user:1") else 1, 60]

    redis.eval.side_effect = evaluate
    user = {"id": 1, "username": "operator-a", "role": "operator", "is_active": True}
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with patch.object(rate_limit.db, "redis_client", redis):
            async with AsyncClient(
                transport=ASGITransport(app=app, client=("172.18.0.4", 4000)),
                base_url="http://test",
            ) as client:
                payload = {"lat": 45, "lon": -122, "radius_nm": 100}
                blocked = await client.post("/api/config/location", json=payload)
                user = {**user, "id": 2, "username": "operator-b"}
                allowed = await client.post("/api/config/location", json=payload)
        assert blocked.status_code == 429
        assert allowed.status_code == 200
        assert redis.set.await_count == 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_role_checks_still_guard_configuration_writes():
    app.dependency_overrides[get_current_user] = lambda: {
        "id": 1,
        "role": "viewer",
        "is_active": True,
    }
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/config/location", json={"lat": 45, "lon": -122, "radius_nm": 100}
            )
            ai = await client.post("/api/config/ai", json={"model_id": "test"})
        assert response.status_code == 403
        assert ai.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)

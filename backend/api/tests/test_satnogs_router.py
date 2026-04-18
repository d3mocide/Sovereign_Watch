from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

from core.auth import get_current_user  # noqa: E402
from main import app  # noqa: E402
from routers.satnogs import (  # noqa: E402
    CACHE_TTL_STATIONS_ERROR,
    MAX_STATIONS_BACKOFF,
    _build_backoff_payload,
    _extract_retry_after_seconds,
    _parse_backoff_payload,
    _sanitize_backoff_seconds,
)


@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user] = lambda: {
        "id": 1,
        "username": "admin",
        "role": "admin",
        "is_active": True,
    }
    yield
    app.dependency_overrides.clear()


def test_extract_retry_after_seconds_prefers_header_value() -> None:
    response = httpx.Response(
        429,
        headers={"Retry-After": "2079"},
        json={"detail": "Request was throttled. Expected available in 9999 seconds."},
    )

    assert _extract_retry_after_seconds(response) == 2079


def test_extract_retry_after_seconds_parses_throttle_detail() -> None:
    response = httpx.Response(
        429,
        json={"detail": "Request was throttled. Expected available in 2079 seconds."},
    )

    assert _extract_retry_after_seconds(response) == 2079


def test_extract_retry_after_seconds_uses_default_when_unparseable() -> None:
    response = httpx.Response(429, json={"detail": "rate limited"})

    assert _extract_retry_after_seconds(response) == CACHE_TTL_STATIONS_ERROR


def test_sanitize_backoff_seconds_clamps_to_bounds() -> None:
    assert _sanitize_backoff_seconds(1) == CACHE_TTL_STATIONS_ERROR
    assert _sanitize_backoff_seconds(MAX_STATIONS_BACKOFF + 1) == MAX_STATIONS_BACKOFF


def test_build_and_parse_backoff_payload_round_trip() -> None:
    payload = _parse_backoff_payload(
        _build_backoff_payload(retry_after_s=2079, reason="http_429")
    )

    assert payload is not None
    assert payload["reason"] == "http_429"
    assert payload["retry_after_s"] == 2079
    assert isinstance(payload["backoff_until"], int)


class _FailingAsyncClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, _url: str):
        raise httpx.ConnectError("network down")


class _TimeoutThenSuccessAsyncClient:
    def __init__(self):
        self.calls = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, _url: str):
        self.calls += 1
        if self.calls == 1:
            raise httpx.ConnectTimeout("timed out")
        return httpx.Response(
            200,
            json=[
                {
                    "id": 1,
                    "name": "Station One",
                    "status": "Online",
                    "online": True,
                    "last_seen": "2026-04-17T18:12:00Z",
                    "lat": 35.0,
                    "lng": -97.0,
                    "alt": 10,
                }
            ],
            request=httpx.Request("GET", "https://network.satnogs.org/api/stations/"),
        )


class _TimeoutAsyncClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, _url: str):
        raise httpx.ConnectTimeout("timed out")


@pytest.mark.asyncio
async def test_stations_returns_empty_payload_when_upstream_network_fails() -> None:
    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.redis_client", mock_redis), patch(
            "routers.satnogs.httpx.AsyncClient", return_value=_FailingAsyncClient()
        ):
            response = await client.get("/api/satnogs/stations?include_meta=true")

    assert response.status_code == 200
    body = response.json()
    assert body["stations"] == []
    assert body["meta"]["source"] == "upstream_network_error"
    assert body["meta"]["count"] == 0
    assert body["meta"]["error"] == "Failed to fetch upstream SatNOGS network stations"


@pytest.mark.asyncio
async def test_stations_retries_once_after_timeout_and_succeeds() -> None:
    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()
    mock_redis.delete = AsyncMock()
    retrying_client = _TimeoutThenSuccessAsyncClient()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.redis_client", mock_redis), patch(
            "routers.satnogs.httpx.AsyncClient", return_value=retrying_client
        ):
            response = await client.get("/api/satnogs/stations?include_meta=true")

    assert response.status_code == 200
    body = response.json()
    assert retrying_client.calls == 2
    assert body["meta"]["source"] == "live"
    assert body["meta"]["count"] == 1
    assert body["stations"][0]["status"] == "online"


@pytest.mark.asyncio
async def test_stations_returns_timeout_metadata_when_retries_exhausted() -> None:
    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        with patch("core.database.db.redis_client", mock_redis), patch(
            "routers.satnogs.httpx.AsyncClient", return_value=_TimeoutAsyncClient()
        ):
            response = await client.get("/api/satnogs/stations?include_meta=true")

    assert response.status_code == 200
    body = response.json()
    assert body["stations"] == []
    assert body["meta"]["source"] == "upstream_timeout"
    assert body["meta"]["error"] == "SatNOGS upstream request timed out"
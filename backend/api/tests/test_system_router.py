from __future__ import annotations

import json
import os
import sys
import time
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

import routers.system as system_router  # noqa: E402


def test_build_firms_detail_formats_source_status_snapshot() -> None:
    snapshot = json.dumps(
        {
            "sources": [
                {"source": "VIIRS_NOAA20_NRT", "status": "ok", "count": 515},
                {"source": "VIIRS_NOAA21_NRT", "status": "ok", "count": 491},
                {"source": "VIIRS_SNPP_NRT", "status": "empty", "count": 0},
            ]
        }
    )

    detail = system_router._build_firms_detail(snapshot)

    assert detail == "NOAA20:515 | NOAA21:491 | SNPP:empty"


class _MockAsyncClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, _url: str):
        response = AsyncMock()
        response.status_code = 200
        return response


@pytest.mark.asyncio
async def test_get_poller_health_includes_firms_summary_detail() -> None:
    now = time.time()
    snapshot = json.dumps(
        {
            "sources": [
                {"source": "VIIRS_NOAA20_NRT", "status": "ok", "count": 515},
                {"source": "VIIRS_NOAA21_NRT", "status": "ok", "count": 491},
                {"source": "VIIRS_SNPP_NRT", "status": "empty", "count": 0},
            ]
        }
    )
    redis_client = AsyncMock()
    redis_client.get = AsyncMock(
        side_effect=lambda key: {
            "firms_pulse:last_fetch": str(now),
            "poller:firms:last_error": None,
            system_router.FIRMS_SOURCE_STATUS_KEY: snapshot,
            "space_weather:kp_current": None,
        }.get(key)
    )
    redis_client.lpush = AsyncMock()
    redis_client.ltrim = AsyncMock()
    redis_client.expire = AsyncMock()
    redis_client.lrange = AsyncMock(return_value=["1", "1", "1"])

    with patch.object(system_router.db, "redis_client", redis_client), patch.dict(
        os.environ,
        {"FIRMS_MAP_KEY": "test-key"},
        clear=False,
    ), patch.object(system_router.httpx, "AsyncClient", return_value=_MockAsyncClient()):
        result = await system_router.get_poller_health()

    firms = next(item for item in result if item["id"] == "firms")
    assert firms["status"] == "healthy"
    assert firms["detail"] == "NOAA20:515 | NOAA21:491 | SNPP:empty"
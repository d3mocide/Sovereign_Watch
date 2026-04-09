"""Regression tests for H3 risk outage scoping."""

from __future__ import annotations

import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

import h3  # noqa: E402
import routers.h3_risk as h3_risk  # noqa: E402


class _FakeRedis:
    def __init__(self, payloads: dict[str, str]):
        self.payloads = payloads

    async def get(self, key: str):
        return self.payloads.get(key)

    async def setex(self, key: str, ttl: int, value: str):
        self.payloads[key] = value


def _mock_pool():
    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(side_effect=[[], []])
    mock_conn.executemany = AsyncMock(return_value=None)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
    return mock_pool


@pytest.mark.asyncio
async def test_h3_risk_projects_outage_to_landing_cells():
    resolution = 6
    landing_lat = 0.0
    landing_lon = 0.0
    landing_cell = h3.latlng_to_cell(landing_lat, landing_lon, resolution)

    redis_payloads = {
        "infra:outages": json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [10.0, 10.0]},
                        "properties": {
                            "country": "Country A",
                            "country_code": "AA",
                            "severity": 80.0,
                            "nearby_cable_landings": ["Alpha Landing, Country A"],
                        },
                    }
                ],
            }
        ),
        "infra:cable_country_index": json.dumps(
            {
                "countries": {
                    "country a": {
                        "country": "Country A",
                        "landing_names": ["Alpha Landing, Country A"],
                        "station_points": [{"name": "Alpha Landing, Country A", "lat": landing_lat, "lon": landing_lon}],
                        "cable_ids": ["a-b-cable"],
                    }
                },
                "cables": {"a-b-cable": {"name": "A-B Cable", "countries": ["country a"]}},
            }
        ),
    }

    with (
        patch.object(h3_risk.db, "pool", _mock_pool()),
        patch.object(h3_risk.db, "redis_client", _FakeRedis(redis_payloads)),
    ):
        response = await h3_risk.get_h3_risk(resolution=resolution, hours=24)

    target_cell = next((cell for cell in response.cells if cell.cell == landing_cell), None)
    assert target_cell is not None
    assert target_cell.outage == 0.8
    assert target_cell.risk_score >= 0.16
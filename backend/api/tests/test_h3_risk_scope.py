"""Regression tests for H3 risk outage scoping."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

import h3  # noqa: E402
import routers.h3_risk as h3_risk  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from services.gdelt_linkage import GdeltLinkageResult  # noqa: E402


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


@pytest.mark.asyncio
async def test_h3_risk_mission_mode_uses_linked_gdelt_scope():
    resolution = 6
    mission_lat = 25.2
    mission_lon = 55.3
    mission_cell = h3.latlng_to_cell(mission_lat, mission_lon, resolution)

    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(
        return_value=[
            {
                "time": datetime.now(timezone.utc),
                "entity_id": "icao-mission-1",
                "lat": mission_lat,
                "lon": mission_lon,
            }
        ]
    )
    mock_conn.executemany = AsyncMock(return_value=None)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    linkage_result = GdeltLinkageResult(
        events=[
            {
                "event_id_cnty": "evt-1",
                "event_latitude": mission_lat,
                "event_longitude": mission_lon,
                "goldstein": -8.0,
                "quad_class": 4,
                "linkage_tier": "state_actor",
            }
        ],
        linkage_counts={
            "in_aot": 0,
            "state_actor": 1,
            "cable_infra": 0,
            "chokepoint": 0,
        },
        mission_country_codes={"ARE"},
        cable_country_codes=set(),
    )

    with (
        patch.object(h3_risk.db, "pool", mock_pool),
        patch.object(h3_risk.db, "redis_client", None),
        patch.object(h3_risk, "fetch_linked_gdelt_events", AsyncMock(return_value=linkage_result)) as mock_fetch_linked,
    ):
        response = await h3_risk.get_h3_risk(resolution=resolution, hours=24, h3_region="877b05c9cffffff")

    assert response.source_scope is not None
    assert response.source_scope["linkage_reason"] == "explicit_geopolitical_linkage"
    assert "state-actor/border" in response.source_scope["notes"]
    assert any(cell.cell == mission_cell for cell in response.cells)
    mock_fetch_linked.assert_awaited_once()


@pytest.mark.asyncio
async def test_h3_risk_rejects_partial_radius_parameters():
    with pytest.raises(HTTPException) as exc_info:
        await h3_risk.get_h3_risk(resolution=6, hours=24, lat=25.2, lon=55.3)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "lat, lon, and radius_nm are required together"


@pytest.mark.asyncio
async def test_h3_risk_weights_mission_gdelt_sentiment_by_linkage_score():
    resolution = 6
    mission_lat = 25.2
    mission_lon = 55.3

    def _build_response(score: float) -> GdeltLinkageResult:
        return GdeltLinkageResult(
            events=[
                {
                    "event_id_cnty": f"evt-{score}",
                    "event_latitude": mission_lat,
                    "event_longitude": mission_lon,
                    "goldstein": -8.0,
                    "quad_class": 4,
                    "linkage_tier": "state_actor",
                    "linkage_score": score,
                }
            ],
            linkage_counts={
                "in_aot": 0,
                "state_actor": 1,
                "cable_infra": 0,
                "chokepoint": 0,
            },
            mission_country_codes={"ARE"},
            cable_country_codes=set(),
        )

    def _mock_pool_with_track():
        mock_conn = MagicMock()
        mock_conn.fetch = AsyncMock(
            return_value=[
                {
                    "time": datetime.now(timezone.utc),
                    "entity_id": "icao-mission-1",
                    "lat": mission_lat,
                    "lon": mission_lon,
                }
            ]
        )
        mock_conn.executemany = AsyncMock(return_value=None)

        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
        return mock_pool

    with (
        patch.object(h3_risk.db, "pool", _mock_pool_with_track()),
        patch.object(h3_risk.db, "redis_client", None),
        patch.object(h3_risk, "fetch_linked_gdelt_events", AsyncMock(return_value=_build_response(1.0))),
    ):
        high_score_response = await h3_risk.get_h3_risk(
            resolution=resolution,
            hours=24,
            h3_region="877b05c9cffffff",
        )

    with (
        patch.object(h3_risk.db, "pool", _mock_pool_with_track()),
        patch.object(h3_risk.db, "redis_client", None),
        patch.object(h3_risk, "fetch_linked_gdelt_events", AsyncMock(return_value=_build_response(0.25))),
    ):
        low_score_response = await h3_risk.get_h3_risk(
            resolution=resolution,
            hours=24,
            h3_region="877b05c9cffffff",
        )

    assert len(high_score_response.cells) == 1
    assert len(low_score_response.cells) == 1
    assert high_score_response.cells[0].risk_score > low_score_response.cells[0].risk_score
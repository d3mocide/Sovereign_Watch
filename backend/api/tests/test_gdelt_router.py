"""Regression tests for mission-aware GDELT API routes."""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

import routers.gdelt as gdelt_router  # noqa: E402
from services.gdelt_linkage import GdeltLinkageResult  # noqa: E402


def _mock_pool(mock_conn):
    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
    return mock_pool


async def _unexpected_fetch(*args, **kwargs):
    raise AssertionError("raw gdelt query should not run for mission-aware route")


@patch.object(gdelt_router.db, "redis_client", None)
@patch.object(gdelt_router, "fetch_linked_gdelt_events", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_gdelt_events_mission_mode_returns_linkage_metadata(mock_fetch_linked):
    mock_fetch_linked.return_value = GdeltLinkageResult(
        events=[
            {
                "event_id_cnty": "evt-1",
                "event_date": "20260409",
                "event_latitude": 26.5,
                "event_longitude": 56.3,
                "event_text": "Hormuz tension",
                "actor1_country": "IRN",
                "actor2_country": "USA",
                "event_code": "190",
                "quad_class": 4,
                "goldstein": -7.0,
                "tone": -4.0,
                "linkage_tier": "chokepoint",
                "linkage_score": 0.65,
                "linkage_evidence": {"matched_chokepoint": "Strait of Hormuz"},
                "linkage_chokepoint": "Strait of Hormuz",
            }
        ],
        linkage_counts={
            "in_aot": 0,
            "state_actor": 0,
            "cable_infra": 0,
            "chokepoint": 1, "alliance_support": 0, "basing_support": 0, "second_order_neighbor": 0, 
        },
        mission_country_codes={"OMN"},
        cable_country_codes={"ARE"},
    )

    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(side_effect=_unexpected_fetch)

    with patch.object(gdelt_router.db, "pool", _mock_pool(mock_conn)):
        result = await gdelt_router.get_gdelt_events(limit=10, hours=24, h3_region="8728f2ba8ffffff", refresh=True)

    assert result["source_scope"]["linkage_reason"] == "explicit_geopolitical_linkage"
    assert result["source_scope"]["scope"] == "impact_linked_external"
    assert result["features"][0]["properties"]["linkage_tier"] == "chokepoint"
    assert result["features"][0]["properties"]["linkage_score"] == 0.65
    assert result["features"][0]["properties"]["linkage_evidence"] == {"matched_chokepoint": "Strait of Hormuz"}
    assert result["features"][0]["properties"]["linkage_chokepoint"] == "Strait of Hormuz"


@patch.object(gdelt_router.db, "redis_client", None)
@patch.object(gdelt_router, "fetch_linked_gdelt_events", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_gdelt_actors_mission_mode_aggregates_linked_events(mock_fetch_linked):
    mock_fetch_linked.return_value = GdeltLinkageResult(
        events=[
            {
                "event_id_cnty": "evt-1",
                "event_latitude": 50.45,
                "event_longitude": 30.52,
                "actor1_country": "UKR",
                "quad_class": 4,
                "goldstein": -8.0,
            },
            {
                "event_id_cnty": "evt-2",
                "event_latitude": 49.84,
                "event_longitude": 24.03,
                "actor1_country": "UKR",
                "quad_class": 3,
                "goldstein": -5.0,
            },
        ],
        linkage_counts={
            "in_aot": 1,
            "state_actor": 1,
            "cable_infra": 0,
            "chokepoint": 0, "alliance_support": 0, "basing_support": 0, "second_order_neighbor": 0, 
        },
        mission_country_codes={"UKR", "RUS", "BLR"},
        cable_country_codes=set(),
    )

    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(side_effect=_unexpected_fetch)

    with patch.object(gdelt_router.db, "pool", _mock_pool(mock_conn)):
        result = await gdelt_router.get_gdelt_actors(limit=10, hours=24, h3_region="8728f2ba8ffffff", refresh=True)

    assert len(result) == 1
    assert result[0]["actor"] == "UKR"
    assert result[0]["event_count"] == 2
    assert result[0]["material_conflict"] == 1
    assert result[0]["verbal_conflict"] == 1
    assert result[0]["threat_level"] == "CRITICAL"


@patch.object(gdelt_router.db, "redis_client", None)
@patch.object(gdelt_router, "fetch_linked_gdelt_events", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_gdelt_events_radius_mode_uses_shared_linkage_fetch(mock_fetch_linked):
    mock_fetch_linked.return_value = GdeltLinkageResult(
        events=[],
        linkage_counts={
            "in_aot": 0,
            "state_actor": 0,
            "cable_infra": 0,
            "chokepoint": 0, "alliance_support": 0, "basing_support": 0, "second_order_neighbor": 0, 
        },
        mission_country_codes=set(),
        cable_country_codes=set(),
    )

    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(side_effect=_unexpected_fetch)

    with patch.object(gdelt_router.db, "pool", _mock_pool(mock_conn)):
        await gdelt_router.get_gdelt_events(
            limit=10,
            hours=24,
            lat=25.2,
            lon=55.3,
            radius_nm=180.0,
            refresh=True,
        )

    mock_fetch_linked.assert_awaited_once()
    _, kwargs = mock_fetch_linked.await_args
    assert kwargs["lat"] == 25.2
    assert kwargs["lon"] == 55.3
    assert kwargs["radius_nm"] == 180.0


def test_gdelt_events_reject_partial_radius_parameters():
    with pytest.raises(gdelt_router.HTTPException) as exc_info:
        gdelt_router._resolve_mission_mode(h3_region=None, lat=25.2, lon=55.3, radius_nm=None)

    assert exc_info.value.status_code == 400
    assert "required together" in str(exc_info.value.detail)


@patch.object(gdelt_router.db, "redis_client", None)
@patch.object(gdelt_router, "fetch_linkage_audit", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_gdelt_linkage_audit_returns_side_by_side_payload(mock_review):
    mock_review.return_value = {
        "reference_version": "2026-04-11-v1",
        "mission_country_code": "UKR",
        "live": {
            "counts": {"in_aot": 1, "state_actor": 1, "cable_infra": 0, "chokepoint": 0, "alliance_support": 0, "basing_support": 0, "second_order_neighbor": 0},
            "sample": [{"event_id_cnty": "live-1", "linkage_tier": "state_actor", "linkage_score": 0.8}],
        },
        "experimental": {
            "counts": {"second_order_only": 1, "alliance_support": 0, "basing_support": 0},
            "sample": [{"event_id_cnty": "exp-1", "experimental_reasons": ["second_order_neighbor"], "live_admitted": False}],
            "country_sets": {"second_order_only": ["DEU"], "alliance_support": [], "basing_support": []},
        },
        "comparison": {"overlap_count": 0, "live_only_count": 2, "experimental_only_count": 1},
    }

    mock_conn = MagicMock()

    with patch.object(gdelt_router.db, "pool", _mock_pool(mock_conn)):
        result = await gdelt_router.get_gdelt_linkage_audit(limit=10, hours=24, h3_region="8728f2ba8ffffff")

    assert result["mission_country_code"] == "UKR"
    assert result["live"]["counts"]["state_actor"] == 1
    assert result["experimental"]["counts"]["second_order_only"] == 1
    assert result["comparison"]["experimental_only_count"] == 1
    mock_review.assert_awaited_once()
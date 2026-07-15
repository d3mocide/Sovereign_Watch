"""Regression tests for AI Router sea-domain analysis."""

from __future__ import annotations

import json
import os
import sys
import types
from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

mock_hmm = types.ModuleType("services.hmm_trajectory")


@dataclass
class _StubHMMResult:
    uid: str
    state_sequence: list[str] | None = None
    dominant_state: str = "TRANSITING"
    confidence: float = 1.0
    anomaly_score: float = 0.0


def _stub_classify_trajectory(uid: str, track_points: list[dict]):
    return _StubHMMResult(uid=uid, state_sequence=["TRANSITING"])


mock_hmm.HMMResult = _StubHMMResult
mock_hmm.classify_trajectory = _stub_classify_trajectory
sys.modules["services.hmm_trajectory"] = mock_hmm

import routers.ai_router as ai_router  # noqa: E402
del sys.modules["services.hmm_trajectory"]


class _FakeRedis:
    def __init__(self, payloads: dict[str, str]):
        self.payloads = payloads

    async def get(self, key: str):
        return self.payloads.get(key)


def _mock_pool_with_rows(rows):
    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=rows)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
    return mock_pool


@pytest.mark.asyncio
async def test_analyze_sea_domain_scopes_wave_height_to_mission_area():
    region = ai_router.h3.latlng_to_cell(0.0, 0.0, 7)
    redis_payloads = {
        "ndbc:latest_obs": json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [0.2, 0.1]},
                        "properties": {"buoy_id": "nearby", "wvht_m": 2.5, "time": "2026-04-09T00:00:00Z"},
                    },
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [20.0, 0.0]},
                        "properties": {"buoy_id": "far", "wvht_m": 8.0, "time": "2026-04-09T00:00:00Z"},
                    },
                ],
            }
        ),
        "infra:outages": json.dumps({"type": "FeatureCollection", "features": []}),
        "infra:stations": json.dumps({"type": "FeatureCollection", "features": []}),
        "infra:cables": json.dumps({"type": "FeatureCollection", "features": []}),
    }

    with (
        patch.object(ai_router.db, "pool", _mock_pool_with_rows([])),
        patch.object(ai_router.db, "redis_client", _FakeRedis(redis_payloads)),
        patch.object(
            ai_router.ai_service,
            "generate_static",
            AsyncMock(return_value="### CLASSIFICATION\nNominal."),
        ) as mock_generate,
    ):
        response = await ai_router.analyze_sea_domain(
            ai_router.DomainAnalysisRequest(h3_region=region, lookback_hours=24)
        )

    assert response.context_snapshot["max_wave_height_m"] == 2.5
    assert response.context_snapshot["wave_buoy_count"] == 1

    prompt = mock_generate.await_args.kwargs["user_prompt"]
    assert "- Max wave height: 2.5m" in prompt
    assert "8.0m" not in prompt


@pytest.mark.asyncio
async def test_analyze_sea_domain_scopes_outages_to_cable_connected_countries():
    region = ai_router.h3.latlng_to_cell(0.0, 0.0, 7)
    redis_payloads = {
        "ndbc:latest_obs": json.dumps({"type": "FeatureCollection", "features": []}),
        "infra:stations": json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [-0.4, 0.0]},
                        "properties": {"name": "Alpha Landing, Country A"},
                    },
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [0.4, 0.0]},
                        "properties": {"name": "Beta Landing, Country B"},
                    },
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [8.0, 8.0]},
                        "properties": {"name": "Gamma Landing, Country C"},
                    },
                ],
            }
        ),
        "infra:cables": json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [[-0.4, 0.0], [0.0, 0.0], [0.4, 0.0]],
                        },
                        "properties": {"name": "A-B Cable"},
                    }
                ],
            }
        ),
        "infra:outages": json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [-0.4, 0.0]},
                        "properties": {
                            "country": "Country A",
                            "country_code": "AA",
                            "severity": 82.0,
                            "nearby_cable_landings": ["Alpha Landing, Country A"],
                        },
                    },
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [8.0, 8.0]},
                        "properties": {
                            "country": "Country C",
                            "country_code": "CC",
                            "severity": 91.0,
                            "nearby_cable_landings": ["Gamma Landing, Country C"],
                        },
                    },
                ],
            }
        ),
    }

    with (
        patch.object(ai_router.db, "pool", _mock_pool_with_rows([])),
        patch.object(ai_router.db, "redis_client", _FakeRedis(redis_payloads)),
        patch.object(
            ai_router.ai_service,
            "generate_static",
            AsyncMock(return_value="### CLASSIFICATION\nNominal."),
        ) as mock_generate,
    ):
        response = await ai_router.analyze_sea_domain(
            ai_router.DomainAnalysisRequest(h3_region=region, lookback_hours=24)
        )

    assert response.context_snapshot["cable_correlated_outages"] == 1
    assert response.context_snapshot["cable_correlated_outage_countries"] == ["Country A"]
    assert "Country C" not in response.context_snapshot["cable_relevant_countries"]

    prompt = mock_generate.await_args.kwargs["user_prompt"]
    assert "- Cable-correlated outages: 1" in prompt

@pytest.mark.asyncio
async def test_analyze_sea_domain_uses_firms_dark_vessel_candidates():
    region = ai_router.h3.latlng_to_cell(0.0, 0.0, 7)
    redis_payloads = {
        "ndbc:latest_obs": json.dumps({"type": "FeatureCollection", "features": []}),
        "infra:outages": json.dumps({"type": "FeatureCollection", "features": []}),
        "infra:stations": json.dumps({"type": "FeatureCollection", "features": []}),
        "infra:cables": json.dumps({"type": "FeatureCollection", "features": []}),
    }

    dark_features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [0.5, 0.5]},
            "properties": {
                "frp": 12.0,
                "risk_score": 0.72,
                "risk_severity": "HIGH",
                "nearest_ais_dist_nm": None,
            },
        }
    ]

    with (
        patch.object(ai_router.db, "pool", _mock_pool_with_rows([])),
        patch.object(ai_router.db, "redis_client", _FakeRedis(redis_payloads)),
        patch.object(
            ai_router,
            "query_dark_vessel_features",
            AsyncMock(return_value=dark_features),
        ) as mock_query,
        patch.object(
            ai_router.ai_service,
            "generate_static",
            AsyncMock(return_value="### CLASSIFICATION\nNominal."),
        ) as mock_generate,
    ):
        response = await ai_router.analyze_sea_domain(
            ai_router.DomainAnalysisRequest(h3_region=region, lookback_hours=24)
        )

    assert response.context_snapshot["dark_vessel_candidates"] == 1
    assert response.context_snapshot["dark_vessel_samples"][0]["risk_severity"] == "HIGH"
    assert any("Dark-vessel candidates" in i for i in response.indicators)
    assert response.risk_score >= 0.2

    kwargs = mock_query.await_args.kwargs
    assert kwargs["min_risk_score"] == 0.4

    prompt = mock_generate.await_args.kwargs["user_prompt"]
    assert "Dark-vessel candidates (FIRMS x AIS): 1" in prompt


@pytest.mark.asyncio
async def test_analyze_sea_domain_sparse_ais_rows_not_flagged_as_dark():
    """Single-row AIS entities must NOT be labelled dark vessels — clausal
    chains are sparse by design for steady traffic."""
    region = ai_router.h3.latlng_to_cell(0.0, 0.0, 7)
    redis_payloads = {
        "ndbc:latest_obs": json.dumps({"type": "FeatureCollection", "features": []}),
        "infra:outages": json.dumps({"type": "FeatureCollection", "features": []}),
        "infra:stations": json.dumps({"type": "FeatureCollection", "features": []}),
        "infra:cables": json.dumps({"type": "FeatureCollection", "features": []}),
    }

    ais_rows = [
        {
            "uid": f"vessel-{i}",
            "predicate_type": "a-f-S",
            "locative_lat": 0.0,
            "locative_lon": 0.0,
            "adverbial_context": {},
            "time": None,
        }
        for i in range(6)
    ]

    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
        if "FROM clausal_chains" in sql:
            return ais_rows
        return []

    mock_conn.fetch = AsyncMock(side_effect=_fetch)
    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    with (
        patch.object(ai_router.db, "pool", mock_pool),
        patch.object(ai_router.db, "redis_client", _FakeRedis(redis_payloads)),
        patch.object(
            ai_router,
            "query_dark_vessel_features",
            AsyncMock(return_value=[]),
        ),
        patch.object(
            ai_router.ai_service,
            "generate_static",
            AsyncMock(return_value="### CLASSIFICATION\nNominal."),
        ),
    ):
        response = await ai_router.analyze_sea_domain(
            ai_router.DomainAnalysisRequest(h3_region=region, lookback_hours=24)
        )

    assert not any("dark" in i.lower() for i in response.indicators)
    assert response.context_snapshot.get("dark_vessel_candidates") is None

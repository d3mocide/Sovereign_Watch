"""Regression tests for AI Router air-domain analysis."""

from __future__ import annotations

import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

import routers.ai_router as ai_router  # noqa: E402
from services.ai_service import AIModelOverloadedError  # noqa: E402


class _FakeRedis:
    def __init__(self, payloads: dict[str, str]):
        self.payloads = payloads

    async def get(self, key: str):
        return self.payloads.get(key)


@pytest.mark.asyncio
async def test_analyze_air_domain_uses_region_scoped_nws_alerts():
    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=[])
    mock_conn.fetchrow = AsyncMock(
        return_value={"count": 0, "severe_count": 0, "extreme_count": 0}
    )

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    redis_payloads = {
        "nws:alerts:summary": json.dumps(
            {
                "count": 372,
                "severe_count": 66,
                "extreme_count": 0,
                "fetched_at": "2026-04-08T22:52:38.813525+00:00",
            }
        ),
        "nws:alerts:active": json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [-97.0, 35.0],
                                    [-96.0, 35.0],
                                    [-96.0, 36.0],
                                    [-97.0, 36.0],
                                    [-97.0, 35.0],
                                ]
                            ],
                        },
                        "properties": {
                            "event": "Tornado Warning",
                            "severity": "Severe",
                        },
                    }
                ],
            }
        ),
        "space_weather:kp_current": json.dumps({"kp": 1.0, "storm_level": "Quiet"}),
    }

    with (
        patch.object(ai_router.db, "pool", mock_pool),
        patch.object(ai_router.db, "redis_client", _FakeRedis(redis_payloads)),
        patch.object(
            ai_router.ai_service,
            "generate_static",
            AsyncMock(return_value="### CLASSIFICATION\nNominal."),
        ) as mock_generate,
    ):
        response = await ai_router.analyze_air_domain(
            ai_router.DomainAnalysisRequest(
                h3_region="8728f2ba8ffffff",
                lookback_hours=24,
            )
        )

    assert response.context_snapshot["nws_alerts"]["count"] == 0
    assert response.context_snapshot["nws_alerts"]["severe_count"] == 0
    assert response.context_snapshot["nws_alerts"]["scope"] == "mission_area"
    assert response.context_snapshot["context_scope"]["space_weather"]["scope"] == "impact_linked_external"
    assert response.context_snapshot["space_weather_driver_summary"] == "below mission threshold"
    assert all("nationally" not in indicator for indicator in response.indicators)

    prompt = mock_generate.await_args.kwargs["user_prompt"]
    assert "NWS alerts in target region" in prompt
    assert "372" not in prompt
    assert "66" not in prompt
    assert "1.0" not in prompt
    assert "below mission threshold" in prompt


@pytest.mark.asyncio
async def test_analyze_air_domain_flags_model_overload_notice():
    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=[])
    mock_conn.fetchrow = AsyncMock(
        return_value={"count": 0, "severe_count": 0, "extreme_count": 0}
    )

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    redis_payloads = {
        "nws:alerts:summary": json.dumps({"count": 0, "severe_count": 0, "extreme_count": 0}),
        "nws:alerts:active": json.dumps({"type": "FeatureCollection", "features": []}),
        "space_weather:kp_current": json.dumps({"kp": 1.0, "storm_level": "Quiet"}),
    }

    with (
        patch.object(ai_router.db, "pool", mock_pool),
        patch.object(ai_router.db, "redis_client", _FakeRedis(redis_payloads)),
        patch.object(
            ai_router.ai_service,
            "generate_static",
            AsyncMock(
                side_effect=AIModelOverloadedError(
                    "AI model temporarily overloaded. Please try again shortly."
                )
            ),
        ),
    ):
        response = await ai_router.analyze_air_domain(
            ai_router.DomainAnalysisRequest(
                h3_region="8728f2ba8ffffff",
                lookback_hours=24,
            )
        )

    assert response.ai_status == "overloaded"
    assert response.ai_notice == "AI model temporarily overloaded. Please try again shortly."
    assert "Air domain:" in response.narrative


@pytest.mark.asyncio
async def test_analyze_air_domain_uses_real_holding_pattern_pipeline():
    """Active holding zones near the region must surface as an indicator;
    zones far outside the air-context radius must not."""
    region = ai_router.h3.latlng_to_cell(0.0, 0.0, 7)

    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=[])
    mock_conn.fetchrow = AsyncMock(
        return_value={"count": 0, "severe_count": 0, "extreme_count": 0}
    )
    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    redis_payloads = {
        "nws:alerts:summary": json.dumps({"count": 0, "severe_count": 0, "extreme_count": 0}),
        "nws:alerts:active": json.dumps({"type": "FeatureCollection", "features": []}),
        "space_weather:kp_current": json.dumps({"kp": 1.0, "storm_level": "Quiet"}),
        "holding_pattern:active_zones": json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [0.1, 0.1]},
                        "properties": {
                            "hex_id": "abc123",
                            "callsign": "TEST1",
                            "confidence": 0.85,
                            "turns_completed": 3,
                        },
                    },
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [20.0, 20.0]},
                        "properties": {
                            "hex_id": "far999",
                            "callsign": "FAR1",
                            "confidence": 0.9,
                            "turns_completed": 4,
                        },
                    },
                ],
            }
        ),
    }

    with (
        patch.object(ai_router.db, "pool", mock_pool),
        patch.object(ai_router.db, "redis_client", _FakeRedis(redis_payloads)),
        patch.object(
            ai_router.ai_service,
            "generate_static",
            AsyncMock(return_value="### CLASSIFICATION\nNominal."),
        ) as mock_generate,
    ):
        response = await ai_router.analyze_air_domain(
            ai_router.DomainAnalysisRequest(h3_region=region, lookback_hours=24)
        )

    assert response.context_snapshot["holding_pattern_active_count"] == 1
    samples = response.context_snapshot["holding_pattern_active_samples"]
    assert samples[0]["hex_id"] == "abc123"
    assert any("Active holding patterns" in i for i in response.indicators)
    assert response.risk_score >= 0.1

    prompt = mock_generate.await_args.kwargs["user_prompt"]
    assert "Active holding patterns (poller-detected): 1" in prompt


@pytest.mark.asyncio
async def test_analyze_air_domain_no_holding_indicator_without_signals():
    """Many clausal rows for one aircraft must NOT be reported as holding."""
    region = ai_router.h3.latlng_to_cell(0.0, 0.0, 7)

    adsb_rows = [
        {
            "uid": "same-aircraft",
            "predicate_type": "a-f-A",
            "locative_lat": 0.0,
            "locative_lon": 0.0,
            "locative_hae": 1000.0,
            "adverbial_context": {},
            "time": None,
        }
        for _ in range(8)
    ]

    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
        if "FROM clausal_chains" in sql:
            return adsb_rows
        return []

    mock_conn.fetch = AsyncMock(side_effect=_fetch)
    mock_conn.fetchrow = AsyncMock(
        return_value={"count": 0, "severe_count": 0, "extreme_count": 0}
    )
    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    redis_payloads = {
        "nws:alerts:summary": json.dumps({"count": 0, "severe_count": 0, "extreme_count": 0}),
        "nws:alerts:active": json.dumps({"type": "FeatureCollection", "features": []}),
        "space_weather:kp_current": json.dumps({"kp": 1.0, "storm_level": "Quiet"}),
    }

    with (
        patch.object(ai_router.db, "pool", mock_pool),
        patch.object(ai_router.db, "redis_client", _FakeRedis(redis_payloads)),
        patch.object(
            ai_router.ai_service,
            "generate_static",
            AsyncMock(return_value="### CLASSIFICATION\nNominal."),
        ),
    ):
        response = await ai_router.analyze_air_domain(
            ai_router.DomainAnalysisRequest(h3_region=region, lookback_hours=24)
        )

    assert response.context_snapshot["holding_pattern_active_count"] == 0
    assert not any("holding" in i.lower() for i in response.indicators)

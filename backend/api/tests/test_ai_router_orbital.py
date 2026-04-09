"""Regression tests for mission-area orbital analysis."""

from __future__ import annotations

import json
import os
import sys
import types
from dataclasses import dataclass
from datetime import datetime, timezone
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


@pytest.mark.asyncio
async def test_analyze_orbital_domain_keeps_only_mission_area_satnogs_events():
    region = ai_router.h3.latlng_to_cell(0.0, 0.0, 7)
    redis_payloads = {
        "space_weather:kp_current": json.dumps({"kp": 5.0, "storm_level": "G1"}),
        "space_weather:noaa_scales": json.dumps({"0": {"R": {"Scale": "R2"}, "G": {"Scale": "G1"}, "S": {"Scale": "S1"}}}),
    }

    event_time = datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc)

    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
        if "FROM satnogs_signal_events" in sql:
            return [
                {
                    "norad_id": 11111,
                    "ground_station_name": "GS-LOCAL",
                    "signal_strength": -16.0,
                    "time": event_time,
                    "modulation": "FM",
                    "frequency": 145800000,
                },
                {
                    "norad_id": 22222,
                    "ground_station_name": "GS-FAR",
                    "signal_strength": -18.0,
                    "time": event_time,
                    "modulation": "FM",
                    "frequency": 145900000,
                },
            ]
        if "FROM satellites" in sql:
            return [
                {"norad_id": 11111, "tle_line1": "L1-A", "tle_line2": "L2-A"},
                {"norad_id": 22222, "tle_line1": "L1-B", "tle_line2": "L2-B"},
            ]
        return []

    mock_conn.fetch = AsyncMock(side_effect=_fetch)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    subpoints = {
        ("L1-A", "L2-A"): (0.0, 0.0),
        ("L1-B", "L2-B"): (25.0, 25.0),
    }

    def _fake_subpoint(tle_line1: str, tle_line2: str, event_time: datetime):
        return subpoints[(tle_line1, tle_line2)]

    with (
        patch.object(ai_router.db, "pool", mock_pool),
        patch.object(ai_router.db, "redis_client", _FakeRedis(redis_payloads)),
        patch.object(ai_router, "_satellite_subpoint_for_time", side_effect=_fake_subpoint),
        patch.object(
            ai_router.ai_service,
            "generate_static",
            AsyncMock(return_value="### CLASSIFICATION\nNominal."),
        ) as mock_generate,
    ):
        response = await ai_router.analyze_orbital_domain(
            ai_router.DomainAnalysisRequest(h3_region=region, lookback_hours=24)
        )

    assert response.context_snapshot["signal_loss_count"] == 1
    assert response.context_snapshot["signal_loss_events"][0]["norad_id"] == 11111
    assert response.context_snapshot["context_scope"]["space_weather"]["scope"] == "impact_linked_external"
    assert response.context_snapshot["context_scope"]["satnogs"]["scope"] == "mission_area"

    prompt = mock_generate.await_args.kwargs["user_prompt"]
    assert "Mission-area SatNOGS signal-loss events: 1" in prompt
    assert "Scope contract: mission-area signals plus impact-linked external drivers only" in prompt
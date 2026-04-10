"""Regression tests for AI Router regional risk scope metadata."""

from __future__ import annotations

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


class _FakeAlignment:
    async def align_clauses(self, *, h3_region, clausal_chains, gdelt_events, lookback_window):
        return types.SimpleNamespace(tak_clauses=[], gdelt_clauses=[], alignment_score=0.0)


class _FakeEscalationDetector:
    @staticmethod
    def should_suppress_signal_loss(payload):
        return False

    def detect_pattern(self, items):
        return None, 0.0

    def detect_anomaly_concentration(self, tak_dicts, h3_region):
        return types.SimpleNamespace(score=0.0, affected_uids=[])

    def detect_directional_anomalies(self, tak_dicts):
        return []

    def detect_emergency_transponders(self, tak_dicts):
        return []

    def detect_rendezvous(self, tak_dicts):
        return []

    def detect_stdbscan_clusters(self, clauses):
        return []

    def detect_hmm_anomalies(self, uid_tracks):
        return []

    def detect_internet_outage(self, outage_data):
        return types.SimpleNamespace(score=0.0, affected_uids=[], metric_type="internet_outage", description="")

    def detect_space_weather(self, kp_index):
        return types.SimpleNamespace(score=0.0, affected_uids=[], metric_type="space_weather", description=str(kp_index))

    def detect_satnogs_signal_loss(self, signal_events):
        return []

    def detect_internet_outage_correlation(self, outage_data):
        return types.SimpleNamespace(score=0.0, affected_uids=[], metric_type="internet_outage", description="")

    def detect_space_weather_anomaly(self, kp_index):
        return types.SimpleNamespace(score=0.0, affected_uids=[], metric_type="space_weather", description=str(kp_index))

    def compute_risk_score(self, **kwargs):
        return 0.0


@pytest.mark.asyncio
async def test_evaluate_regional_escalation_returns_scope_metadata():
    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
        if "FROM gdelt_events" in sql or "FROM clausal_chains" in sql or "FROM satnogs_signal_events" in sql:
            return []
        return []

    async def _fetchrow(sql: str, *params):
        return None

    mock_conn.fetch = AsyncMock(side_effect=_fetch)
    mock_conn.fetchrow = AsyncMock(side_effect=_fetchrow)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    with (
        patch.object(ai_router.db, "pool", mock_pool),
        patch.object(ai_router.db, "redis_client", None),
        patch.object(ai_router, "SpatialTemporalAlignment", return_value=_FakeAlignment()),
        patch.object(ai_router, "EscalationDetector", _FakeEscalationDetector),
    ):
        response = await ai_router.evaluate_regional_escalation(
            ai_router.EvaluationRequest(
                h3_region="8728f2ba8ffffff",
                lookback_hours=24,
                include_gdelt=True,
                include_tak=True,
                lightweight=True,
            )
        )

    assert response.source_scope is not None
    assert response.source_scope["tak"]["scope"] == "mission_area"
    assert response.source_scope["gdelt"]["linkage_reason"] == "explicit_geopolitical_linkage"
    assert response.source_scope["gdelt"]["notes"] == "0 in-AOT, 0 state-actor/border, 0 cable-infra, 0 maritime-chokepoint"
    assert response.source_scope["space_weather"]["scope"] == "impact_linked_external"
    assert response.source_scope["satnogs"]["scope"] == "global"
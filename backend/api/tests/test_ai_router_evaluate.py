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


class _ElevatedRiskEscalationDetector(_FakeEscalationDetector):
    def compute_risk_score(self, **kwargs):
        return 0.4


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
    # Valid H3 cell → wkt_polygon is set → mission-area SatNOGS path used
    assert response.source_scope["satnogs"]["scope"] == "mission_area"
    assert response.source_scope["satnogs"]["linkage_reason"] == "satellite_subpoint_intersection"


@pytest.mark.asyncio
async def test_evaluate_regional_escalation_preserves_heuristic_narrative_when_llm_fails():
    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
        return []

    async def _fetchrow(sql: str, *params):
        return None

    mock_conn.fetch = AsyncMock(side_effect=_fetch)
    mock_conn.fetchrow = AsyncMock(side_effect=_fetchrow)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    failed_assessment = ai_router.RiskAssessment(
        h3_region_id="8728f2ba8ffffff",
        risk_score=0.0,
        narrative_summary="",
        anomalous_uids=[],
        escalation_indicators=[],
        confidence=0.0,
    )
    mock_sequence_engine = MagicMock()
    mock_sequence_engine.evaluate_escalation = AsyncMock(return_value=failed_assessment)

    with (
        patch.object(ai_router.db, "pool", mock_pool),
        patch.object(ai_router.db, "redis_client", None),
        patch.object(ai_router, "SpatialTemporalAlignment", return_value=_FakeAlignment()),
        patch.object(ai_router, "EscalationDetector", _ElevatedRiskEscalationDetector),
        patch.object(ai_router, "SequenceEvaluationEngine", return_value=mock_sequence_engine),
    ):
        response = await ai_router.evaluate_regional_escalation(
            ai_router.EvaluationRequest(
                h3_region="8728f2ba8ffffff",
                lookback_hours=24,
                include_gdelt=True,
                include_tak=True,
                lightweight=False,
            )
        )

    assert "### CLASSIFICATION" in response.narrative_summary
    assert "Elevated regional pressure is active" in response.narrative_summary
    assert response.confidence == 0.0


@pytest.mark.asyncio
async def test_evaluate_regional_escalation_passes_mode_to_sequence_engine():
    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
        return []

    async def _fetchrow(sql: str, *params):
        return None

    mock_conn.fetch = AsyncMock(side_effect=_fetch)
    mock_conn.fetchrow = AsyncMock(side_effect=_fetchrow)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    successful_assessment = ai_router.RiskAssessment(
        h3_region_id="8728f2ba8ffffff",
        risk_score=0.4,
        narrative_summary="### CLASSIFICATION\n- Stable local picture.",
        anomalous_uids=[],
        escalation_indicators=[],
        confidence=0.8,
    )
    mock_sequence_engine = MagicMock()
    mock_sequence_engine.evaluate_escalation = AsyncMock(return_value=successful_assessment)

    with (
        patch.object(ai_router.db, "pool", mock_pool),
        patch.object(ai_router.db, "redis_client", None),
        patch.object(ai_router, "SpatialTemporalAlignment", return_value=_FakeAlignment()),
        patch.object(ai_router, "EscalationDetector", _ElevatedRiskEscalationDetector),
        patch.object(ai_router, "SequenceEvaluationEngine", return_value=mock_sequence_engine),
    ):
        await ai_router.evaluate_regional_escalation(
            ai_router.EvaluationRequest(
                h3_region="8728f2ba8ffffff",
                lookback_hours=24,
                mode="tactical",
                include_gdelt=True,
                include_tak=True,
                lightweight=False,
            )
        )

    _, kwargs = mock_sequence_engine.evaluate_escalation.await_args
    assert kwargs["mode"] == "tactical"


@pytest.mark.asyncio
async def test_evaluate_satnogs_mission_area_scope_when_polygon_set():
    """When a valid H3 cell produces a WKT polygon, only subpoint-intersecting
    SatNOGS events should be used and source_scope.satnogs should reflect
    mission_area scoping."""
    from datetime import datetime, timezone

    region = ai_router.h3.latlng_to_cell(0.0, 0.0, 7)
    event_time = datetime(2026, 4, 11, 12, 0, tzinfo=timezone.utc)

    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
        if "FROM satnogs_signal_events" in sql:
            # Two events: one whose satellite will be over the AOT, one far away
            return [
                {"norad_id": 11111, "ground_station_name": "GS-LOCAL",
                 "signal_strength": -16.0, "time": event_time,
                 "modulation": "FM", "frequency": 145800000},
                {"norad_id": 22222, "ground_station_name": "GS-FAR",
                 "signal_strength": -18.0, "time": event_time,
                 "modulation": "FM", "frequency": 145900000},
            ]
        if "FROM satellites" in sql:
            return [
                {"norad_id": 11111, "tle_line1": "L1-A", "tle_line2": "L2-A"},
                {"norad_id": 22222, "tle_line1": "L1-B", "tle_line2": "L2-B"},
            ]
        return []

    async def _fetchrow(sql: str, *params):
        return None

    mock_conn.fetch = AsyncMock(side_effect=_fetch)
    mock_conn.fetchrow = AsyncMock(side_effect=_fetchrow)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    # Subpoint map: NORAD 11111 is over (0,0) = inside AOT; 22222 is at (25,25) = outside
    subpoints = {("L1-A", "L2-A"): (0.0, 0.0), ("L1-B", "L2-B"): (25.0, 25.0)}

    def _fake_subpoint(tle_line1: str, tle_line2: str, event_time_arg):
        return subpoints.get((tle_line1, tle_line2))

    with (
        patch.object(ai_router.db, "pool", mock_pool),
        patch.object(ai_router.db, "redis_client", None),
        patch.object(ai_router, "SpatialTemporalAlignment", return_value=_FakeAlignment()),
        patch.object(ai_router, "EscalationDetector", _FakeEscalationDetector),
        patch.object(ai_router, "_satellite_subpoint_for_time", side_effect=_fake_subpoint),
    ):
        response = await ai_router.evaluate_regional_escalation(
            ai_router.EvaluationRequest(
                h3_region=region,
                lookback_hours=24,
                include_gdelt=False,
                include_tak=True,
                lightweight=True,
            )
        )

    assert response.source_scope["satnogs"]["scope"] == "mission_area"
    assert response.source_scope["satnogs"]["linkage_reason"] == "satellite_subpoint_intersection"


@pytest.mark.asyncio
async def test_evaluate_satnogs_global_scope_when_no_polygon():
    """When the H3 cell is invalid (wkt_polygon=None), the global fallback query
    should be used and source_scope.satnogs should reflect global scoping."""
    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
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
        # Force _h3_cell_to_wkt to return None (simulates an invalid H3 cell)
        patch.object(ai_router, "_h3_cell_to_wkt", return_value=None),
    ):
        response = await ai_router.evaluate_regional_escalation(
            ai_router.EvaluationRequest(
                h3_region="invalid-cell",
                lookback_hours=24,
                include_gdelt=False,
                include_tak=True,
                lightweight=True,
            )
        )

    assert response.source_scope["satnogs"]["scope"] == "global"
    assert response.source_scope["satnogs"]["linkage_reason"] == "ungated_signal_loss_feed"
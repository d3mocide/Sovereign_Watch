"""Regression tests for AOT-aware clausal-chain enrichment."""

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


@pytest.mark.asyncio
async def test_clausal_chains_enrichment_uses_h3_and_time_scope():
    captured_queries: list[str] = []

    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
        captured_queries.append(sql)
        if "FROM clausal_chains" in sql:
            return [
                {
                    "time": "2026-04-08T12:00:00+00:00",
                    "uid": "track-1",
                    "source": "TAK_AIS",
                    "predicate_type": "a-f-s-m",
                    "locative_lat": 0.0,
                    "locative_lon": 0.0,
                    "locative_hae": 0.0,
                    "state_change_reason": "ZONE_ENTRY",
                    "adverbial_context": {"speed": 12},
                    "narrative_summary": "Test chain",
                }
            ]
        if "FROM internet_outages" in sql:
            return [
                {
                    "time": "2026-04-08T11:30:00+00:00",
                    "country_code": "AA",
                    "severity": 82.0,
                    "asn_name": "Example ASN",
                    "affected_nets": 10,
                }
            ]
        if "FROM satnogs_signal_events" in sql:
            return [
                {
                    "time": "2026-04-08T11:45:00+00:00",
                    "norad_id": 12345,
                    "ground_station_name": "GS-1",
                    "signal_strength": -15.0,
                    "modulation": "FM",
                    "frequency": 145800000,
                }
            ]
        return []

    async def _fetchrow(sql: str, *params):
        captured_queries.append(sql)
        if "FROM space_weather_context" in sql:
            return {
                "time": "2026-04-08T11:50:00+00:00",
                "kp_index": 5.0,
                "kp_category": "G1",
                "dst_index": -40.0,
                "explanation": "Minor storm",
            }
        return None

    mock_conn.fetch = AsyncMock(side_effect=_fetch)
    mock_conn.fetchrow = AsyncMock(side_effect=_fetchrow)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch.object(ai_router.db, "pool", mock_pool):
        result = await ai_router.get_clausal_chains(
            region="8728f2ba8ffffff",
            lookback_hours=24,
            source="TAK_AIS",
            lat=None,
            lon=None,
            radius_nm=None,
        )

    assert len(result) == 1
    chain = result[0]
    assert chain["context_scope"]["spatial_mode"] == "h3"
    assert chain["context_scope"]["outages"]["scope"] == "mission_area"
    assert chain["context_scope"]["outages"]["linkage_reason"] == "h3_filter"
    assert chain["context_scope"]["space_weather"]["scope"] == "impact_linked_external"
    assert chain["context_scope"]["satnogs"]["scope"] == "global"
    assert chain["outage_context"][0]["country_code"] == "AA"
    assert chain["space_weather_context"]["kp_index"] == 5.0
    assert chain["satnogs_context"][0]["ground_station_name"] == "GS-1"

    outage_query = next(sql for sql in captured_queries if "FROM internet_outages" in sql)
    assert "ST_Within(geom, ST_GeomFromText($2, 4326))" in outage_query
    assert "time > now() - ($1 * interval '1 hour')" in outage_query
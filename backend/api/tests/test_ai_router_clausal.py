"""Regression tests for AOT-aware clausal-chain enrichment."""

from __future__ import annotations

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
async def test_clausal_chains_enrichment_uses_h3_and_time_scope():
    captured_queries: list[str] = []
    event_time = datetime(2026, 4, 8, 11, 45, tzinfo=timezone.utc)
    region = ai_router.h3.latlng_to_cell(0.0, 0.0, 7)

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
                    "time": event_time,
                    "norad_id": 12345,
                    "ground_station_name": "GS-1",
                    "signal_strength": -15.0,
                    "modulation": "FM",
                    "frequency": 145800000,
                }
            ]
        if "FROM satellites" in sql:
            return [{"norad_id": 12345, "tle_line1": "L1", "tle_line2": "L2"}]
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

    with (
        patch.object(ai_router.db, "pool", mock_pool),
        patch.object(ai_router, "_satellite_subpoint_for_time", return_value=(0.0, 0.0)),
    ):
        result = await ai_router.get_clausal_chains(
            region=region,
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
    assert chain["context_scope"]["space_weather"]["notes"] == "Thresholded external-driver gate applied: kp>=5"
    assert chain["context_scope"]["satnogs"]["scope"] == "mission_area"
    assert chain["context_scope"]["satnogs"]["linkage_reason"] == "orbital_subpoint_in_aot"
    assert chain["outage_context"][0]["country_code"] == "AA"
    assert chain["space_weather_context"]["kp_index"] == 5.0
    assert chain["space_weather_context"]["threshold_passed"] is True
    assert chain["space_weather_context"]["threshold"] == "kp>=5"
    assert chain["satnogs_context"][0]["ground_station_name"] == "GS-1"
    assert chain["satnogs_context"][0]["scope"] == "mission_area"
    assert chain["satnogs_context"][0]["subpoint_lat"] == 0.0

    outage_query = next(sql for sql in captured_queries if "FROM internet_outages" in sql)
    assert "ST_Within(geom, ST_GeomFromText($2, 4326))" in outage_query
    assert "time > now() - ($1 * interval '1 hour')" in outage_query


@pytest.mark.asyncio
async def test_clausal_chains_enrichment_uses_radius_scoped_satnogs_events():
    event_time = datetime(2026, 4, 8, 11, 45, tzinfo=timezone.utc)

    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
        if "FROM clausal_chains" in sql:
            return [
                {
                    "time": event_time,
                    "uid": "track-radius",
                    "source": "TAK_AIS",
                    "predicate_type": "a-f-s-m",
                    "locative_lat": 0.0,
                    "locative_lon": 0.0,
                    "locative_hae": 0.0,
                    "state_change_reason": "ZONE_ENTRY",
                    "adverbial_context": {"speed": 12},
                    "narrative_summary": "Radius test chain",
                }
            ]
        if "FROM internet_outages" in sql:
            return []
        if "FROM satnogs_signal_events" in sql:
            return [
                {
                    "time": event_time,
                    "norad_id": 11111,
                    "ground_station_name": "GS-NEAR",
                    "signal_strength": -16.0,
                    "modulation": "FM",
                    "frequency": 145800000,
                },
                {
                    "time": event_time,
                    "norad_id": 22222,
                    "ground_station_name": "GS-FAR",
                    "signal_strength": -18.0,
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

    async def _fetchrow(sql: str, *params):
        return None

    mock_conn.fetch = AsyncMock(side_effect=_fetch)
    mock_conn.fetchrow = AsyncMock(side_effect=_fetchrow)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    subpoints = {
        ("L1-A", "L2-A"): (0.0, 0.0),
        ("L1-B", "L2-B"): (12.0, 12.0),
    }

    def _fake_subpoint(tle_line1: str, tle_line2: str, at_time: datetime):
        return subpoints[(tle_line1, tle_line2)]

    with (
        patch.object(ai_router.db, "pool", mock_pool),
        patch.object(ai_router, "_satellite_subpoint_for_time", side_effect=_fake_subpoint),
    ):
        result = await ai_router.get_clausal_chains(
            region=None,
            lookback_hours=24,
            source=None,
            lat=0.0,
            lon=0.0,
            radius_nm=25.0,
        )

    assert len(result) == 1
    chain = result[0]
    assert chain["context_scope"]["spatial_mode"] == "radius"
    assert chain["context_scope"]["satnogs"]["scope"] == "mission_area"
    assert chain["context_scope"]["satnogs"]["linkage_reason"] == "orbital_subpoint_in_radius"
    assert len(chain["satnogs_context"]) == 1
    assert chain["satnogs_context"][0]["ground_station_name"] == "GS-NEAR"
    assert chain["satnogs_context"][0]["scope"] == "mission_area"


@pytest.mark.asyncio
async def test_clausal_chains_omits_below_threshold_space_weather_context():
    event_time = datetime(2026, 4, 8, 11, 45, tzinfo=timezone.utc)

    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
        if "FROM clausal_chains" in sql:
            return [
                {
                    "time": event_time,
                    "uid": "track-space-weather-threshold",
                    "source": "TAK_AIS",
                    "predicate_type": "a-f-s-m",
                    "locative_lat": 0.0,
                    "locative_lon": 0.0,
                    "locative_hae": 0.0,
                    "state_change_reason": "ZONE_ENTRY",
                    "adverbial_context": {"speed": 12},
                    "narrative_summary": "Threshold test chain",
                }
            ]
        if "FROM internet_outages" in sql:
            return []
        if "FROM satnogs_signal_events" in sql or "FROM satellites" in sql:
            return []
        return []

    async def _fetchrow(sql: str, *params):
        if "FROM space_weather_context" in sql:
            return {
                "time": event_time,
                "kp_index": 3.0,
                "kp_category": "Quiet",
                "dst_index": -10.0,
                "explanation": "Below threshold",
            }
        return None

    mock_conn.fetch = AsyncMock(side_effect=_fetch)
    mock_conn.fetchrow = AsyncMock(side_effect=_fetchrow)

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch.object(ai_router.db, "pool", mock_pool):
        result = await ai_router.get_clausal_chains(
            region=None,
            lookback_hours=24,
            source=None,
            lat=0.0,
            lon=0.0,
            radius_nm=25.0,
        )

    assert len(result) == 1
    chain = result[0]
    assert chain["context_scope"]["space_weather"]["scope"] == "impact_linked_external"
    assert chain["context_scope"]["space_weather"]["notes"] == "Thresholded external-driver gate applied: kp>=5"
    assert chain["space_weather_context"] is None


@pytest.mark.asyncio
async def test_clausal_chains_outages_use_cable_topology_country_filter_for_h3():
    captured_queries: list[str] = []
    region = ai_router.h3.latlng_to_cell(0.0, 0.0, 7)
    event_time = datetime(2026, 4, 8, 11, 45, tzinfo=timezone.utc)
    redis_payloads = {
        "infra:cable_country_index": '{"countries":{"country a":{"country":"Country A","station_points":[{"lat":0.0,"lon":-0.4}]},"country c":{"country":"Country C","station_points":[{"lat":8.0,"lon":8.0}]}},"cables":{"A-B Cable":{"countries":["country a"]}}}',
        "infra:cables": '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-0.4,0.0],[0.0,0.0],[0.4,0.0]]},"properties":{"name":"A-B Cable"}}]}',
        "infra:outages": '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"country":"Country A","country_code":"AA","severity":82.0},"geometry":{"type":"Point","coordinates":[-0.4,0.0]}},{"type":"Feature","properties":{"country":"Country C","country_code":"CC","severity":91.0},"geometry":{"type":"Point","coordinates":[8.0,8.0]}}]}'
    }

    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
        captured_queries.append(sql)
        if "FROM clausal_chains" in sql:
            return [
                {
                    "time": event_time,
                    "uid": "track-topology-h3",
                    "source": "TAK_AIS",
                    "predicate_type": "a-f-s-m",
                    "locative_lat": 0.0,
                    "locative_lon": 0.0,
                    "locative_hae": 0.0,
                    "state_change_reason": "ZONE_ENTRY",
                    "adverbial_context": {"speed": 12},
                    "narrative_summary": "Topology chain",
                }
            ]
        if "FROM internet_outages" in sql:
            assert "country_code = ANY($2::text[])" in sql
            assert params[1] == ["AA"]
            return [
                {
                    "time": event_time,
                    "country_code": "AA",
                    "severity": 82.0,
                    "asn_name": None,
                    "affected_nets": None,
                }
            ]
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
        patch.object(ai_router.db, "redis_client", _FakeRedis(redis_payloads)),
    ):
        result = await ai_router.get_clausal_chains(
            region=region,
            lookback_hours=24,
            source=None,
            lat=None,
            lon=None,
            radius_nm=None,
        )

    assert len(result) == 1
    chain = result[0]
    assert chain["context_scope"]["outages"]["scope"] == "impact_linked_external"
    assert chain["context_scope"]["outages"]["linkage_reason"] == "cable_topology"
    assert chain["outage_context"][0]["country_code"] == "AA"
    assert "country_code = ANY($2::text[])" in next(sql for sql in captured_queries if "FROM internet_outages" in sql)


@pytest.mark.asyncio
async def test_clausal_chains_outages_use_cable_topology_country_filter_for_radius():
    event_time = datetime(2026, 4, 8, 11, 45, tzinfo=timezone.utc)
    redis_payloads = {
        "infra:cable_country_index": '{"countries":{"country a":{"country":"Country A","station_points":[{"lat":0.0,"lon":-0.4}]},"country c":{"country":"Country C","station_points":[{"lat":8.0,"lon":8.0}]}},"cables":{"A-B Cable":{"countries":["country a"]}}}',
        "infra:cables": '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-0.4,0.0],[0.0,0.0],[0.4,0.0]]},"properties":{"name":"A-B Cable"}}]}',
        "infra:outages": '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"country":"Country A","country_code":"AA","severity":82.0},"geometry":{"type":"Point","coordinates":[-0.4,0.0]}},{"type":"Feature","properties":{"country":"Country C","country_code":"CC","severity":91.0},"geometry":{"type":"Point","coordinates":[8.0,8.0]}}]}'
    }

    mock_conn = MagicMock()

    async def _fetch(sql: str, *params):
        if "FROM clausal_chains" in sql:
            return [
                {
                    "time": event_time,
                    "uid": "track-topology-radius",
                    "source": "TAK_AIS",
                    "predicate_type": "a-f-s-m",
                    "locative_lat": 0.0,
                    "locative_lon": 0.0,
                    "locative_hae": 0.0,
                    "state_change_reason": "ZONE_ENTRY",
                    "adverbial_context": {"speed": 12},
                    "narrative_summary": "Topology radius chain",
                }
            ]
        if "FROM internet_outages" in sql:
            assert "country_code = ANY($2::text[])" in sql
            assert params[1] == ["AA"]
            return [
                {
                    "time": event_time,
                    "country_code": "AA",
                    "severity": 82.0,
                    "asn_name": None,
                    "affected_nets": None,
                }
            ]
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
        patch.object(ai_router.db, "redis_client", _FakeRedis(redis_payloads)),
    ):
        result = await ai_router.get_clausal_chains(
            region=None,
            lookback_hours=24,
            source=None,
            lat=0.0,
            lon=0.0,
            radius_nm=25.0,
        )

    assert len(result) == 1
    chain = result[0]
    assert chain["context_scope"]["spatial_mode"] == "radius"
    assert chain["context_scope"]["outages"]["scope"] == "impact_linked_external"
    assert chain["context_scope"]["outages"]["linkage_reason"] == "cable_topology"
    assert chain["outage_context"][0]["country_code"] == "AA"
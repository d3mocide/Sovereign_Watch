"""
Tests for TakClausalizerService.process_message ordering: state-change
evaluation must run BEFORE jitter filtering, so non-positional transitions
(anchoring, squawk emergencies, battery) survive the spatial gate while pure
positional noise is still dropped.
"""

import os
import sys
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from delta_engine import MedialClause  # noqa: E402
from service import TakClausalizerService  # noqa: E402
from state_change_evaluator import StateChangeEvent  # noqa: E402


def _prev(speed: float = 5.0, squawk: str | None = None) -> MedialClause:
    ctx = {
        "speed": speed,
        "course": 90.0,
        "altitude": 0.0,
        "battery_pct": 100.0,
    }
    if squawk:
        ctx["squawk"] = squawk
    return MedialClause(
        uid="VESSEL-1",
        time=1_700_000_000,
        source="TAK_AIS",
        predicate_type="a-f-S-S",
        lat=51.5000,
        lon=-0.1200,
        hae=0.0,
        adverbial_context=ctx,
    )


def _msg(speed: float, lat: float = 51.5000, lon: float = -0.1200, squawk: str | None = None) -> dict:
    detail = {
        "track": {"speed": speed, "course": 90.0},
        "status": {},
    }
    if squawk:
        detail["classification"] = {"squawk": squawk}
    return {
        "uid": "VESSEL-1",
        "type": "a-f-S-S",
        "time": 1_700_000_060_000,
        "point": {"lat": lat, "lon": lon, "hae": 0.0},
        "detail": detail,
    }


def _service(prev: MedialClause | None) -> TakClausalizerService:
    svc = TakClausalizerService()
    svc.delta_engine.get_previous_state = AsyncMock(return_value=prev)
    svc.delta_engine.cache_medial_clause = AsyncMock()
    svc.emitter.emit_state_change = AsyncMock(return_value=True)
    return svc


@pytest.mark.asyncio
async def test_anchoring_vessel_emits_despite_zero_movement():
    """moving→stationary is definitionally within the jitter bound; it must
    still emit a SPEED_TRANSITION clause."""
    svc = _service(_prev(speed=5.0))

    await svc.process_message(_msg(speed=0.0), "ais_raw")

    svc.emitter.emit_state_change.assert_awaited_once()
    reasons = [
        e.reason
        for e in svc.emitter.emit_state_change.await_args.kwargs["state_changes"]
    ]
    assert "SPEED_TRANSITION" in reasons
    assert svc.stats["state_changes_emitted"] == 1
    assert svc.stats["jitter_filtered"] == 0


@pytest.mark.asyncio
async def test_emergency_squawk_emits_despite_zero_movement():
    svc = _service(_prev(speed=0.0))

    await svc.process_message(_msg(speed=0.0, squawk="7700"), "adsb_raw")

    svc.emitter.emit_state_change.assert_awaited_once()
    reasons = [
        e.reason
        for e in svc.emitter.emit_state_change.await_args.kwargs["state_changes"]
    ]
    assert "SQUAWK_EMERGENCY" in reasons


@pytest.mark.asyncio
async def test_pure_positional_jitter_still_dropped():
    """~10 m of drift with no other change is GPS noise: drop, don't cache."""
    svc = _service(_prev(speed=5.0))

    await svc.process_message(_msg(speed=5.0, lat=51.50009), "ais_raw")

    svc.emitter.emit_state_change.assert_not_awaited()
    svc.delta_engine.cache_medial_clause.assert_not_awaited()
    assert svc.stats["jitter_filtered"] == 1


@pytest.mark.asyncio
async def test_location_transition_inside_jitter_bound_is_suppressed():
    """An H3 boundary 'crossing' produced by sub-bound drift is noise."""
    svc = _service(_prev(speed=5.0))
    svc.evaluator.evaluate_transitions = lambda uid, msg, prev: [
        StateChangeEvent(reason="LOCATION_TRANSITION", confidence=0.9, details={})
    ]

    await svc.process_message(_msg(speed=5.0, lat=51.50009), "ais_raw")

    svc.emitter.emit_state_change.assert_not_awaited()
    assert svc.stats["jitter_filtered"] == 1


@pytest.mark.asyncio
async def test_real_movement_with_location_transition_emits():
    svc = _service(_prev(speed=5.0))

    # ~5 km north: well beyond the jitter bound and across many H3-9 cells
    await svc.process_message(_msg(speed=5.0, lat=51.5450), "ais_raw")

    svc.emitter.emit_state_change.assert_awaited_once()
    reasons = [
        e.reason
        for e in svc.emitter.emit_state_change.await_args.kwargs["state_changes"]
    ]
    assert "LOCATION_TRANSITION" in reasons

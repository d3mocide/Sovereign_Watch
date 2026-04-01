"""
Unit tests for ClauseEmitter: message formatting and Kafka emission.
"""

import json
import pytest
from unittest.mock import AsyncMock

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from clause_emitter import ClauseEmitter
from delta_engine import MedialClause
from state_change_evaluator import StateChangeEvent


def _make_state_change(reason: str = "LOCATION_TRANSITION", confidence: float = 0.90) -> StateChangeEvent:
    return StateChangeEvent(reason=reason, confidence=confidence, details={})


def _make_new_state(
    lat: float = 51.5,
    lon: float = -0.12,
    hae: float = 100.0,
    speed: float = 50.0,
    course: float = 90.0,
    battery: float = 80.0,
    predicate_type: str = "a-f-A-C-F",
    ts: int = 1_700_000_060_000,  # ms since epoch
) -> dict:
    return {
        "type": predicate_type,
        "time": ts,
        "point": {"lat": lat, "lon": lon, "hae": hae},
        "detail": {
            "track": {"speed": speed, "course": course},
            "status": {"battery": battery},
        },
    }


def _make_prev_clause(lat: float = 51.4, lon: float = -0.13) -> MedialClause:
    return MedialClause(
        uid="EMIT-TEST",
        time=1_700_000_000,
        source="TAK_ADSB",
        predicate_type="a-f-A-C-F",
        lat=lat,
        lon=lon,
        hae=100.0,
        adverbial_context={"speed": 50.0, "course": 85.0},
    )


class TestClauseEmitterFormatting:
    """Test message structure produced by emit_state_change (producer mocked)."""

    @pytest.mark.asyncio
    async def test_emit_produces_correct_fields(self):
        emitter = ClauseEmitter("localhost:9092")

        mock_producer = AsyncMock()
        emitter.producer = mock_producer
        emitter.db_pool = None

        state_changes = [_make_state_change("LOCATION_TRANSITION", 0.90)]
        new_state = _make_new_state()

        result = await emitter.emit_state_change(
            uid="EMIT-TEST",
            source="TAK_ADSB",
            state_changes=state_changes,
            new_state=new_state,
            prev_clause=_make_prev_clause(),
        )

        assert result is True
        mock_producer.send_and_wait.assert_called_once()

        call_args = mock_producer.send_and_wait.call_args
        message_bytes = call_args.kwargs.get("value") or call_args.args[1]
        clause = json.loads(message_bytes)

        assert clause["uid"] == "EMIT-TEST"
        assert clause["source"] == "TAK_ADSB"
        assert clause["state_change_reason"] == "LOCATION_TRANSITION"
        assert clause["locative_lat"] == pytest.approx(51.5)
        assert clause["locative_lon"] == pytest.approx(-0.12)
        assert "adverbial_context" in clause
        assert clause["adverbial_context"]["confidence"] == pytest.approx(0.90)

    @pytest.mark.asyncio
    async def test_no_emit_when_no_state_changes(self):
        emitter = ClauseEmitter("localhost:9092")
        emitter.producer = AsyncMock()
        emitter.db_pool = None

        result = await emitter.emit_state_change(
            uid="EMIT-TEST",
            source="TAK_ADSB",
            state_changes=[],
            new_state=_make_new_state(),
            prev_clause=_make_prev_clause(),
        )

        assert result is False
        emitter.producer.send_and_wait.assert_not_called()

    @pytest.mark.asyncio
    async def test_primary_reason_is_first_state_change(self):
        emitter = ClauseEmitter("localhost:9092")
        emitter.producer = AsyncMock()
        emitter.db_pool = None

        state_changes = [
            _make_state_change("LOCATION_TRANSITION", 0.90),
            _make_state_change("SPEED_TRANSITION", 0.85),
        ]

        await emitter.emit_state_change(
            uid="EMIT-TEST",
            source="TAK_ADSB",
            state_changes=state_changes,
            new_state=_make_new_state(),
            prev_clause=_make_prev_clause(),
        )

        call_args = emitter.producer.send_and_wait.call_args
        message_bytes = call_args.kwargs.get("value") or call_args.args[1]
        clause = json.loads(message_bytes)

        assert clause["state_change_reason"] == "LOCATION_TRANSITION"
        assert set(clause["adverbial_context"]["state_change_reasons"]) == {
            "LOCATION_TRANSITION",
            "SPEED_TRANSITION",
        }

    @pytest.mark.asyncio
    async def test_confidence_is_max_of_state_changes(self):
        emitter = ClauseEmitter("localhost:9092")
        emitter.producer = AsyncMock()
        emitter.db_pool = None

        state_changes = [
            _make_state_change("SPEED_TRANSITION", 0.85),
            _make_state_change("BATTERY_CRITICAL", 0.95),
        ]

        await emitter.emit_state_change(
            uid="EMIT-TEST",
            source="TAK_ADSB",
            state_changes=state_changes,
            new_state=_make_new_state(),
            prev_clause=_make_prev_clause(),
        )

        call_args = emitter.producer.send_and_wait.call_args
        message_bytes = call_args.kwargs.get("value") or call_args.args[1]
        clause = json.loads(message_bytes)
        assert clause["adverbial_context"]["confidence"] == pytest.approx(0.95)

    @pytest.mark.asyncio
    async def test_timestamp_from_ms_epoch(self):
        """TAK ms-epoch timestamps are correctly parsed."""
        emitter = ClauseEmitter("localhost:9092")
        emitter.producer = AsyncMock()
        emitter.db_pool = None

        # 1_700_000_000_000 ms = 2023-11-14T22:13:20+00:00
        new_state = _make_new_state(ts=1_700_000_000_000)
        await emitter.emit_state_change(
            uid="TS-TEST",
            source="TAK_ADSB",
            state_changes=[_make_state_change()],
            new_state=new_state,
            prev_clause=_make_prev_clause(),
        )

        call_args = emitter.producer.send_and_wait.call_args
        message_bytes = call_args.kwargs.get("value") or call_args.args[1]
        clause = json.loads(message_bytes)
        # Should parse to an ISO string around 2023-11-14
        assert "2023" in clause["time"]

    @pytest.mark.asyncio
    async def test_no_producer_returns_false(self):
        emitter = ClauseEmitter("localhost:9092")
        emitter.producer = None
        emitter.db_pool = None

        result = await emitter.emit_state_change(
            uid="EMIT-TEST",
            source="TAK_ADSB",
            state_changes=[_make_state_change()],
            new_state=_make_new_state(),
            prev_clause=_make_prev_clause(),
        )
        assert result is False

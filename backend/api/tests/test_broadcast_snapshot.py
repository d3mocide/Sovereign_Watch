"""Tests for the broadcast last-value cache and fresh-client snapshot replay.

A freshly-connected WebSocket client must be bootstrapped with the current
world state immediately, rather than waiting for each poller's next full sweep
(the orbital sweep alone is a ~15-37 s cycle). These tests exercise the
last-value cache (LVC) and the snapshot sender directly, without Kafka/Redis.
"""

import os
import sys
import time

import pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

from core.config import settings  # noqa: E402
from services.broadcast import BroadcastManager  # noqa: E402


def _frame(tag: str) -> bytes:
    """Build a TAK-shaped opaque frame (magic header + tag) for assertions."""
    return bytes([0xBF, 0x01, 0xBF]) + tag.encode()


class FakeWS:
    """Minimal WebSocket double capturing sent binary frames."""

    def __init__(self, fail_after: int | None = None):
        self.sent: list[bytes] = []
        self.fail_after = fail_after

    async def send_bytes(self, data: bytes) -> None:
        if self.fail_after is not None and len(self.sent) >= self.fail_after:
            raise ConnectionError("client gone")
        self.sent.append(data)


def test_record_live_populates_and_overwrites():
    mgr = BroadcastManager()
    mgr._record_live("SAT-1", _frame("a"))
    mgr._record_live("AIR-1", _frame("b"))
    assert set(mgr._lvc.keys()) == {"SAT-1", "AIR-1"}

    # Latest frame wins for the same uid.
    mgr._record_live("SAT-1", _frame("a2"))
    assert mgr._lvc["SAT-1"][0] == _frame("a2")


def test_record_live_ignores_blank_uid():
    mgr = BroadcastManager()
    mgr._record_live(None, _frame("x"))
    mgr._record_live("", _frame("y"))
    assert mgr._lvc == {}


def test_snapshot_frames_excludes_stale():
    mgr = BroadcastManager()
    mgr._record_live("FRESH", _frame("f"))
    # Backdate a second entity beyond the TTL.
    stale_ts = mgr._lvc["FRESH"][1] - settings.LIVE_SNAPSHOT_TTL_SECONDS - 10
    mgr._lvc["STALE"] = (_frame("s"), stale_ts)

    frames = mgr._snapshot_frames()
    assert _frame("f") in frames
    assert _frame("s") not in frames


def test_maybe_prune_drops_stale():
    mgr = BroadcastManager()
    now = time.monotonic()
    for i in range(3):
        mgr._lvc[f"fresh{i}"] = (_frame(f"fresh{i}"), now)
    for i in range(2):
        mgr._lvc[f"stale{i}"] = (
            _frame(f"stale{i}"),
            now - settings.LIVE_SNAPSHOT_TTL_SECONDS - 1,
        )
    mgr._last_prune = 0.0  # force the interval gate open
    mgr._maybe_prune(now)
    assert set(mgr._lvc.keys()) == {"fresh0", "fresh1", "fresh2"}


def test_maybe_prune_enforces_hard_cap(monkeypatch):
    mgr = BroadcastManager()
    monkeypatch.setattr(settings, "LIVE_SNAPSHOT_MAX_ENTITIES", 2)
    now = time.monotonic()
    for i in range(5):
        mgr._lvc[f"e{i}"] = (_frame(f"e{i}"), now)
    # Over cap → prune runs even though the interval just reset.
    mgr._maybe_prune(now)
    assert len(mgr._lvc) == 2


@pytest.mark.asyncio
async def test_send_snapshot_sends_all_frames():
    mgr = BroadcastManager()
    for i in range(10):
        mgr._record_live(f"e{i}", _frame(f"e{i}"))
    ws = FakeWS()
    ok = await mgr._send_snapshot(ws)
    assert ok is True
    assert len(ws.sent) == 10


@pytest.mark.asyncio
async def test_send_snapshot_empty_is_noop():
    mgr = BroadcastManager()
    ws = FakeWS()
    ok = await mgr._send_snapshot(ws)
    assert ok is True
    assert ws.sent == []


@pytest.mark.asyncio
async def test_send_snapshot_handles_disconnect_midway():
    mgr = BroadcastManager()
    for i in range(10):
        mgr._record_live(f"e{i}", _frame(f"e{i}"))
    ws = FakeWS(fail_after=3)
    ok = await mgr._send_snapshot(ws)
    assert ok is False
    assert len(ws.sent) == 3


@pytest.mark.asyncio
async def test_send_snapshot_excludes_stale_entities():
    mgr = BroadcastManager()
    mgr._record_live("FRESH", _frame("fresh"))
    stale_ts = mgr._lvc["FRESH"][1] - settings.LIVE_SNAPSHOT_TTL_SECONDS - 10
    mgr._lvc["STALE"] = (_frame("stale"), stale_ts)

    ws = FakeWS()
    ok = await mgr._send_snapshot(ws)
    assert ok is True
    assert ws.sent == [_frame("fresh")]

"""Tests for the coalesced WebSocket batch framing in services/broadcast.py."""

from services.broadcast import (
    _BATCH_MAGIC,
    _MAX_BATCH_BYTES,
    coalesce_outgoing,
)

MAGIC = b"\xbf\x01\xbf"


def _msg(payload: bytes) -> bytes:
    return MAGIC + payload


def _parse_batch(frame: bytes) -> list[bytes]:
    assert frame[:3] == _BATCH_MAGIC
    records = []
    off = 3
    while off < len(frame):
        length = int.from_bytes(frame[off : off + 4], "little")
        off += 4
        records.append(frame[off : off + length])
        off += length
    return records


def test_single_message_stays_legacy_frame():
    m = _msg(b"hello")
    sends = coalesce_outgoing([m])
    assert sends == [("bytes", m)]


def test_multiple_messages_coalesce_into_batch_frame():
    msgs = [_msg(bytes([i]) * 10) for i in range(5)]
    sends = coalesce_outgoing(list(msgs))
    assert len(sends) == 1
    kind, frame = sends[0]
    assert kind == "bytes"
    assert _parse_batch(frame) == msgs


def test_alert_preserves_ordering_and_splits_batches():
    a, b, c = _msg(b"a"), _msg(b"b"), _msg(b"c")
    alert = ("alert", b'{"type":"alert"}')
    sends = coalesce_outgoing([a, b, alert, c])
    assert len(sends) == 3
    kind0, frame0 = sends[0]
    assert kind0 == "bytes"
    assert _parse_batch(frame0) == [a, b]
    assert sends[1] == ("text", b'{"type":"alert"}')
    assert sends[2] == ("bytes", c)  # lone trailing message → legacy frame


def test_batch_respects_byte_cap():
    big = _msg(b"x" * (_MAX_BATCH_BYTES // 2))
    sends = coalesce_outgoing([big, big, big])
    # Three ~30 KB messages cannot fit one 60 KB batch → at least two sends
    assert len(sends) >= 2
    reassembled = []
    for kind, frame in sends:
        assert kind == "bytes"
        if frame[:3] == _BATCH_MAGIC:
            reassembled.extend(_parse_batch(frame))
        else:
            reassembled.append(frame)
    assert reassembled == [big, big, big]


def test_only_alerts():
    alert = ("alert", b"{}")
    assert coalesce_outgoing([alert, alert]) == [("text", b"{}"), ("text", b"{}")]


def test_empty_input():
    assert coalesce_outgoing([]) == []

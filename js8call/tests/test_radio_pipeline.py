"""Protocol, readiness and receive-only regressions for the actual radio path."""

import asyncio
import json
import struct
from unittest.mock import AsyncMock

import pytest
from fastapi import WebSocketDisconnect

import server
from kiwi_client import KiwiClient


class Frames:
    def __init__(self, frames):
        self.frames = iter(frames)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self.frames)
        except StopIteration:
            raise StopAsyncIteration


def snd(flags, payload):
    return (
        b"SND"
        + bytes([flags])
        + struct.pack("<I", 1)
        + struct.pack(">H", 1000)
        + payload
    )


@pytest.mark.parametrize("flags,endian", [(0, ">"), (128, "<")])
def test_pcm_contract_preserves_signed_samples(flags, endian):
    expected = (1000, -2000, 3000, -4000)
    chunks = []
    client = KiwiClient(on_audio=chunks.append, on_status=lambda _: None)
    client._ws = Frames([snd(flags, struct.pack(endian + "4h", *expected))])
    asyncio.run(client._receive_loop())
    assert struct.unpack("<4h", chunks[0]) == expected


@pytest.mark.parametrize(
    "flags,payload", [(16, b"\x01\x02"), (8, b"\x01\x02"), (0, b"\x01")]
)
def test_unsupported_or_truncated_audio_is_not_played(flags, payload):
    chunks = []
    client = KiwiClient(on_audio=chunks.append, on_status=lambda _: None)
    client._ws = Frames([snd(flags, payload)])
    asyncio.run(client._receive_loop())
    assert chunks == []
    assert client._audio_last_received == 0


def test_waterfall_pairs_with_audio_session(monkeypatch):
    async def check():
        ws = AsyncMock()
        ws.__aiter__.return_value = []
        connect = AsyncMock(return_value=ws)
        monkeypatch.setattr("kiwi_client.websockets.connect", connect)
        client = KiwiClient(on_audio=lambda _: None, on_status=lambda _: None)
        client._session_ts = 123456
        await client._start_waterfall("receiver.example", 8073)
        assert "/123456/W/F" in connect.call_args.args[0]
        ws.send.assert_any_await("SET wf_comp=0")
        await client.disconnect()

    asyncio.run(check())


def test_waterfall_payload_excludes_header():
    rows = []
    client = KiwiClient(
        on_audio=lambda _: None, on_status=lambda _: None, on_waterfall=rows.append
    )
    pixels = bytes(range(256)) * 4
    client._wf_ws = Frames([b"W/F\x00" + struct.pack("<III", 4, 5, 6) + pixels])
    asyncio.run(client._wf_receive_loop())
    assert rows == [pixels]
    assert client._waterfall_last_received > 0


def test_receiver_refusal_does_not_become_ready():
    async def check():
        client = KiwiClient(on_audio=lambda _: None, on_status=lambda _: None)
        client._audio_ready = asyncio.get_running_loop().create_future()
        client._ws = Frames([b"MSG badp=1"])
        await client._receive_loop()
        with pytest.raises(RuntimeError, match="rejected"):
            await client._audio_ready
        assert not client.audio_receiving

    asyncio.run(check())


def test_decode_activity_and_directed_value_are_forwarded(monkeypatch):
    events = []
    monkeypatch.setattr(server, "_enqueue_from_thread", events.append)
    protocol = server.JS8CallUDPProtocol()
    monkeypatch.setattr(server, "_udp_send", lambda *a, **kw: None)
    for kind in ("RX.ACTIVITY", "RX.DIRECTED"):
        protocol.datagram_received(
            json.dumps(
                {"type": kind, "value": "KNOWN JS8", "params": {"SNR": -12}}
            ).encode(),
            ("127.0.0.1", 5555),
        )
    assert [e["type"] for e in events] == ["RX.ACTIVITY", "RX.DIRECTED"]
    assert all(e["text"] == "KNOWN JS8" for e in events)
    assert events[0]["snr"] == -12


def test_health_requires_decoder_contact(monkeypatch):
    monkeypatch.setattr(server, "_decoder_audio_ready", True)
    monkeypatch.setattr(server, "_js8_is_connected", lambda: False)
    response = asyncio.run(server.health())
    assert response.status_code == 503
    assert json.loads(response.body)["status"] == "degraded"
    monkeypatch.setattr(server, "_js8_is_connected", lambda: True)
    assert asyncio.run(server.health()).status_code == 200
    monkeypatch.setattr(server, "_decoder_audio_ready", False)
    assert asyncio.run(server.health()).status_code == 503


def test_send_never_claims_transmission_on_virtual_receiver(monkeypatch):
    class Socket:
        client = None

        def __init__(self):
            self.events = []
            self.first = True

        async def accept(self):
            pass

        async def send_json(self, event):
            self.events.append(event)

        async def receive_text(self):
            if not self.first:
                raise WebSocketDisconnect()
            self.first = False
            return json.dumps({"action": "SEND", "message": "DO NOT TRANSMIT"})

    calls = []
    monkeypatch.setattr(server, "AUTH_ENABLED", False)
    monkeypatch.setattr(server, "_udp_send", lambda *a, **kw: calls.append(a[0]))
    ws = Socket()
    asyncio.run(server.ws_js8(ws))
    assert any(
        e.get("type") == "ERROR" and "receive-only" in e["message"] for e in ws.events
    )
    assert not any(e.get("type") == "TX.SENT" for e in ws.events)
    assert "TX.SEND_MESSAGE" not in calls


@pytest.mark.parametrize("corked,expected", [(False, True), (True, False)])
def test_audio_probe_requires_running_decoder_capture(monkeypatch, corked, expected):
    from types import SimpleNamespace

    rows = [{"properties": {"application.process.binary": "JS8Call"}, "corked": corked}]
    monkeypatch.setattr(
        server.subprocess,
        "run",
        lambda *a, **kw: SimpleNamespace(stdout=json.dumps(rows)),
    )
    assert server._probe_decoder_audio() is expected
    rows[0]["properties"] = {"media.name": "Remapped Stream"}
    assert not server._probe_decoder_audio()


def test_invalid_udp_does_not_mark_decoder_alive(monkeypatch):
    monkeypatch.setattr(server, "_js8_reply_addr", None)
    monkeypatch.setattr(server, "_js8_last_heard", 0)
    protocol = server.JS8CallUDPProtocol()
    for payload in (b"broken", b"[]", b"{}", b" "):
        protocol.datagram_received(payload, ("127.0.0.1", 5555))
    assert server._js8_reply_addr is None
    assert server._js8_last_heard == 0

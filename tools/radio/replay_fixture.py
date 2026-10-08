#!/usr/bin/env python3
"""Replay a real JS8 WAV through Kiwi framing -> bridge -> decoder -> WebSocket.

Run INSIDE an isolated validation radio container, never the live station.
The fixture receiver binds loopback, and only receive/control commands are used.
"""

import argparse
import asyncio
import array
import json
import struct
import time
import wave
from pathlib import Path

import websockets


async def run(fixture: Path, expected: str | None, cycles: int):
    with wave.open(str(fixture)) as wav:
        assert (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) == (
            12000,
            1,
            2,
        )
        pcm = wav.readframes(wav.getnframes())
    events = []
    audio_frames = []
    waterfall_rows = []
    stream_started = asyncio.Event()

    async def receiver(ws):
        try:
            await stream_receiver(ws)
        except websockets.exceptions.ConnectionClosedOK:
            pass

    async def stream_receiver(ws):
        path = ws.request.path
        is_wf = path.endswith("/W/F")
        # Honor client handshake before streaming uncompressed frames.
        async for command in ws:
            if (is_wf and command == "SET wf_comp=0") or (
                not is_wf and command.startswith("SET AR OK")
            ):
                break
        seq = 0
        if is_wf:
            while True:
                await ws.send(
                    b"W/F\x00" + struct.pack("<III", 0, 5, seq) + bytes(range(256)) * 4
                )
                seq += 1
                await asyncio.sleep(0.2)
        else:
            # Keep audio flowing while waiting for the UTC 15-second JS8 boundary.
            start = (int(time.time()) // 15 + 2) * 15
            stream_started.set()
            next_send = time.monotonic()
            while time.time() < start:
                await ws.send(b"SND\x00" + struct.pack("<IH", seq, 1000) + bytes(1024))
                seq += 1
                next_send += 512 / 12000
                await asyncio.sleep(max(0, next_send - time.monotonic()))
            for _ in range(cycles):
                # Restart precisely on a decoder cycle; files contain 15 seconds.
                samples = array.array("h")
                samples.frombytes(pcm)
                samples.byteswap()  # Kiwi normal uncompressed wire format is BE.
                wire = samples.tobytes()
                next_send = time.monotonic()
                for offset in range(0, len(wire), 1024):
                    chunk = wire[offset : offset + 1024]
                    await ws.send(b"SND\x00" + struct.pack("<IH", seq, 1000) + chunk)
                    seq += 1
                    next_send += len(chunk) / 24000
                    await asyncio.sleep(max(0, next_send - time.monotonic()))
            # Keep connected long enough for the decoder's final processing.
            while True:
                await ws.send(b"SND\x00" + struct.pack("<IH", seq, 1000) + bytes(1024))
                seq += 1
                await asyncio.sleep(512 / 12000)

    async def consume(ws, target, binary=False):
        async for frame in ws:
            if binary:
                if isinstance(frame, bytes):
                    target.append(len(frame))
            else:
                event = json.loads(frame)
                target.append(event)
                if event.get("type") in ("RX.ACTIVITY", "RX.DIRECTED", "ERROR"):
                    print(json.dumps(event), flush=True)

    async with websockets.serve(receiver, "127.0.0.1", 18073):
        async with (
            websockets.connect("ws://127.0.0.1:8080/ws/js8") as control,
            websockets.connect("ws://127.0.0.1:8080/ws/audio") as audio,
            websockets.connect("ws://127.0.0.1:8080/ws/waterfall") as waterfall,
        ):
            tasks = [
                asyncio.create_task(consume(control, events)),
                asyncio.create_task(consume(audio, audio_frames, True)),
                asyncio.create_task(consume(waterfall, waterfall_rows, True)),
            ]
            try:
                await control.send(
                    json.dumps(
                        {
                            "action": "SET_KIWI",
                            "host": "127.0.0.1",
                            "port": 18073,
                            "freq": 7078,
                            "mode": "usb",
                        }
                    )
                )
                await asyncio.wait_for(stream_started.wait(), 15)
                # Decoder clock synchronization + fixture cycles + final processing.
                await asyncio.sleep(31 + cycles * 15 + 8)
                decoded = [
                    e
                    for e in events
                    if e.get("type") in ("RX.ACTIVITY", "RX.DIRECTED") and e.get("text")
                ]
                assert decoded, (
                    "Real decoder produced no messages from the known fixture"
                )
                if expected:
                    assert any(expected in e["text"] for e in decoded), (
                        expected,
                        decoded,
                    )
                assert audio_frames and sum(audio_frames) > len(pcm)
                assert waterfall_rows and all(n == 1024 for n in waterfall_rows)
                print(
                    json.dumps(
                        {
                            "result": "PASS",
                            "decoded": [e["text"] for e in decoded],
                            "audio_frames": len(audio_frames),
                            "waterfall_rows": len(waterfall_rows),
                        }
                    ),
                    flush=True,
                )
            finally:
                await control.send(json.dumps({"action": "DISCONNECT_KIWI"}))
                await asyncio.sleep(0.3)
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fixture", type=Path)
    parser.add_argument("--expected-text")
    parser.add_argument("--cycles", type=int, default=2)
    parser.add_argument(
        "--isolated-validation",
        action="store_true",
        required=True,
        help="Confirm this is an isolated container; it retunes the local bridge",
    )
    args = parser.parse_args()
    asyncio.run(run(args.fixture, args.expected_text, args.cycles))

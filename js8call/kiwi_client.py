"""
kiwi_client.py — Native async KiwiSDR WebSocket client.

Replaces the kiwirecorder subprocess with a pure-Python implementation of
the KiwiSDR SND WebSocket protocol.  The key improvement is lossless retuning:
changing frequency or mode sends new SET commands over the live WebSocket
rather than tearing down and restarting the process (~3-5 s dead audio).

KiwiSDR SND binary frame layout:
  [0:3]   "SND"  — magic bytes
  [3]     flags
  [4:8]   sequence number (uint32 big-endian)
  [8:10]  RSSI / S-meter (int16 big-endian, units: 0.1 dBm)
  [10:]   S16LE PCM @ 12 kHz mono
"""

import asyncio
import logging
import time
from typing import Callable, Optional

try:
    import websockets
    import websockets.exceptions as _wse
    _HAS_WEBSOCKETS = True
except ImportError:
    _HAS_WEBSOCKETS = False
    _wse = None  # type: ignore

logger = logging.getLogger("js8bridge.kiwi_client")

# ---------------------------------------------------------------------------
# Mode → (low_cut_Hz, high_cut_Hz) filter passband
# ---------------------------------------------------------------------------

MODE_FILTERS: dict[str, tuple[int, int]] = {
    "usb":  (300,   2700),
    "lsb":  (-2700, -300),
    "am":   (-5000, 5000),
    "cw":   (300,    800),
    "nbfm": (-8000, 8000),
}

CONNECT_TIMEOUT    = 10   # seconds — WebSocket open timeout
KEEPALIVE_INTERVAL = 5    # seconds — SET keepalive cadence


# ---------------------------------------------------------------------------
# KiwiClient
# ---------------------------------------------------------------------------

class KiwiClient:
    """
    Stateful async KiwiSDR client.

    Lifecycle::

        client = KiwiClient(on_audio=..., on_status=..., on_disconnect=...)
        await client.connect("sdr.example.com", 8073, 14074.0, "usb")
        await client.tune(14095.0, "usb")   # lossless — no reconnect
        await client.disconnect()

    Callbacks
    ---------
    on_audio(bytes)
        Called for every SND frame with the raw S16LE PCM payload (bytes 10+).
        Must be fast (synchronous); use a persistent pacat process as sink.

    on_status(dict)
        Called when connection state changes.  Dict keys:
        connected (bool), host, port, freq, mode.

    on_disconnect(int)
        Called on *unexpected* close only (not when disconnect() is called).
        Argument is the WebSocket close code (0 if unknown).
    """

    def __init__(
        self,
        on_audio:      Callable[[bytes], None],
        on_status:     Callable[[dict], None],
        on_disconnect: Optional[Callable[[int], None]] = None,
        on_rssi:       Optional[Callable[[float], None]] = None,
    ) -> None:
        self._on_audio      = on_audio
        self._on_status     = on_status
        self._on_disconnect = on_disconnect
        self._on_rssi       = on_rssi

        self._ws: Optional[object] = None  # websockets.WebSocketClientProtocol
        self._recv_task:      Optional[asyncio.Task] = None
        self._keepalive_task: Optional[asyncio.Task] = None

        self._host:        str   = ""
        self._port:        int   = 0
        self._freq_khz:    float = 0.0
        self._mode:        str   = ""
        self._disconnecting: bool = False  # True when we initiated the close
        self._frame_count: int   = 0       # For RSSI decimation

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def connect(
        self, host: str, port: int, freq_khz: float, mode: str
    ) -> None:
        """Connect to a KiwiSDR node and start streaming audio."""
        if not _HAS_WEBSOCKETS:
            raise RuntimeError("websockets library not installed")

        # Close existing connection gracefully first
        if self._ws is not None:
            await self.disconnect()

        self._disconnecting = False
        uri = f"ws://{host}:{port}/{int(time.time() * 1000)}/SND"
        logger.info("KiwiClient connecting → %s", uri)

        try:
            ws = await websockets.connect(
                uri,
                open_timeout=CONNECT_TIMEOUT,
                ping_interval=None,   # we handle keepalive manually
            )
        except Exception as exc:
            logger.warning("KiwiClient connect failed: %s", exc)
            raise

        self._ws   = ws
        self._host = host
        self._port = port

        await self._handshake(freq_khz, mode)

        self._recv_task      = asyncio.create_task(self._receive_loop(),  name="kiwi-recv")
        self._keepalive_task = asyncio.create_task(self._keepalive_loop(), name="kiwi-keepalive")

        self._on_status({
            "connected": True,
            "host": host, "port": port,
            "freq": freq_khz, "mode": mode,
        })
        logger.info("KiwiClient connected: %s:%d @ %.3f kHz %s", host, port, freq_khz, mode)

    async def tune(self, freq_khz: float, mode: str) -> None:
        """
        Lossless retune — send new SET mod/freq commands over the live WebSocket.
        No reconnect.  Raises RuntimeError if not connected.
        """
        if not self.is_connected:
            raise RuntimeError("KiwiClient.tune() called while not connected")
        await self._send_mod(freq_khz, mode)
        self._freq_khz = freq_khz
        self._mode     = mode
        self._on_status({
            "connected": True,
            "host": self._host, "port": self._port,
            "freq": freq_khz, "mode": mode,
        })
        logger.info("KiwiClient retuned → %.3f kHz %s", freq_khz, mode)

    async def disconnect(self) -> None:
        """Gracefully close the WebSocket and cancel background tasks."""
        self._disconnecting = True
        for task in (self._recv_task, self._keepalive_task):
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        self._on_status({"connected": False, "host": "", "port": 0, "freq": 0, "mode": ""})
        logger.info("KiwiClient disconnected")

    @property
    def is_connected(self) -> bool:
        if self._ws is None:
            return False
        state = getattr(self._ws, "state", None)
        if state is not None:
            return state.name == "OPEN"
        return not getattr(self._ws, "closed", True)

    @property
    def config(self) -> dict:
        return {
            "host":  self._host,
            "port":  self._port,
            "freq":  self._freq_khz,
            "mode":  self._mode,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _handshake(self, freq_khz: float, mode: str) -> None:
        """Execute the KiwiSDR SND handshake sequence."""
        await self._ws.send("SET auth t=kiwi p=")
        await self._send_mod(freq_khz, mode)
        await self._ws.send("SET compression=0")
        await self._ws.send("SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=50")
        await self._ws.send("SET AR OK in=12000 out=44100")
        self._freq_khz = freq_khz
        self._mode     = mode

    async def _send_mod(self, freq_khz: float, mode: str) -> None:
        lc, hc = MODE_FILTERS.get(mode, (-5000, 5000))
        await self._ws.send(
            f"SET mod={mode} low_cut={lc} high_cut={hc} freq={freq_khz:.3f}"
        )

    async def _receive_loop(self) -> None:
        """Read binary SND frames; dispatch PCM payload to on_audio callback."""
        try:
            async for frame in self._ws:
                if not isinstance(frame, bytes):
                    continue
                # Validate SND magic header and extract PCM (bytes 10+)
                if len(frame) > 10 and frame[:3] == b"SND":
                    # Extract RSSI (bytes 8-9, int16 BE, units: 0.1 dBm) every 10 frames
                    self._frame_count += 1
                    if self._on_rssi and self._frame_count % 10 == 0:
                        rssi_raw = int.from_bytes(frame[8:10], "big", signed=True)
                        self._on_rssi(rssi_raw / 10.0)
                    pcm = frame[10:]
                    if pcm:
                        self._on_audio(pcm)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # Distinguish clean close from unexpected disconnect
            closed_ok   = _HAS_WEBSOCKETS and isinstance(exc, _wse.ConnectionClosedOK)
            closed_err  = _HAS_WEBSOCKETS and isinstance(exc, _wse.ConnectionClosedError)
            if closed_ok:
                pass
            elif closed_err:
                code = exc.code if hasattr(exc, 'code') else 0
                logger.warning("KiwiClient closed unexpectedly (code=%s)", code)
                if not self._disconnecting and self._on_disconnect:
                    self._on_disconnect(code or 0)
            else:
                logger.warning("KiwiClient receive error: %s", exc)
                if not self._disconnecting and self._on_disconnect:
                    self._on_disconnect(0)

    async def _keepalive_loop(self) -> None:
        """Send SET keepalive every KEEPALIVE_INTERVAL seconds."""
        try:
            while True:
                await asyncio.sleep(KEEPALIVE_INTERVAL)
                if self.is_connected:
                    await self._ws.send("SET keepalive")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.debug("KiwiClient keepalive error: %s", exc)

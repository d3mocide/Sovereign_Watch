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
from typing import Callable, Optional, Dict

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
        on_waterfall:  Optional[Callable[[bytes], None]] = None,
    ) -> None:
        self._on_audio      = on_audio
        self._on_status     = on_status
        self._on_disconnect = on_disconnect
        self._on_rssi       = on_rssi
        self._on_waterfall  = on_waterfall

        self._ws: Optional[object] = None  # websockets.WebSocketClientProtocol
        self._wf_ws: Optional[object] = None  # Waterfall WebSocket protocol
        self._recv_task:      Optional[asyncio.Task] = None
        self._keepalive_task: Optional[asyncio.Task] = None
        self._wf_recv_task:   Optional[asyncio.Task] = None
        self._command_tasks:  Dict[str, asyncio.Task] = {}

        self._host:        str   = ""
        self._port:        int   = 0
        self._freq_khz:    float = 0.0
        self._mode:        str   = ""
        self._zoom:        int   = 5       # Default zoom level (0-14, 5 ~±468kHz)
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

        # Start waterfall if callback provided
        if self._on_waterfall:
            await self._start_waterfall(host, port)

        logger.info("KiwiClient connected: %s:%d @ %.3f kHz %s", host, port, freq_khz, mode)

    async def set_agc(self, agc_on: bool, man_gain: int) -> None:
        """
        Control the KiwiSDR AGC / manual RF gain.

        Parameters
        ----------
        agc_on   : True = automatic gain control, False = manual gain.
        man_gain : Pre-ADC gain level, 0–120 dB.  Meaningful in both modes
                   (acts as max-gain ceiling when AGC is on).
        """
        if not self.is_connected:
            raise RuntimeError("KiwiClient.set_agc() called while not connected")
        
        async def _do_set_agc():
            level = max(0, min(120, man_gain))
            if agc_on:
                await self._ws.send(
                    f"SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain={level}"
                )
            else:
                await self._ws.send(f"SET agc=0 manGain={level}")
            logger.info("KiwiClient AGC → agc_on=%s manGain=%d", agc_on, level)

        await self._debounce_command("agc", 0.5, _do_set_agc)

    async def set_zoom(self, zoom: int) -> None:
        """
        Set the waterfall zoom level (0-14).
        """
        if not self.is_connected:
            return
        
        async def _do_set_zoom():
            z = max(0, min(14, zoom))
            self._zoom = z
            if self._wf_ws:
                await self._wf_ws.send(f"SET zoom={z} cf={self._freq_khz:.3f}")
            logger.info("KiwiClient zoom → %d (cf=%.3f)", z, self._freq_khz)

        await self._debounce_command("zoom", 0.3, _do_set_zoom)

    async def set_squelch(self, enabled: bool, threshold: int) -> None:
        """
        Enable or disable the KiwiSDR squelch gate.

        Parameters
        ----------
        enabled   : True = squelch on, False = squelch off.
        threshold : 0–150.  Frames below this level are muted.
                    Meaningful only when enabled=True.
        """
        if not self.is_connected:
            raise RuntimeError("KiwiClient.set_squelch() called while not connected")

        async def _do_set_squelch():
            if enabled:
                level = max(0, min(150, threshold))
                await self._ws.send(f"SET squelch=1 max={level}")
            else:
                await self._ws.send("SET squelch=0 max=0")
            logger.info("KiwiClient squelch → enabled=%s threshold=%d", enabled, threshold)

        await self._debounce_command("squelch", 0.5, _do_set_squelch)

    async def tune(self, freq_khz: float, mode: str) -> None:
        """
        Lossless retune — send new SET mod/freq commands over the live WebSocket.
        No reconnect.  Raises RuntimeError if not connected.
        """
        if not self.is_connected:
            raise RuntimeError("KiwiClient.tune() called while not connected")

        async def _do_tune():
            await self._send_mod(freq_khz, mode)
            self._freq_khz = freq_khz
            self._mode     = mode
            self._on_status({
                "connected": True,
                "host": self._host, "port": self._port,
                "freq": freq_khz, "mode": mode,
            })
            logger.info("KiwiClient retuned → %.3f kHz %s", freq_khz, mode)

        await self._debounce_command("tune", 0.5, _do_tune)

    async def disconnect(self) -> None:
        """Gracefully close the WebSocket and cancel background tasks."""
        self._disconnecting = True
        
        # Cancel all background loops and debounced command tasks
        tasks_to_cancel = [self._recv_task, self._keepalive_task, self._wf_recv_task]
        tasks_to_cancel.extend(self._command_tasks.values())

        for task in tasks_to_cancel:
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        
        self._command_tasks.clear()

        for ws in (self._ws, self._wf_ws):
            if ws:
                try:
                    await ws.close()
                except Exception:
                    pass
        self._ws = None
        self._wf_ws = None
        self._on_status({"connected": False, "host": "", "port": 0, "freq": 0, "mode": ""})
        logger.info("KiwiClient disconnected")

    @property
    def is_connected(self) -> bool:
        if self._ws is None:
            return False
        if hasattr(self._ws, "open"):
            return self._ws.open
        state = getattr(self._ws, "state", None)
        if state is not None:
            if hasattr(state, "name"):
                return state.name == "OPEN"
            return state == 1  # 1 == OPEN
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

    async def _debounce_command(self, name: str, delay: float, coro_func) -> None:
        """
        Cancel existing task for 'name' and schedule a new one after 'delay' seconds.
        """
        if name in self._command_tasks:
            task = self._command_tasks[name]
            if not task.done():
                task.cancel()
        
        async def _wrapper():
            try:
                await asyncio.sleep(delay)
                await coro_func()
            except asyncio.CancelledError:
                pass
            finally:
                # Only remove if it's still our task (avoid race condition)
                if self._command_tasks.get(name) == asyncio.current_task():
                    self._command_tasks.pop(name, None)

        self._command_tasks[name] = asyncio.create_task(_wrapper(), name=f"kiwi-db-{name}")

    async def _handshake(self, freq_khz: float, mode: str) -> None:
        """Execute the KiwiSDR SND handshake sequence."""
        self._freq_khz = freq_khz
        self._mode     = mode
        # Blast entire configuration burst to avoid SDR initialization timeout!
        await self._ws.send("SET auth t=kiwi p=")
        await self._ws.send("SET squelch=0 max=0")
        await self._ws.send("SET genattn=0")
        await self._ws.send("SET gen=0 mix=-1")
        await self._ws.send("SET ident_user=js8bridge")
        await self._send_mod(freq_khz, mode)
        await self._ws.send("SET compression=0")
        await self._ws.send("SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=50")
        # Required: KiwiSDR only begins sending SND frames after receiving SET AR OK.
        # in=12000 is the KiwiSDR DSP output rate (always 12 kHz); out=44100 is ignored.
        await self._ws.send("SET AR OK in=12000 out=44100")

    async def _send_mod(self, freq_khz: float, mode: str) -> None:
        lc, hc = MODE_FILTERS.get(mode, (-5000, 5000))
        # Must be sent as a single atomic command or the KiwiSDR stream will hang!
        await self._ws.send(f"SET mod={mode} low_cut={lc} high_cut={hc} freq={freq_khz:.3f}")
        # Recenter waterfall on new frequency (respect current zoom level)
        if self._wf_ws:
            await self._wf_ws.send(f"SET zoom={self._zoom} cf={freq_khz:.3f}")

    async def _receive_loop(self) -> None:
        """Read binary SND frames; dispatch PCM payload to on_audio callback."""
        logger.debug("KiwiClient receive loop started")
        try:
            async for frame in self._ws:
                if not isinstance(frame, bytes):
                    continue
                
                # Check for KiwiSDR text frames (MSG ...)
                if frame.startswith(b"MSG "):
                    msg_text = frame.decode("utf-8", errors="ignore")
                    
                    # Some versions send MSG audio_init=... audio_rate=...
                    if "audio_rate=" in msg_text:
                        try:
                            # Extract the audio rate integer
                            ar_in = int(msg_text.split("audio_rate=")[1].split()[0])
                            logger.info("KiwiClient dynamic audio rate detected: %d", ar_in)
                            await self._ws.send(f"SET AR OK in={ar_in} out=44100")
                        except Exception as e:
                            logger.warning("Failed to parse audio_rate from %r: %s", msg_text, e)
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
            logger.debug("KiwiClient receive loop cancelled")
            raise
        except BaseException as exc:
            logger.error("KiwiClient receive error: %s", repr(exc))
            # Distinguish clean close from unexpected disconnect
            closed_err = _HAS_WEBSOCKETS and isinstance(exc, _wse.ConnectionClosedError)
            if closed_err:
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
                if self._wf_ws:
                    await self._wf_ws.send("SET keepalive")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.debug("KiwiClient keepalive error: %s", exc)

    async def _start_waterfall(self, host: str, port: int) -> None:
        """Start the KiwiSDR waterfall stream (W/F).

        Full W/F handshake per the KiwiSDR protocol reference:
          1. SET auth t=kiwi p=
          2. SET zoom=5 cf=<freq>   (±468 kHz around audio frequency; cf= centers on kHz value)
          3. SET maxdb=-10 mindb=-110   (colour scale)
          4. SET wf_speed=4   (rows/second; 0 = no output, must be > 0)
          5. SET wf_comp=0   (uncompressed pixel bytes)
        """
        wf_uri = f"ws://{host}:{port}/{int(time.time() * 1000)}/W/F"
        try:
            ws = await websockets.connect(wf_uri, open_timeout=CONNECT_TIMEOUT, ping_interval=None)
            self._wf_ws = ws
            await ws.send("SET auth t=kiwi p=")
            await ws.send(f"SET zoom={self._zoom} cf={self._freq_khz:.3f}")  # Respect current zoom
            await ws.send("SET maxdb=-10 mindb=-110")  # colour scale
            await ws.send("SET wf_speed=4")            # 4 rows/second; must be >0 to receive frames
            await ws.send("SET wf_comp=0")             # uncompressed pixel bytes

            self._wf_recv_task = asyncio.create_task(self._wf_receive_loop(), name="kiwi-wf-recv")
            logger.info("KiwiClient waterfall started")
        except Exception as exc:
            logger.warning("KiwiClient waterfall startup failed: %s", exc)

    async def _wf_receive_loop(self) -> None:
        """Read binary W/F frames; dispatch waterfall rows to callback."""
        try:
            async for frame in self._wf_ws:
                if not isinstance(frame, bytes):
                    continue
                # W/F frame layout: [0-2] "W/F" [3] flags [4-7] seq [8-9] reserved [10+] pixels
                if len(frame) > 10 and frame[:3] == b"W/F":
                    pixels = frame[10:]
                    if self._on_waterfall:
                        self._on_waterfall(pixels)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.debug("KiwiClient waterfall receive error: %s", exc)

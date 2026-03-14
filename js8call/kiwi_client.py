"""
kiwi_client.py — Native async KiwiSDR WebSocket client.

Replaces the kiwirecorder subprocess with a pure-Python implementation of
the KiwiSDR SND WebSocket protocol.  The key improvement is lossless retuning:
changing frequency or mode sends new SET commands over the live WebSocket
rather than tearing down and restarting the process (~3-5 s dead audio).

KiwiSDR SND binary frame layout (per KiwiSDR server source):
  [0:3]   "SND"  — ASCII tag (frame type discriminator)
  [3]     flags  — bitfield: 0x02=ADC_OVFL, 0x08=STEREO, 0x10=COMPRESSED, 0x80=LE_PCM
  [4:8]   sequence number (uint32 little-endian)
  [8:10]  S-meter raw value (uint16 big-endian); rssi_dBm = 0.1 * smeter - 127
  [10:]   S16LE PCM @ 12 kHz mono

KiwiSDR W/F binary frame layout:
  [0:3]   "W/F"  — ASCII tag
  [3]     W/F flags (reserved; skipped per upstream body[1:] convention)
  [4:8]   x_bin_server (uint32 little-endian)
  [8:12]  flags_x_zoom_server (uint32 little-endian)
  [12:16] sequence number (uint32 little-endian)
  [16:]   waterfall pixel bytes (uint8, uncompressed when wf_comp=0)
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
# SND frame flag bits
# ---------------------------------------------------------------------------

SND_FLAG_ADC_OVFL   = 0x02  # ADC overflow: antenna/input overloaded
SND_FLAG_STEREO     = 0x08  # Stereo/IQ frame (GPS timestamp header prepended)
SND_FLAG_COMPRESSED = 0x10  # IMA-ADPCM compressed (we request compression=0)
SND_FLAG_LE_PCM     = 0x80  # PCM is little-endian (always set on current KiwiSDR)

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

CONNECT_TIMEOUT    = 10  # seconds — WebSocket open timeout
KEEPALIVE_INTERVAL = 5   # seconds — SET keepalive cadence


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
        Not called when squelch gate is closed.  Must be fast (synchronous).

    on_status(dict)
        Called when connection state changes.  Dict keys:
        connected (bool), host, port, freq, mode.

    on_disconnect(int)
        Called on *unexpected* close only (not when disconnect() is called).
        Argument is the WebSocket close code (0 if unknown).

    on_rssi(float)
        Called approximately every 10 audio frames with signal strength in dBm.

    on_waterfall(bytes)
        Called for each W/F frame with raw pixel bytes.

    on_adc_overload()
        Called whenever an SND frame has the ADC overflow flag set.
        Indicates the antenna/input is overloaded on the remote node — the
        user should pick a different node or reduce gain.
    """

    def __init__(
        self,
        on_audio:        Callable[[bytes], None],
        on_status:       Callable[[dict], None],
        on_disconnect:   Optional[Callable[[int], None]] = None,
        on_rssi:         Optional[Callable[[float], None]] = None,
        on_waterfall:    Optional[Callable[[bytes], None]] = None,
        on_adc_overload: Optional[Callable[[], None]] = None,
    ) -> None:
        self._on_audio        = on_audio
        self._on_status       = on_status
        self._on_disconnect   = on_disconnect
        self._on_rssi         = on_rssi
        self._on_waterfall    = on_waterfall
        self._on_adc_overload = on_adc_overload

        self._ws:             Optional[object] = None
        self._wf_ws:          Optional[object] = None
        self._recv_task:      Optional[asyncio.Task] = None
        self._keepalive_task: Optional[asyncio.Task] = None
        self._wf_recv_task:   Optional[asyncio.Task] = None
        self._command_tasks:  Dict[str, asyncio.Task] = {}

        self._host:        str   = ""
        self._port:        int   = 0
        self._freq_khz:    float = 0.0
        self._mode:        str   = ""
        self._zoom:        int   = 5
        self._disconnecting: bool = False
        self._frame_count: int   = 0

        # Client-side squelch gate with hysteresis.
        # The server squelch (SET squelch=1 max=<close_thresh>) acts as a
        # bandwidth guard.  Client-side hysteresis prevents rapid open/close
        # cycling when RSSI hovers near the threshold.
        self._squelch_enabled:         bool  = False
        self._squelch_open_thresh_dbm: float = -100.0  # open  when RSSI ≥ this
        self._squelch_close_thresh_dbm: float = -110.0  # close when RSSI < this
        self._squelch_open:            bool  = True    # gate starts open

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def connect(
        self, host: str, port: int, freq_khz: float, mode: str, password: str = ""
    ) -> None:
        """Connect to a KiwiSDR node and start streaming audio.

        Parameters
        ----------
        password : Optional KiwiSDR password.  Required for password-protected
                   or private nodes; leave empty ("") for open public nodes.
        """
        if not _HAS_WEBSOCKETS:
            raise RuntimeError("websockets library not installed")

        if self._ws is not None:
            await self.disconnect()

        self._disconnecting = False
        uri = f"ws://{host}:{port}/{int(time.time() * 1000)}/SND"
        logger.info("KiwiClient connecting → %s", uri)

        try:
            ws = await websockets.connect(
                uri,
                open_timeout=CONNECT_TIMEOUT,
                ping_interval=None,  # we handle keepalive manually
            )
        except Exception as exc:
            logger.warning("KiwiClient connect failed: %s", exc)
            raise

        self._ws   = ws
        self._host = host
        self._port = port

        await self._handshake(freq_khz, mode, password)

        self._recv_task      = asyncio.create_task(self._receive_loop(),   name="kiwi-recv")
        self._keepalive_task = asyncio.create_task(self._keepalive_loop(), name="kiwi-keepalive")

        self._on_status({
            "connected": True,
            "host": host, "port": port,
            "freq": freq_khz, "mode": mode,
        })

        if self._on_waterfall:
            await self._start_waterfall(host, port)

        logger.info("KiwiClient connected: %s:%d @ %.3f kHz %s", host, port, freq_khz, mode)

    async def set_agc(self, agc_on: bool, man_gain: int) -> None:
        """
        Control the KiwiSDR AGC / manual RF gain.

        Parameters
        ----------
        agc_on   : True = automatic gain control, False = manual gain.
        man_gain : Pre-ADC gain level, 0–120 dB.  Acts as a max-gain ceiling
                   when AGC is on, or fixed gain when AGC is off.
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

    async def set_noise_blanker(
        self, gate_usec: int = 500, thresh_percent: int = 50, enabled: bool = True
    ) -> None:
        """
        Configure and enable/disable the KiwiSDR noise blanker.

        The KiwiSDR implements two NB algorithms; this controls algo=1 / type=0
        (standard impulse blanker), which is the most effective for HF impulse
        noise sources: lightning, power lines, and ignition interference.

        Parameters
        ----------
        gate_usec      : Blanker gate duration in microseconds (typical: 100–2000).
                         Short gates (~200 µs) for narrow impulses; longer for
                         slow-rise interference.
        thresh_percent : Trigger threshold as a percentage of peak signal
                         (typical: 20–80).  Lower = more aggressive blanking.
        enabled        : True to enable, False to disable.
        """
        if not self.is_connected:
            raise RuntimeError("KiwiClient.set_noise_blanker() called while not connected")

        async def _do_set_nb():
            en = 1 if enabled else 0
            await self._ws.send("SET nb algo=1")
            await self._ws.send(f"SET nb type=0 param=0 pval={gate_usec}")
            await self._ws.send(f"SET nb type=0 param=1 pval={thresh_percent}")
            await self._ws.send(f"SET nb type=0 en={en}")
            logger.info(
                "KiwiClient NB → enabled=%s gate=%d µs thresh=%d%%",
                enabled, gate_usec, thresh_percent,
            )

        await self._debounce_command("nb", 0.3, _do_set_nb)

    async def set_de_emp(self, de_emp: int = 0) -> None:
        """
        Set the audio de-emphasis filter.

        Parameters
        ----------
        de_emp : 0 = off, 1 = 50 µs (European FM), 2 = 75 µs (US FM / AM BCB).
                 Has no meaningful effect in USB/LSB mode (JS8 default), but
                 useful when the same client is reused for AM/broadcast monitoring.
        """
        if not self.is_connected:
            raise RuntimeError("KiwiClient.set_de_emp() called while not connected")

        de_emp = max(0, min(2, de_emp))
        await self._ws.send(f"SET de_emp={de_emp}")
        logger.info("KiwiClient de-emphasis → %d", de_emp)

    async def set_zoom(self, zoom: int) -> None:
        """Set the waterfall zoom level (0–14)."""
        if not self.is_connected:
            return

        async def _do_set_zoom():
            z = max(0, min(14, zoom))
            self._zoom = z
            if self._wf_ws:
                await self._wf_ws.send(f"SET zoom={z} cf={self._freq_khz:.3f}")
            logger.info("KiwiClient zoom → %d (cf=%.3f)", z, self._freq_khz)

        await self._debounce_command("zoom", 0.3, _do_set_zoom)

    async def set_squelch(
        self, enabled: bool, threshold: int, hysteresis: int = 10
    ) -> None:
        """
        Configure the squelch gate with hysteresis.

        Uses a two-threshold design to prevent rapid open/close cycling when
        signal strength hovers near the threshold:

          • Opens  when RSSI ≥  threshold
          • Stays open while RSSI ≥ (threshold − hysteresis)
          • Closes when RSSI <  (threshold − hysteresis)

        The server-side squelch is set to the *close* threshold as a bandwidth
        guard; client-side hysteresis governs the actual open/close transitions.

        Parameters
        ----------
        enabled    : True to enable squelch, False to pass all audio.
        threshold  : Open threshold in KiwiSDR S-meter units (0–150).
        hysteresis : Hysteresis margin in S-meter units (default 10 ≈ 1 dBm).
                     Prevents chatter when RSSI drifts near the open threshold.
        """
        if not self.is_connected:
            raise RuntimeError("KiwiClient.set_squelch() called while not connected")

        async def _do_set_squelch():
            t       = max(0, min(150, threshold))
            h       = max(0, min(t, hysteresis))
            close_t = t - h

            # Store thresholds as dBm for RSSI comparison in the receive loop.
            self._squelch_enabled          = enabled
            self._squelch_open_thresh_dbm  = 0.1 * t       - 127.0
            self._squelch_close_thresh_dbm = 0.1 * close_t - 127.0
            # Reset gate to open so audio flows immediately after reconfiguring.
            self._squelch_open = not enabled

            if enabled:
                # Server gate at close threshold saves bandwidth; client hysteresis
                # controls the precise open/close transitions above that floor.
                await self._ws.send(f"SET squelch=1 max={close_t}")
            else:
                await self._ws.send("SET squelch=0 max=0")
                self._squelch_open = True

            logger.info(
                "KiwiClient squelch → enabled=%s open=%.1f dBm close=%.1f dBm",
                enabled,
                self._squelch_open_thresh_dbm,
                self._squelch_close_thresh_dbm,
            )

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
        self._ws    = None
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
            return state == 1
        return not getattr(self._ws, "closed", True)

    @property
    def config(self) -> dict:
        return {
            "host": self._host,
            "port": self._port,
            "freq": self._freq_khz,
            "mode": self._mode,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _debounce_command(self, name: str, delay: float, coro_func) -> None:
        """Cancel any existing task for 'name' and schedule a new one after 'delay' s."""
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
                if self._command_tasks.get(name) == asyncio.current_task():
                    self._command_tasks.pop(name, None)

        self._command_tasks[name] = asyncio.create_task(_wrapper(), name=f"kiwi-db-{name}")

    async def _handshake(self, freq_khz: float, mode: str, password: str = "") -> None:
        """Execute the KiwiSDR SND handshake sequence."""
        self._freq_khz = freq_khz
        self._mode     = mode
        # Authentication — empty password string is valid for open public nodes.
        await self._ws.send(f"SET auth t=kiwi p={password}")
        await self._ws.send("SET squelch=0 max=0")
        await self._ws.send("SET ident_user=js8bridge")
        await self._send_mod(freq_khz, mode)
        await self._ws.send("SET compression=0")
        await self._ws.send("SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=50")
        # Required: KiwiSDR only begins sending SND frames after SET AR OK.
        # in=12000 is the KiwiSDR DSP output rate (always 12 kHz); out=44100 is ignored.
        await self._ws.send("SET AR OK in=12000 out=44100")

    async def _send_mod(self, freq_khz: float, mode: str) -> None:
        lc, hc = MODE_FILTERS.get(mode, (-5000, 5000))
        # Single atomic command — splitting mod and freq causes stream stalls.
        await self._ws.send(f"SET mod={mode} low_cut={lc} high_cut={hc} freq={freq_khz:.3f}")
        if self._wf_ws:
            await self._wf_ws.send(f"SET zoom={self._zoom} cf={freq_khz:.3f}")

    async def _receive_loop(self) -> None:
        """Read binary SND frames; dispatch PCM payload via on_audio callback."""
        logger.debug("KiwiClient receive loop started")
        try:
            async for frame in self._ws:
                if not isinstance(frame, bytes):
                    continue

                # Text-framed MSG (audio_init, rate negotiation, etc.)
                if frame.startswith(b"MSG "):
                    msg_text = frame.decode("utf-8", errors="ignore")
                    if "audio_rate=" in msg_text:
                        try:
                            ar_in = int(msg_text.split("audio_rate=")[1].split()[0])
                            logger.info("KiwiClient dynamic audio rate: %d Hz", ar_in)
                            await self._ws.send(f"SET AR OK in={ar_in} out=44100")
                        except Exception as e:
                            logger.warning("Failed to parse audio_rate from %r: %s", msg_text, e)
                    continue

                # SND binary audio frame:
                #   [0:3]  "SND"   — ASCII tag
                #   [3]    flags   — SND_FLAG_ADC_OVFL=0x02, COMPRESSED=0x10, LE_PCM=0x80
                #   [4:8]  seq     — uint32 little-endian
                #   [8:10] smeter  — uint16 big-endian; rssi_dBm = 0.1 * smeter - 127
                #   [10:]  PCM     — S16LE @ 12 kHz mono
                if len(frame) > 10 and frame[:3] == b"SND":
                    flags = frame[3]

                    # ADC overflow: remote node's input is overloaded.
                    if (flags & SND_FLAG_ADC_OVFL) and self._on_adc_overload:
                        self._on_adc_overload()

                    # RSSI — decimated to ~every 10 frames (≈ 400 ms at 23 fps).
                    self._frame_count += 1
                    if self._frame_count % 10 == 0:
                        smeter = int.from_bytes(frame[8:10], "big", signed=False)
                        rssi   = 0.1 * smeter - 127.0
                        if self._on_rssi:
                            self._on_rssi(rssi)
                        # Update client-side squelch gate using hysteresis thresholds.
                        if self._squelch_enabled:
                            if rssi >= self._squelch_open_thresh_dbm:
                                self._squelch_open = True
                            elif rssi < self._squelch_close_thresh_dbm:
                                self._squelch_open = False
                            # In the hysteresis band: maintain current state.

                    pcm = frame[10:]
                    if pcm and (not self._squelch_enabled or self._squelch_open):
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

        Full W/F handshake per the KiwiSDR protocol:
          1. SET auth t=kiwi p=
          2. SET zoom=<n> cf=<freq>   — centers waterfall on audio frequency
          3. SET maxdb=-10 mindb=-110  — colour scale
          4. SET wf_speed=4           — rows/second; must be > 0 to receive frames
          5. SET wf_comp=0            — uncompressed pixel bytes
        """
        wf_uri = f"ws://{host}:{port}/{int(time.time() * 1000)}/W/F"
        try:
            ws = await websockets.connect(wf_uri, open_timeout=CONNECT_TIMEOUT, ping_interval=None)
            self._wf_ws = ws
            await ws.send("SET auth t=kiwi p=")
            await ws.send(f"SET zoom={self._zoom} cf={self._freq_khz:.3f}")
            await ws.send("SET maxdb=-10 mindb=-110")
            await ws.send("SET wf_speed=4")
            await ws.send("SET wf_comp=0")
            self._wf_recv_task = asyncio.create_task(self._wf_receive_loop(), name="kiwi-wf-recv")
            logger.info("KiwiClient waterfall started")
        except Exception as exc:
            logger.warning("KiwiClient waterfall startup failed: %s", exc)

    async def _wf_receive_loop(self) -> None:
        """Read binary W/F frames; dispatch waterfall pixel rows via on_waterfall callback.

        W/F frame layout:
          [0:3]   "W/F"  — ASCII tag
          [3]     W/F flags (reserved; skipped per upstream body[1:] convention)
          [4:8]   x_bin_server       (uint32 little-endian)
          [8:12]  flags_x_zoom_server (uint32 little-endian)
          [12:16] sequence number    (uint32 little-endian)
          [16:]   pixel bytes        (uint8, uncompressed when wf_comp=0)
        """
        try:
            async for frame in self._wf_ws:
                if not isinstance(frame, bytes):
                    continue
                if len(frame) > 16 and frame[:3] == b"W/F":
                    pixels = frame[16:]
                    if self._on_waterfall:
                        self._on_waterfall(pixels)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.debug("KiwiClient waterfall receive error: %s", exc)

# KiwiSDR Integration — Complete Architectural Breakdown

> **Purpose:** Reference document covering the full signal path from browser UI to remote KiwiSDR receiver —
> including every API command, connection handshake, binary frame format, and audio pipeline stage.
> Written to help replicate or adapt this implementation in another project.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Map](#2-component-map)
3. [KiwiSDR Native Protocol](#3-kiwisdr-native-protocol)
4. [Python WebSocket Client (`utils/kiwisdr.py`)](#4-python-websocket-client)
5. [Flask Backend Proxy (`routes/websdr.py`)](#5-flask-backend-proxy)
6. [Receiver Discovery & REST API](#6-receiver-discovery--rest-api)
7. [Browser WebSocket Client (`static/js/modes/websdr.js`)](#7-browser-websocket-client)
8. [Audio Pipeline](#8-audio-pipeline)
9. [S-Meter Decoding](#9-s-meter-decoding)
10. [Frequency Change Flow — End-to-End](#10-frequency-change-flow--end-to-end)
11. [Full Connection Lifecycle](#11-full-connection-lifecycle)
12. [Thread Model & Concurrency](#12-thread-model--concurrency)
13. [Why There Is No Waterfall (and How to Add One)](#13-why-there-is-no-waterfall-and-how-to-add-one)
14. [Security Considerations](#14-security-considerations)
15. [Dependency Stack](#15-dependency-stack)
16. [Quick Reference — All API Commands](#16-quick-reference--all-api-commands)

---

## 1. System Overview

This implementation provides **in-browser audio streaming from any remote KiwiSDR receiver** via a
server-side proxy. The browser never speaks the KiwiSDR binary protocol directly. Instead:

```
Browser (JS)
    │  WebSocket (JSON commands + binary audio)
    ▼
Flask Server (Python)   ◄── acts as proxy
    │  WebSocket (KiwiSDR native text/binary protocol)
    ▼
Remote KiwiSDR Receiver
    │  RF antenna → SDR hardware → onboard DSP
    ▼
  Real-world RF signal (HF/shortwave, 0–30 MHz)
```

The proxy architecture is intentional:
- Browsers cannot connect to arbitrary `ws://` hosts when the page is served over HTTPS (mixed content)
- The server normalises the binary protocol before it reaches the browser
- The server can enforce input validation and rate limiting centrally

---

## 2. Component Map

```
intercept-downstream/
├── utils/
│   └── kiwisdr.py              # KiwiSDRClient — native protocol WebSocket client
│
├── routes/
│   └── websdr.py               # Flask blueprint:
│                               #   • Receiver discovery & caching
│                               #   • REST API (/websdr/*)
│                               #   • WebSocket audio proxy (/ws/kiwi-audio)
│
├── static/js/modes/
│   └── websdr.js               # Browser JS:
│                               #   • Globe/map UI
│                               #   • WebSocket to /ws/kiwi-audio
│                               #   • Web Audio API playback
│
├── templates/partials/modes/
│   └── websdr.html             # Sidebar HTML: frequency input, mode selector,
│                               #   S-meter bar, volume slider, status display
│
└── tests/
    ├── test_kiwisdr.py         # Unit tests for protocol client
    └── test_websdr.py          # Unit tests for REST endpoints
```

---

## 3. KiwiSDR Native Protocol

KiwiSDR runs a custom WebSocket protocol, not HTTP. Everything sent to the KiwiSDR is a
**UTF-8 text frame**. Everything received from the KiwiSDR is a **binary frame**.

### 3.1 WebSocket URL Format

```
ws://<host>:<port>/<timestamp_ms>/SND
```

- `<timestamp_ms>` — current Unix time in milliseconds. KiwiSDR uses this as a session token.
  Any integer works; it just needs to be present.
- `/SND` — endpoint selector. KiwiSDR also has `/WF` (waterfall) and `/MSG` (metadata) endpoints.
  This implementation only uses `/SND`.
- Default port: **8073**

**Example:**
```
ws://myreceiver.example.com:8073/1741734000000/SND
```

### 3.2 Text Commands Sent to KiwiSDR

All commands are plain ASCII strings sent as WebSocket text frames.

#### Authentication
```
SET auth t=kiwi p=<password>
```
- `t=kiwi` — client type identifier, always `kiwi`
- `p=` — password (empty string if the receiver is open)
- Must be the **first command** sent after the socket opens
- Wait ~200ms after this before sending further commands (KiwiSDR processes async)

#### Disable Compression
```
SET compression=0
```
- KiwiSDR can send compressed audio; setting `0` requests raw PCM
- Must be sent before requesting audio

#### AGC Setup
```
SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=50
```
| Parameter | Value | Meaning |
|-----------|-------|---------|
| `agc`     | 1     | Enable automatic gain control |
| `hang`    | 0     | No hang time after signal drops |
| `thresh`  | -100  | AGC threshold in dBm |
| `slope`   | 6     | AGC slope (dB/decade) |
| `decay`   | 1000  | AGC decay time (ms) |
| `manGain` | 50    | Manual gain (0-120 dB, used when AGC=0) |

#### Tune to Frequency
```
SET mod=<mode> low_cut=<hz> high_cut=<hz> freq=<khz>
```
| Parameter  | Type  | Description |
|------------|-------|-------------|
| `mod`      | string | Demodulation mode: `am`, `usb`, `lsb`, `cw` |
| `low_cut`  | int Hz | Lower edge of passband filter (negative = below carrier) |
| `high_cut` | int Hz | Upper edge of passband filter |
| `freq`     | float kHz | Centre frequency **in kHz** |

**Default passband values per mode:**
| Mode | low_cut | high_cut | Notes |
|------|---------|----------|-------|
| AM   | -4500   | +4500    | ±4.5 kHz, symmetric |
| USB  | +300    | +3000    | Upper sideband voice |
| LSB  | -3000   | -300     | Lower sideband voice |
| CW   | +300    | +800     | Narrow CW filter |

**Example — tune to 7.074 MHz FT8 (USB):**
```
SET mod=usb low_cut=300 high_cut=3000 freq=7074
```

#### Start Audio Stream
```
SET AR OK in=12000 out=44100
```
- `in=12000` — incoming sample rate from KiwiSDR DSP (always 12 kHz)
- `out=44100` — hints the client's output rate; KiwiSDR ignores this
- KiwiSDR begins sending binary SND frames after this command

#### Keepalive
```
SET keepalive
```
- Must be sent every **5 seconds** or the KiwiSDR server disconnects the client
- No response is sent back

---

## 4. Python WebSocket Client

**File:** `utils/kiwisdr.py`

### 4.1 Class: `KiwiSDRClient`

```python
class KiwiSDRClient:
    def __init__(self, host, port=8073, on_audio=None, on_error=None,
                 on_disconnect=None, password=''):
```

| Parameter      | Type     | Description |
|----------------|----------|-------------|
| `host`         | str      | KiwiSDR hostname or IP |
| `port`         | int      | Port (default 8073) |
| `on_audio`     | callable | Called with `(pcm_bytes: bytes, smeter: int)` for each SND frame |
| `on_error`     | callable | Called with `(message: str)` on connection errors |
| `on_disconnect`| callable | Called with no args when connection drops |
| `password`     | str      | Receiver password (empty = open) |

### 4.2 `connect(frequency_khz, mode)` — Full Handshake Sequence

```python
def connect(self, frequency_khz: float, mode: str = 'am') -> bool:
```

Execution order (all on the calling thread):

```
1.  Build WebSocket URL:  ws://<host>:<port>/<timestamp_ms>/SND
2.  websocket.WebSocket().connect(url)   # TCP + WebSocket handshake
3.  ws.send('SET auth t=kiwi p=<password>')
4.  time.sleep(0.2)                      # auth needs a moment
5.  ws.send('SET compression=0')
6.  ws.send('SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=50')
7.  ws.send('SET mod=<mode> low_cut=<lo> high_cut=<hi> freq=<khz>')
8.  ws.send('SET AR OK in=12000 out=44100')
9.  self._connected = True
10. Start _receive_thread (daemon)       # reads binary SND frames
11. Start _keepalive_thread (daemon)     # sends SET keepalive every 5s
12. return True
```

### 4.3 `tune(frequency_khz, mode)` — Retune Without Reconnecting

```python
def tune(self, frequency_khz: float, mode: str = 'am') -> bool:
```

- Sends only the `SET mod=...` command on the existing open socket
- **Does not** restart the audio stream or re-authenticate
- Returns `False` if not connected

### 4.4 Binary SND Frame Parser

**Format** (all bytes, big-endian where applicable):

```
Offset  Size  Type         Description
------  ----  -----------  ----------------------------------
0       3     ASCII        Magic: "SND"
3       1     uint8        Flags (unused in this impl)
4       4     uint32 BE    Sequence number (monotonically increasing)
8       2     int16 BE     S-meter value (dBm × 10)
10      N     int16 LE[]   PCM audio samples (12 kHz, mono, signed 16-bit)
```

**Parsing code (from `_parse_snd_frame`):**
```python
if data[:3] != b'SND':
    return
smeter_raw = struct.unpack('>h', data[8:10])[0]   # big-endian signed int16
pcm_data   = data[10:]                              # remaining bytes = audio
```

### 4.5 Thread Architecture

```
Main Thread
  └─ connect() — blocking handshake, then spawns two daemon threads:

Daemon Thread: kiwi-rx
  └─ _receive_loop()
       └─ ws.recv() with 2s timeout (loop)
            ├─ if bytes → _parse_snd_frame() → on_audio callback
            └─ if text → ignored (status messages from KiwiSDR)

Daemon Thread: kiwi-ka
  └─ _keepalive_loop()
       └─ sleep 5s → ws.send('SET keepalive') → repeat
```

### 4.6 Thread Safety

A `threading.Lock()` (`_send_lock`) guards all `ws.send()` calls so the receive thread,
keepalive thread, and any external `tune()` call cannot interleave writes.

### 4.7 `parse_host_port(url)` Helper

Strips protocol prefixes (`http://`, `https://`, `ws://`, `wss://`) and extracts
`(host, port)`. Defaults to port 8073 if no port is specified.

```python
parse_host_port('http://myreceiver.ddns.net:8073')
# → ('myreceiver.ddns.net', 8073)

parse_host_port('myreceiver.ddns.net')
# → ('myreceiver.ddns.net', 8073)
```

---

## 5. Flask Backend Proxy

**File:** `routes/websdr.py`

### 5.1 Initialisation

Called from `app.py` at startup:

```python
from routes.websdr import init_websdr_audio
init_websdr_audio(app)
```

`init_websdr_audio` uses `flask-sock` to register the `/ws/kiwi-audio` WebSocket endpoint.
If `flask-sock` is not installed, the audio proxy is silently disabled (REST endpoints still work).

### 5.2 Global State

```python
_kiwi_client: Optional[KiwiSDRClient] = None   # single active connection
_kiwi_lock = threading.Lock()                   # guards _kiwi_client
_kiwi_audio_queue: queue.Queue = queue.Queue(maxsize=200)  # audio buffer
```

> **Important:** Only **one** KiwiSDR connection is active at a time (server-wide).
> Connecting a second browser tab will disconnect the first. This is a design
> simplification, not a protocol limitation.

### 5.3 WebSocket Endpoint: `/ws/kiwi-audio`

```
Browser  ────WS JSON cmd────►  /ws/kiwi-audio  ────WS text────►  KiwiSDR
Browser  ◄───WS binary audio── /ws/kiwi-audio  ◄───WS binary───  KiwiSDR
```

**Main loop logic:**

```python
while True:
    # 1. Check for commands from browser (non-blocking, 5ms timeout)
    msg = ws.receive(timeout=0.005)
    if msg:
        data = json.loads(msg)
        _handle_kiwi_command(ws, data['cmd'], data)

    # 2. Forward buffered audio to browser (non-blocking)
    try:
        audio_data = _kiwi_audio_queue.get_nowait()
        ws.send(audio_data)            # binary frame
    except queue.Empty:
        time.sleep(0.005)
```

The loop alternates between checking for incoming browser commands and flushing
buffered audio. The 5ms sleep prevents spinning the CPU when the queue is empty.

### 5.4 Command Handler: `_handle_kiwi_command(ws, cmd, data)`

#### Command: `connect`

**Browser sends:**
```json
{
  "cmd": "connect",
  "url": "http://myreceiver.example.com:8073",
  "freq_khz": 7074,
  "mode": "usb",
  "password": ""
}
```

**Server logic:**
1. Parse `url` → `host`, `port` via `parse_host_port()`
2. Validate `mode` is in `('am', 'usb', 'lsb', 'cw')`
3. Reject `host` containing `;`, `&`, or `|` (injection guard)
4. Disconnect any existing `_kiwi_client`
5. Create new `KiwiSDRClient` with callbacks:
   - `on_audio` → packs smeter + PCM → `_kiwi_audio_queue.put_nowait()`
   - `on_error` → sends `{"type": "error", "message": "..."}` to browser
   - `on_disconnect` → sends `{"type": "disconnected"}` to browser
6. Call `_kiwi_client.connect(freq_khz, mode)`

**Server responds (success):**
```json
{
  "type": "connected",
  "host": "myreceiver.example.com",
  "port": 8073,
  "freq_khz": 7074,
  "mode": "usb",
  "sample_rate": 12000
}
```

**Server responds (failure):**
```json
{"type": "error", "message": "Connection to KiwiSDR failed"}
```

#### Command: `tune`

**Browser sends:**
```json
{
  "cmd": "tune",
  "freq_khz": 14200,
  "mode": "usb"
}
```

**Server logic:**
1. Verify `_kiwi_client` exists and is connected
2. Call `_kiwi_client.tune(freq_khz, mode)`
3. This sends `SET mod=usb low_cut=300 high_cut=3000 freq=14200` to KiwiSDR

**Server responds:**
```json
{
  "type": "tuned",
  "freq_khz": 14200,
  "mode": "usb"
}
```

#### Command: `disconnect`

**Browser sends:**
```json
{"cmd": "disconnect"}
```

**Server logic:**
1. Calls `_disconnect_kiwi()` → `_kiwi_client.disconnect()` → drains queue
2. Responds: `{"type": "disconnected"}`

### 5.5 Audio Queue & Buffer Management

```python
# on_audio callback (called from kiwi-rx thread):
def on_audio(pcm_bytes, smeter):
    header = struct.pack('>h', smeter)     # 2 bytes big-endian signed int16
    packet = header + pcm_bytes            # prepend S-meter to PCM
    try:
        _kiwi_audio_queue.put_nowait(packet)
    except queue.Full:
        _kiwi_audio_queue.get_nowait()     # drop oldest frame
        _kiwi_audio_queue.put_nowait(packet)
```

- Queue max: **200 chunks** (~a few seconds of audio)
- When full, oldest chunk is dropped (newest preserved — avoids growing lag)
- Main loop drains queue into browser as fast as the WebSocket allows

---

## 6. Receiver Discovery & REST API

### 6.1 Data Sources

KiwiSDR publishes a global receiver directory as a JavaScript file:

```
https://rx.skywavelinux.com/kiwisdr_com.js   (primary)
http://rx.linkfanel.net/kiwisdr_com.js        (fallback)
```

File format — JavaScript with an embedded JSON array:
```javascript
var kiwisdr_com = [
  {
    "name": "My Receiver",
    "url": "http://myreceiver.example.com:8073",
    "gps": "(51.317266, -2.950479)",
    "antenna": "Wire dipole",
    "loc": "Bath, UK",
    "users": "1",
    "users_max": "4",
    "bands": "0-30000000",
    "offline": "no",
    "status": "active"
  },
  ...
];
```

The `bands` field is in **Hz** (e.g., `"0-30000000"` = 0–30 MHz).
Parsing converts to kHz: `freq_lo = int(parts[0]) / 1000`.

### 6.2 Receiver Cache

```python
_receiver_cache: list[dict] = []
_cache_timestamp: float = 0
CACHE_TTL = 3600  # 1 hour
```

`get_receivers(force_refresh=False)` checks the timestamp and re-fetches if stale.
The lock prevents simultaneous fetches from concurrent requests.

### 6.3 REST Endpoints

#### `GET /websdr/receivers`

```
Query params:
  freq_khz  float   Filter: only receivers covering this frequency
  available string  "true" = only receivers with open user slots
  refresh   string  "true" = force cache invalidation

Response:
{
  "status": "success",
  "receivers": [ {...}, ... ],   // max 100
  "total": 47,
  "cached_total": 312
}
```

Each receiver object:
```json
{
  "name": "My Receiver",
  "url": "http://myreceiver.example.com:8073",
  "lat": 51.317266,
  "lon": -2.950479,
  "location": "Bath, UK",
  "users": 1,
  "users_max": 4,
  "antenna": "Wire dipole",
  "bands": "0-30000000",
  "freq_lo": 0,
  "freq_hi": 30000,
  "available": true
}
```

#### `GET /websdr/receivers/nearest`

```
Query params:
  lat       float   Your latitude (required)
  lon       float   Your longitude (required)
  freq_khz  float   Optional frequency filter

Response:
{
  "status": "success",
  "receivers": [
    { ...receiver..., "distance_km": 45.2 },
    ...
  ]   // max 10, sorted by distance
}
```

Distance calculated via Haversine formula (great-circle distance).

#### `GET /websdr/spy-station/<station_id>/receivers`

Returns receivers that can tune to a specific spy/numbers station frequency.
Integrates with the `routes/spy_stations.py` module.

#### `GET /websdr/status`

```json
{
  "status": "ok",
  "cached_receivers": 312,
  "cache_age_seconds": 1847,
  "cache_ttl": 3600,
  "audio_connected": true
}
```

---

## 7. Browser WebSocket Client

**File:** `static/js/modes/websdr.js`

### 7.1 Key State Variables

```javascript
let kiwiWebSocket = null;       // WebSocket to /ws/kiwi-audio
let kiwiAudioContext = null;    // Web Audio API context (12 kHz)
let kiwiScriptProcessor = null; // Audio processing node
let kiwiGainNode = null;        // Volume control
let kiwiAudioBuffer = [];       // Ring buffer of Float32Array chunks
let kiwiConnected = false;      // Connection state flag
let kiwiCurrentFreq = 0;        // Current frequency in kHz
let kiwiCurrentMode = 'am';     // Current demod mode
let kiwiSmeter = 0;             // Latest S-meter raw value
```

### 7.2 `connectToReceiver(receiverUrl, freqKhz, mode)`

```javascript
function connectToReceiver(receiverUrl, freqKhz, mode) {
    // 1. Open WebSocket to Flask proxy
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    kiwiWebSocket = new WebSocket(`${proto}//${location.host}/ws/kiwi-audio`);
    kiwiWebSocket.binaryType = 'arraybuffer';

    // 2. On open: send connect command
    kiwiWebSocket.onopen = () => {
        kiwiWebSocket.send(JSON.stringify({
            cmd: 'connect',
            url: receiverUrl,
            freq_khz: freqKhz,
            mode: mode,
        }));
    };

    // 3. On message: route by type
    kiwiWebSocket.onmessage = (event) => {
        if (typeof event.data === 'string') {
            handleKiwiStatus(JSON.parse(event.data));   // JSON control message
        } else {
            handleKiwiAudio(event.data);                // binary audio frame
        }
    };
}
```

### 7.3 `handleKiwiStatus(msg)` — Status Message Router

| `msg.type`    | Action |
|---------------|--------|
| `connected`   | Store `freq_khz`, `mode`, `sample_rate`. Call `initKiwiAudioContext()`. |
| `tuned`       | Update `kiwiCurrentFreq`, `kiwiCurrentMode`. Update UI displays. |
| `error`       | Log to console. Show notification. Set UI to error state. |
| `disconnected`| Call `cleanupKiwiAudio()`. Set UI to disconnected state. |

### 7.4 `tuneKiwi(freqKhz, mode)` — Frequency Change

```javascript
function tuneKiwi(freqKhz, mode) {
    if (!kiwiWebSocket || !kiwiConnected) return;
    kiwiWebSocket.send(JSON.stringify({
        cmd: 'tune',
        freq_khz: freqKhz,
        mode: mode || kiwiCurrentMode,
    }));
}
```

Called from:
- `tuneFromBar()` — user types new freq in the floating audio bar
- `tuneToSpyStation()` — user clicks a spy station preset (if already connected)

### 7.5 `handleKiwiAudio(arrayBuffer)` — Binary Frame Parsing

```javascript
function handleKiwiAudio(arrayBuffer) {
    const view = new DataView(arrayBuffer);

    // First 2 bytes: S-meter (big-endian signed int16)
    kiwiSmeter = view.getInt16(0, false);   // false = big-endian

    // Remaining bytes: PCM int16 LE → convert to float32
    const pcmData = new Int16Array(arrayBuffer, 2);
    const float32 = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
        float32[i] = pcmData[i] / 32768.0;   // normalise to [-1, 1]
    }

    // Push to playback buffer (capped at ~2 seconds)
    kiwiAudioBuffer.push(float32);
    const maxChunks = Math.ceil((12000 * 2) / 512);
    while (kiwiAudioBuffer.length > maxChunks) {
        kiwiAudioBuffer.shift();   // drop oldest to prevent runaway lag
    }
}
```

---

## 8. Audio Pipeline

### 8.1 End-to-End Signal Path

```
KiwiSDR Hardware
  │  RF → ADC → DSP (demodulate, filter, resample to 12 kHz)
  ▼
Binary SND frames (12 kHz PCM, int16 LE)
  │  WebSocket (KiwiSDR native)
  ▼
Python: _receive_loop() → _parse_snd_frame()
  │  on_audio(pcm_bytes, smeter) callback
  ▼
_kiwi_audio_queue (max 200 chunks)
  │  main WS loop: _kiwi_audio_queue.get_nowait()
  ▼
Browser: WebSocket binary frame  [2-byte smeter][PCM int16 LE...]
  │  handleKiwiAudio()
  ▼
kiwiAudioBuffer (Float32Array chunks, max ~2 seconds)
  │  ScriptProcessorNode.onaudioprocess pulls from buffer
  ▼
kiwiGainNode (volume control)
  │
  ▼
AudioContext.destination → speakers
```

### 8.2 AudioContext Initialisation

```javascript
function initKiwiAudioContext(sampleRate) {
    // sampleRate = 12000 (from server's 'connected' message)
    kiwiAudioContext = new AudioContext({ sampleRate: sampleRate });

    if (kiwiAudioContext.state === 'suspended') {
        kiwiAudioContext.resume();   // handle browser autoplay policy
    }

    // ScriptProcessorNode: buffer size 2048 samples, 0 inputs, 1 output channel
    kiwiScriptProcessor = kiwiAudioContext.createScriptProcessor(2048, 0, 1);
    kiwiScriptProcessor.onaudioprocess = (e) => {
        const output = e.outputBuffer.getChannelData(0);
        // Pull from kiwiAudioBuffer, fill output[], silence if buffer empty
    };

    kiwiGainNode = kiwiAudioContext.createGain();
    kiwiGainNode.gain.value = 0.8;   // restored from localStorage

    kiwiScriptProcessor.connect(kiwiGainNode);
    kiwiGainNode.connect(kiwiAudioContext.destination);
}
```

### 8.3 ScriptProcessorNode Buffer Pull Logic

```javascript
kiwiScriptProcessor.onaudioprocess = (e) => {
    const output = e.outputBuffer.getChannelData(0);  // Float32Array[2048]
    let offset = 0;

    while (offset < output.length && kiwiAudioBuffer.length > 0) {
        const chunk = kiwiAudioBuffer[0];
        const needed = output.length - offset;

        if (chunk.length <= needed) {
            // Consume entire chunk
            output.set(chunk, offset);
            offset += chunk.length;
            kiwiAudioBuffer.shift();
        } else {
            // Consume part of chunk, keep remainder
            output.set(chunk.subarray(0, needed), offset);
            kiwiAudioBuffer[0] = chunk.subarray(needed);
            offset += needed;
        }
    }

    // Fill any remaining output with silence (underrun)
    while (offset < output.length) {
        output[offset++] = 0;
    }
};
```

> **Note:** `ScriptProcessorNode` is deprecated in favour of `AudioWorkletNode`.
> It still works in all current browsers but `AudioWorkletNode` is the recommended
> replacement for new projects.

### 8.4 Volume Control

```javascript
function setKiwiVolume(value) {           // value: 0-100
    kiwiGainNode.gain.value = value / 100;
    localStorage.setItem('kiwiVolume', value);
}
```

Volume is persisted to `localStorage` and restored on reconnect.

---

## 9. S-Meter Decoding

### 9.1 Raw Value Format

The KiwiSDR sends S-meter as a **big-endian signed int16** in the SND frame header.
The value is signal power in **dBm × 10**.

```
Raw value -730 → -73.0 dBm
Raw value -950 → -95.0 dBm
```

### 9.2 Conversion to S-Units

Standard amateur radio S-unit scale: S9 = -73 dBm, each S-unit = 6 dB.

```javascript
function updateSmeterDisplay() {
    const dbm = kiwiSmeter / 10;     // raw / 10 = dBm

    let sUnit;
    if (dbm >= -73) {
        // S9 or above
        const over = Math.round(dbm + 73);
        sUnit = over > 0 ? `S9+${over}` : 'S9';
    } else {
        // S0–S9
        sUnit = `S${Math.max(0, Math.round((dbm + 127) / 6))}`;
    }

    // Bar width: 0-100% for dBm range -127 to 0
    const pct = Math.min(100, Math.max(0, (dbm + 127) / 1.27));
    document.getElementById('kiwiSmeterBar').style.width = pct + '%';
    document.getElementById('kiwiSmeterValue').textContent = sUnit;
}
```

S-meter updates every **200ms** via `setInterval`.

---

## 10. Frequency Change Flow — End-to-End

This is the complete call chain when a user types a new frequency and presses Enter
(or clicks a spy station preset while already connected):

```
1. User edits frequency input / clicks preset
       │
       ▼
2. tuneFromBar() / tuneToSpyStation()
   reads freq from DOM, calls tuneKiwi(freqKhz, mode)
       │
       ▼
3. tuneKiwi() [websdr.js:810]
   kiwiWebSocket.send(JSON.stringify({
       cmd: 'tune', freq_khz: 14200, mode: 'usb'
   }))
       │  WebSocket frame to Flask
       ▼
4. Flask: kiwi_audio_stream() main loop [websdr.py:480]
   ws.receive(timeout=0.005) → msg = '{"cmd":"tune",...}'
   _handle_kiwi_command(ws, 'tune', data)
       │
       ▼
5. _handle_kiwi_command() / 'tune' branch [websdr.py:437]
   _kiwi_client.tune(14200, 'usb')
       │
       ▼
6. KiwiSDRClient.tune() [kiwisdr.py:167]
   _send_tune(14200, 'usb')
       │
       ▼
7. _send_tune() [kiwisdr.py:200]
   low_cut, high_cut = MODE_FILTERS['usb']  →  (300, 3000)
   ws.send('SET mod=usb low_cut=300 high_cut=3000 freq=14200')
       │  WebSocket text frame to KiwiSDR
       ▼
8. KiwiSDR hardware retunes its DSP to 14.200 MHz USB
   Audio stream continues without interruption
       │  binary SND frames at 12 kHz continue flowing
       ▼
9. Flask: _handle_kiwi_command() sends confirmation
   ws.send(json.dumps({
       'type': 'tuned', 'freq_khz': 14200, 'mode': 'usb'
   }))
       │  WebSocket JSON text frame to browser
       ▼
10. Browser: handleKiwiStatus({type:'tuned', freq_khz:14200, mode:'usb'})
    Updates kiwiCurrentFreq, kiwiCurrentMode
    Updates DOM: frequency display, bar frequency input, mode selector
```

**Total round-trip latency:** typically 50–150ms depending on network to KiwiSDR.

---

## 11. Full Connection Lifecycle

```
[User clicks "Listen" on a receiver]
              │
              ▼
selectReceiver(index)
  - reads freq from #websdrFrequency input
  - reads mode from #websdrMode_select
  - calls connectToReceiver(rx.url, freqKhz, mode)

[connectToReceiver()]
  - if existing kiwiWebSocket → disconnectFromReceiver()
  - new WebSocket(ws://host/ws/kiwi-audio)
  - binaryType = 'arraybuffer'

[WebSocket onopen]
  - send {cmd:'connect', url, freq_khz, mode}
  - updateKiwiUI('connecting')

[Flask proxy receives 'connect']
  - parse_host_port(url) → host, port
  - validate mode + host (injection check)
  - _disconnect_kiwi() — tear down any prior KiwiSDR connection
  - create KiwiSDRClient(host, port, on_audio, on_error, on_disconnect)
  - KiwiSDRClient.connect(freq_khz, mode)
    → SET auth t=kiwi p=
    → SET compression=0
    → SET agc=1 ...
    → SET mod=... freq=...
    → SET AR OK in=12000 out=44100
    → spawn kiwi-rx thread + kiwi-ka thread
  - send {type:'connected', host, port, freq_khz, mode, sample_rate:12000}

[Browser receives 'connected']
  - kiwiConnected = true
  - initKiwiAudioContext(12000)
    → new AudioContext({sampleRate:12000})
    → createScriptProcessor(2048, 0, 1)
    → createGain()
    → connect nodes → destination
    → setInterval(updateSmeterDisplay, 200)
  - updateKiwiUI('connected')

[Audio flowing...]
  KiwiSDR → binary SND frames → kiwi-rx thread → _kiwi_audio_queue
  Flask main loop → browser WebSocket → handleKiwiAudio() → kiwiAudioBuffer
  ScriptProcessorNode.onaudioprocess → speakers

[User clicks "Disconnect" / closes tab]
  - send {cmd:'disconnect'}
  - kiwiWebSocket.close()
  - cleanupKiwiAudio()
    → clearInterval(kiwiSmeterInterval)
    → scriptProcessor.disconnect()
    → gainNode.disconnect()
    → audioContext.close()
    → kiwiAudioBuffer = []
  - Flask: _disconnect_kiwi() → KiwiSDRClient.disconnect()
    → _stopping = True → _connected = False
    → ws.close()
    → join kiwi-rx + kiwi-ka threads (3s timeout)
```

---

## 12. Thread Model & Concurrency

```
Flask process
├── Main thread (gunicorn worker or Flask dev)
│   └── Serves HTTP requests + WebSocket handler (kiwi_audio_stream)
│       └── Tight loop: ws.receive() + queue.get_nowait()
│
├── Thread: kiwi-rx (daemon)
│   └── Blocks on ws.recv(timeout=2s)
│   └── Calls on_audio() → _kiwi_audio_queue.put_nowait()
│
└── Thread: kiwi-ka (daemon)
    └── Sleeps 5s → ws.send('SET keepalive')
```

**Locks used:**
- `_kiwi_lock` (threading.Lock) — guards `_kiwi_client` reference during connect/disconnect
- `_send_lock` (threading.Lock) — inside `KiwiSDRClient`, guards `ws.send()` calls

**Queue as decoupler:**
The `_kiwi_audio_queue` decouples the `kiwi-rx` thread (producer) from the
`kiwi_audio_stream` WebSocket handler (consumer). This means a slow browser
connection does not stall the KiwiSDR receive loop.

---

## 13. Why There Is No Waterfall (and How to Add One)

### 13.1 Why It's Missing Here

This implementation only connects to the KiwiSDR `/SND` endpoint, which delivers
**audio only**. The waterfall (spectrum display) requires connecting to a **separate**
KiwiSDR WebSocket endpoint: `/WF`.

The `/WF` endpoint delivers **FFT magnitude data** — a compressed row of spectrum
values representing one horizontal line of the waterfall at a time.

### 13.2 How to Add a Waterfall

#### Step 1 — Open a Second WebSocket to `/WF`

```
ws://<host>:<port>/<timestamp_ms>/WF
```

Use a **different timestamp** from the `/SND` connection so KiwiSDR treats them
as separate sessions.

#### Step 2 — Send WF Initialisation Commands

```
SET auth t=kiwi p=<password>
SET zoom=0 start=0
SET maxdb=-10 mindb=-110
SET wf_speed=4
SET wf_comp=0
```

| Command | Parameters | Notes |
|---------|-----------|-------|
| `SET zoom` | `zoom=0..14, start=<bin>` | Zoom level (0=full band), start bin offset |
| `SET maxdb` | dBm | Top of waterfall colour scale |
| `SET mindb` | dBm | Bottom of waterfall colour scale |
| `SET wf_speed` | 1–8 | Waterfall update rate (rows/second) |
| `SET wf_comp` | 0 or 1 | Compression (0=raw bytes, 1=compressed) |

#### Step 3 — Parse WF Binary Frames

```
Offset  Size  Description
0       3     "W/F" magic
3       1     Flags
4       4     Sequence number (uint32 BE)
8       N     FFT magnitude bytes (one per pixel column)
              Value: uint8, maps to colour scale (mindb..maxdb)
```

Each frame is one row of the waterfall. The number of bytes = the width in pixels
of the displayed waterfall (typically 1024).

#### Step 4 — Render with Canvas

```javascript
const canvas = document.getElementById('waterfall');
const ctx = canvas.getContext('2d');

// Colour map (blue → cyan → green → yellow → red)
function magnitudeToColor(val) {
    // val: 0-255 from WF frame
    // map to hue, return CSS color
}

function handleWFFrame(arrayBuffer) {
    if (arrayBuffer.byteLength < 8) return;
    const header = new Uint8Array(arrayBuffer, 0, 3);
    if (String.fromCharCode(...header) !== 'W/F') return;

    const pixels = new Uint8Array(arrayBuffer, 8);

    // Scroll canvas up by 1 row
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.putImageData(imageData, 0, -1);

    // Draw new row at bottom
    const row = ctx.createImageData(canvas.width, 1);
    for (let x = 0; x < pixels.length; x++) {
        const [r, g, b] = magnitudeToColor(pixels[x]);
        row.data[x * 4 + 0] = r;
        row.data[x * 4 + 1] = g;
        row.data[x * 4 + 2] = b;
        row.data[x * 4 + 3] = 255;
    }
    ctx.putImageData(row, 0, canvas.height - 1);
}
```

#### Step 5 — Frequency-Click to Tune

Map a canvas `click` X-coordinate to a frequency:

```javascript
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const freqRange = bandwidthKhz;           // e.g. 30000 kHz at zoom=0
    const freqKhz = startFreqKhz + (x / canvas.width) * freqRange;
    tuneKiwi(freqKhz, currentMode);
});
```

### 13.3 Common Waterfall Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Black/empty waterfall | WF WebSocket not receiving frames | Check auth command was sent, verify `/WF` URL endpoint |
| No frequency mapping | zoom/start not set correctly | `SET zoom=0 start=0` gives full 0–30 MHz view |
| Colours wrong | mindb/maxdb mismatch | Adjust `SET maxdb=-10 mindb=-110` to match your signal environment |
| Canvas stutters | Scrolling entire canvas every frame is expensive | Use two alternating canvas rows or a ring-buffer with `drawImage` offset trick |
| Click-to-tune off by half | Centre freq vs start freq confusion | KiwiSDR `freq` is the **centre** of the filter; `start` in WF is the left edge |

---

## 14. Security Considerations

### Input Validation (Server Side)

```python
# Host injection guard (routes/websdr.py:381)
if not host or ';' in host or '&' in host or '|' in host:
    ws.send(json.dumps({'type': 'error', 'message': 'Invalid host'}))
    return
```

This prevents shell injection if the host were ever passed to a subprocess. Since
`websocket-client` connects directly (no shell involved), this is a defence-in-depth
measure.

### SSRF Considerations

The proxy will connect to any host:port the browser specifies. In a production
deployment, consider:
- Whitelisting KiwiSDR hostnames or requiring connections go through a known receiver list
- Blocking connections to RFC 1918 private addresses (SSRF protection)
- Rate-limiting the `connect` command per session

### Mixed Content

The `proto` selection in the browser client:
```javascript
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
```
Ensures the browser-to-proxy WebSocket matches the page protocol.
The proxy-to-KiwiSDR connection is always plain `ws://` (KiwiSDR does not support TLS natively).

---

## 15. Dependency Stack

| Layer | Library | Purpose |
|-------|---------|---------|
| Python | `websocket-client` (`websocket`) | WebSocket client for KiwiSDR native protocol |
| Python | `flask-sock` (`flask_sock`) | WebSocket server endpoint on Flask |
| Python | `struct` (stdlib) | Pack/unpack binary SND frame fields |
| Python | `threading` (stdlib) | Receive + keepalive daemon threads |
| Python | `queue` (stdlib) | Thread-safe audio buffer between threads |
| Python | `urllib.request` (stdlib) | Fetch receiver directory JS file |
| JS | `WebSocket` (browser API) | Browser↔Flask WebSocket |
| JS | `Web Audio API` | `AudioContext`, `ScriptProcessorNode`, `GainNode` |
| JS | `DataView` / `Int16Array` (browser API) | Binary frame parsing |
| JS | `Globe.gl` (CDN) | 3D globe receiver map (optional) |
| JS | `Leaflet.js` (CDN) | 2D map fallback |

---

## 16. Quick Reference — All API Commands

### KiwiSDR Protocol Commands (sent Python → KiwiSDR)

| Command | When Sent |
|---------|-----------|
| `SET auth t=kiwi p=<password>` | First, immediately after WebSocket open |
| `SET compression=0` | After auth, before tune |
| `SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=50` | After compression |
| `SET mod=<mode> low_cut=<hz> high_cut=<hz> freq=<khz>` | After AGC, and on every retune |
| `SET AR OK in=12000 out=44100` | Last, starts audio stream |
| `SET keepalive` | Every 5 seconds, forever |

### Browser → Flask WebSocket Commands (JSON)

| `cmd` | Additional Fields | When |
|-------|------------------|------|
| `connect` | `url`, `freq_khz`, `mode`, `password` | User selects a receiver |
| `tune` | `freq_khz`, `mode` | User changes frequency while connected |
| `disconnect` | _(none)_ | User clicks Disconnect |

### Flask → Browser WebSocket Messages (JSON)

| `type` | Additional Fields | When |
|--------|------------------|------|
| `connected` | `host`, `port`, `freq_khz`, `mode`, `sample_rate` | KiwiSDR connection established |
| `tuned` | `freq_khz`, `mode` | Retune command acknowledged |
| `error` | `message` | Any error (bad host, connection failure, etc.) |
| `disconnected` | _(none)_ | KiwiSDR disconnected (intentional or dropped) |

### Flask → Browser Binary Audio Frame Layout

```
Bytes 0-1:   S-meter (big-endian signed int16, value = dBm × 10)
Bytes 2+:    PCM audio (16-bit signed little-endian, 12000 Hz, mono)
```

---

*Document generated from INTERCEPT codebase — `utils/kiwisdr.py`, `routes/websdr.py`,
`static/js/modes/websdr.js`, `templates/partials/modes/websdr.html`*

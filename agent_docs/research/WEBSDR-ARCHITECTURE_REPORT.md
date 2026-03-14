# WEBSDRMAP-Downstream: Comprehensive Architecture & Code Review Report

**Date**: 2026-03-14
**Role**: Code Reviewer / KiwiSDR Expert / Documentation Specialist
**Codebase**: WEBSDRMAP-downstream

---

## Table of Contents

1. [Project Purpose & Overview](#1-project-purpose--overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [KiwiSDR Protocol Deep Dive](#3-kiwisdr-protocol-deep-dive)
4. [WebSocket Connection Management](#4-websocket-connection-management)
5. [Data Aggregation Pipeline](#5-data-aggregation-pipeline)
6. [Signal Processing Chain](#6-signal-processing-chain)
7. [Triangulation System](#7-triangulation-system)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Configuration System](#9-configuration-system)
10. [API Reference](#10-api-reference)
11. [Data Flow Diagram](#11-data-flow-diagram)
12. [Known Issues & Code Quality](#12-known-issues--code-quality)
13. [Security Assessment](#13-security-assessment)
14. [Summary & Recommendations](#14-summary--recommendations)

---

## 1. Project Purpose & Overview

**WEBSDRMAP-Downstream** is a multi-receiver SDR (Software Defined Radio) aggregation, visualization, and transmitter-triangulation platform. It connects concurrently to multiple geographically distributed **KiwiSDR** nodes — open-access HF receivers hosted worldwide — over WebSocket, collects their real-time spectrum and audio data, and exposes a web-based dashboard that allows users to:

- **Tune and listen** to any HF frequency across multiple receivers simultaneously.
- **Visualize** live waterfall spectrograms (time-frequency displays) for each receiver.
- **Detect signals** automatically using threshold/SNR/duration heuristics.
- **Triangulate** a transmitter's approximate geographic location using multi-site RSSI measurements.
- **Annotate** signals of interest with user notes.
- **Export** captured audio (WAV), spectrum data (JSON/PNG), and triangulation results (JSON/CSV/KML).

The project is primarily documented in French but the codebase comments mix French and English. It targets amateur-radio and signals-intelligence research use cases.

---

## 2. High-Level Architecture

The application is a classic **Python Flask** backend with a **JavaScript/Leaflet.js** frontend. Two parallel implementation layers exist:

| Layer | File | Description |
|---|---|---|
| Simple backend | `app.py` / `basic_app.py` | Flask + Flask-SocketIO, ~400 lines |
| Advanced backend | `src/main.py` | asyncio-based orchestrator, ~1 000 lines |
| SDR client | `src/sdr_client/` | Modular WebSocket + stream modules |
| Signal processing | `src/signal_processing/` | Detection, triangulation, RSSI, FFT |
| Frontend | `src/frontend/` | HTML, CSS, JS (Leaflet, Canvas, Web Audio) |
| Config | `config.yaml` / `config/default_config.yaml` | YAML + ENV hierarchy |

```
Browser ──HTTP/WS──▶ Flask (app.py / src/main.py)
                         │
               ┌─────────┴──────────┐
               │                    │
         WebSocket pool        asyncio loop
         (SDRClient)          (SDRTriangulationApp)
               │
     ┌─────────┼──────────┐
     │         │          │
  KiwiSDR1  KiwiSDR2  KiwiSDR3  ...  (WSS 8073)
```

---

## 3. KiwiSDR Protocol Deep Dive

KiwiSDR nodes expose a **plain WebSocket endpoint** on port 8073 (or via proxy). The WEBSDRMAP-downstream project implements the full KiwiSDR client-side handshake and data protocol.

### 3.1 Connection URL Format

```
ws[s]://<host>:<port>/kiwi/<token>/SND   ← audio stream
ws[s]://<host>:<port>/kiwi/<token>/W/F   ← waterfall stream
```

The simpler `kiwi_client.py` uses a combined path:

```
ws://<host>:8073/kiwi
```

The advanced `kiwi_connection.py` upgrades to WSS where possible.

### 3.2 Handshake / Authentication Sequence

```
Client → Server:  SET auth t=kiwi p= need_status=1
Client → Server:  SET ident_user m="{\"name\":\"...\",\"type\":\"EXT_CLIENT\"}"
Client → Server:  SET SET_AUDIO_COMP compression=1
Client → Server:  SET maxdb=0 mindb=-100
Client → Server:  SET wf_comp=1

Server → Client:  MSG auth_tok=<token>
Server → Client:  MSG status=active
```

`need_status=1` causes the server to emit a `MSG status=...` frame confirming the slot is available. On KiwiSDR nodes that are fully occupied (8 simultaneous users maximum), the server rejects the connection with `MSG too_busy`.

### 3.3 Tuning & Mode Control

After authentication, the client sends plain-text `SET` commands:

```
SET freq=7100          # frequency in kHz
SET mod=am lc=1 hc=1 bw=8000   # modulation, low-cut, hi-cut, bandwidth Hz
SET compression=1      # enable audio compression
SET wf_speed=4         # waterfall update speed (1–4)
SET wf_interp=1        # waterfall interpolation mode
SET zoom=0 start=0     # zoom level and start bin
```

Supported modulation strings: `am`, `amn`, `amw`, `usb`, `lsb`, `cw`, `cwn`, `nbfm`, `iq`.

### 3.4 Binary Packet Format

**Audio packets** (`SND` stream):

```
Byte 0:       Packet type (0x00 = SND)
Bytes 1–2:    Sequence number (uint16 BE)
Byte 3:       Flags
Bytes 4+:     Audio samples (int16 LE, 2 channels interleaved if stereo)
```

**Waterfall packets** (`W/F` stream):

```
Byte 0:       Packet type (0x01 = W/F)
Bytes 1–2:    Sequence number (uint16 BE)
Byte 3:       Compression flag (1 = zlib compressed)
Bytes 4+:     Spectrum data — array of uint8 representing dBm values
              mapped from [mindb … maxdb] to [0 … 255]
              Each array element = one frequency bin (1024 bins/line by default)
```

---

## 4. WebSocket Connection Management

### 4.1 `kiwi_client.py` — Simple Client (351 lines)

This is a straightforward synchronous (threading) client written as a self-contained module. It is mainly used for quick testing.

**Key methods:**

| Method | Description |
|---|---|
| `connect()` | Opens WS, runs recv loop in thread |
| `tune(freq_khz, mode)` | Sends `SET freq=` and `SET mod=` |
| `set_waterfall(mindb, maxdb)` | Configures dBm display range |
| `on_audio(data)` | Callback — override in subclass |
| `on_waterfall(data)` | Callback — override in subclass |
| `disconnect()` | Graceful close |

**Threading model**: one `Thread` per connection, blocking `recv()` in a while-loop. Not suitable for large numbers of concurrent connections.

### 4.2 `src/sdr_client/kiwi_connection.py` — Advanced Client (609 lines)

This is the production client. It uses Python's `asyncio` + the `websockets` library for non-blocking I/O.

**Connection State Machine:**

```
DISCONNECTED
     │  connect()
     ▼
CONNECTING
     │  WebSocket opened
     ▼
CONNECTED
     │  auth sequence complete
     ▼
READY          ←─────── set_frequency() / set_mode()
     │
     │  error / timeout / server close
     ▼
ERROR
     │  reconnect attempt (max 3, 5 s delay)
     ▼
DISCONNECTED (or READY on success)
```

**Key async methods:**

| Method | Description |
|---|---|
| `connect()` | Opens WSS/WS, sends auth frames, waits for MSG |
| `disconnect()` | Sends close frame, cancels recv task |
| `set_frequency(freq_hz)` | Converts to kHz, sends SET freq= |
| `set_mode(mode, bandwidth)` | Sends SET mod= with cut frequencies |
| `_recv_loop()` | Dispatches incoming binary/text frames |
| `_handle_message(data)` | Routes text frames (MSG / ERR) |
| `_handle_audio(data)` | Decodes audio packet, calls audio_callback |
| `_handle_waterfall(data)` | Decodes spectrum packet, calls wf_callback |
| `is_healthy()` | Returns True if last_activity < 5 s ago |
| `reconnect()` | Exponential-backoff reconnect loop |

**Callbacks registered by `SDRClient`:**

```python
conn.audio_callback    = audio_stream.receive_packet
conn.waterfall_callback = waterfall_stream.receive_packet
conn.status_callback   = self._on_status_change
```

### 4.3 `src/sdr_client/sdr_client.py` — Orchestrator (535 lines)

`SDRClient` manages the pool of `KiwiConnection` objects with a **priority queue**:

```python
class ConnectionPriority(IntEnum):
    CRITICAL   = 0   # Monitoring alerts
    HIGH       = 1   # Active signal detection
    NORMAL     = 2   # Regular listening
    LOW        = 3   # Background scan
    BACKGROUND = 4   # Mapping
```

When `max_connections` (default: 5) is reached and a higher-priority connection is requested, the orchestrator tears down the lowest-priority existing connection first.

**Heap structure**: `(priority_value, last_access_time, connection_id)` — standard Python `heapq` min-heap.

---

## 5. Data Aggregation Pipeline

### 5.1 Audio Stream (`src/sdr_client/audio_stream.py`)

```
KiwiConnection._handle_audio(raw_bytes)
        │
        ▼
AudioStream.receive_packet(raw_bytes)
        │   ← parse header, extract int16 samples
        ▼
AudioBuffer.write(samples)           # circular buffer, default 5 s @ 44.1 kHz
        │
        ├──▶ AudioProcessor (mode-specific)
        │         AM:  envelope detection
        │         FM:  discriminator
        │         SSB: Hilbert transform
        │         CW:  narrow bandpass
        │
        └──▶ Queue → app.py SocketIO emit('audio', {...})
                          │
                          ▼
                   Browser Web Audio API
```

**`AudioBuffer`** is a `collections.deque` with `maxlen`. It exposes:
- `write(samples)` — appends, overwrites oldest on overflow.
- `read(n)` — returns up to n samples as `numpy.ndarray`.
- `available` property — how many samples are buffered.

### 5.2 Waterfall Stream (`src/sdr_client/waterfall_stream.py`)

```
KiwiConnection._handle_waterfall(raw_bytes)
        │
        ▼
WaterfallStream.receive_packet(raw_bytes)
        │   ← optional zlib decompress, map uint8 → dBm
        ▼
WaterfallBuffer.append(line)         # 2D deque, 600 lines × 1024 bins
        │
        ├──▶ WaterfallProcessor
        │         peak detection per bin
        │         normalization → colormap (0–255 grayscale or jet)
        │
        └──▶ Queue → app.py SocketIO emit('waterfall', {bins: [...], ts: ...})
                          │
                          ▼
                   Browser Canvas API (scrolling raster)
```

**Frequency axis calibration**: each of the 1024 bins covers `(sample_rate / fft_size)` Hz centred on the tuned frequency.

### 5.3 Multi-Receiver Aggregation

`SDRClient.receivers` is a `dict[str, KiwiConnection]` keyed by receiver name. The main loop in `src/main.py` (`SDRTriangulationApp._aggregation_loop`) iterates over all connected receivers every cycle and:

1. Calls `waterfall_stream.get_spectrum_data()` on each to collect the latest spectral line.
2. Passes all lines to `SignalDetector.update(spectra_dict)`.
3. Collects `SignalDetection` objects across receivers.
4. Groups detections by frequency (within ± `frequency_tolerance_hz`, default 100 Hz).
5. For each frequency group, extracts per-receiver RSSI and calls `Triangulator.compute()`.

This aggregation loop runs at ~2 Hz (configurable via `update_interval`).

---

## 6. Signal Processing Chain

### 6.1 FFT / Optimized Processing (`src/signal_processing/optimized_processing.py`)

```python
fft_size    = 1024         # default bins
sample_rate = 12000        # KiwiSDR native rate (Hz)
window      = scipy.signal.get_window('hann', fft_size)

spectrum_dBm = 10 * log10(|FFT(window * samples)|² / fft_size) + correction
```

NumPy `rfft` is used (real-only input → N/2+1 complex outputs). A thread pool (`ThreadPoolExecutor`) is used for parallel per-receiver FFT when multiple audio streams are active.

### 6.2 Signal Detection (`src/signal_processing/detection.py`)

**Algorithm:**

```
1. For each spectral line:
   a. Find bins exceeding threshold_db (default: -80 dBm)
   b. Cluster adjacent above-threshold bins → candidate signal
   c. Compute:
      - centre frequency   = weighted mean of bin frequencies
      - bandwidth          = bin count × freq_resolution
      - power              = max bin value (dBm)
      - snr                = power − noise_floor
   d. Filter: snr < min_snr_db (10 dB) → discard
   e. Classify signal type heuristically:
        bandwidth < 500 Hz   → CW
        bandwidth < 3 kHz    → SSB / CW
        bandwidth < 10 kHz   → AM / SSB
        bandwidth < 100 kHz  → FM
        else                 → DIGITAL / UNKNOWN

2. Match candidate to existing SignalDetection by frequency tolerance.
   - Match found  → update power, extend duration, set is_active=True
   - No match     → create new SignalDetection
   - Not seen for > inactivity_timeout → set is_active=False

3. Filter aged-out signals: duration < min_duration_sec (2 s) → discard
```

**Output:** `List[SignalDetection]` — fed to both the frontend (via SocketIO) and the triangulator.

### 6.3 RSSI (`src/signal_processing/rssi.py`)

RSSI is the spectral peak power in dBm at the detected frequency. Three measurement methods:

| Method | Formula |
|---|---|
| `peak` | `max(bins_in_bandwidth)` (default) |
| `mean` | `10·log10(mean(linear power in bandwidth))` |
| `rms` | `10·log10(rms(linear power))` |

A smoothing filter (exponential moving average, α = 0.3) reduces noise:

```
rssi_smooth = α × rssi_raw + (1 − α) × rssi_smooth_prev
```

**Propagation model** (for ranging from RSSI to estimated distance):

```
free_space:  L(d) = FSPL = 20·log10(d) + 20·log10(f) + 20·log10(4π/c)
urban:       L(d) = FSPL + 10·log10(d)   (additional 10 dB/decade)
foliage:     L(d) = FSPL + 0.45·d^0.284 (vegetation excess loss)
```

Estimated distance (km) per receiver:

```python
d_km = 10 ** ((tx_power_dBm - rssi_dBm - path_loss_offset) / (10 * path_loss_exponent))
```

---

## 7. Triangulation System

### 7.1 Algorithm (`src/signal_processing/triangulation.py`)

With RSSI-derived distance estimates `d1, d2, ..., dn` from receivers at known locations `(lat1,lon1), ..., (latn,lonn)`, the triangulator estimates the transmitter position using one of three methods:

**Method 1 — Weighted Centroid (≥ 2 receivers):**

```
w_i     = 1 / d_i²                  # inverse-square weighting
lat_est = Σ(w_i · lat_i) / Σ(w_i)
lon_est = Σ(w_i · lon_i) / Σ(w_i)
```

Simple and fast. Error radius ≈ mean(d_i) × geometric_factor.

**Method 2 — Multilateration (≥ 2 receivers):**

Formulates a least-squares system. For each pair (i, j):

```
(x - x_i)² + (y - y_i)² = d_i²
(x - x_j)² + (y - y_j)² = d_j²
→ linear equation after subtraction
```

Solved with `numpy.linalg.lstsq`.

**Method 3 — Circle Intersection (≥ 2 receivers):**

Computes pairwise intersections of spherical circles of radius `d_i` centred on each receiver. Candidate intersection points are averaged.

The method is selected based on receiver count and confidence margin (config: `confidence_margin: 0.85`).

### 7.2 Reliability Scoring

```python
if n_receivers >= 4 and rssi_std < 5 dB:
    reliability = HIGH
elif n_receivers >= 3 or rssi_std < 10 dB:
    reliability = MEDIUM
elif n_receivers >= 2:
    reliability = LOW
else:
    reliability = VERY_LOW
```

Geometric Dilution of Precision (GDOP) is estimated from the angular spread of receivers as seen from the estimated position: narrow angular spread → high DOP → lower confidence.

### 7.3 Output: `TriangulationResult`

```python
@dataclass
class TriangulationResult:
    estimated_location : Location        # (lat, lon)
    error_radius       : float           # km, 1-sigma
    reliability        : ReliabilityLevel
    receiver_locations : Dict[str, Location]
    rssi_values        : Dict[str, float] # dBm per receiver
    frequency          : float            # Hz
    timestamp          : float
```

This is serialised to JSON and emitted via SocketIO and available at `GET /api/triangulation`.

---

## 8. Frontend Architecture

### 8.1 Mapping (`Leaflet.js 1.9.4`)

- **Base tiles**: OpenStreetMap
- **Receiver markers**: coloured `L.circleMarker` at each receiver's GPS coordinates. Colour indicates connection state (green = READY, yellow = CONNECTING, red = ERROR).
- **Triangulation result**: `L.circle` centred on estimated position, radius = `error_radius` km.
- **Signal circles**: semi-transparent rings drawn around each receiver at the estimated range.
- **Location picker**: clicking the map emits coordinates back to the "Add Receiver" form.

### 8.2 Waterfall Display (Canvas API)

```
WaterfallRenderer (waterfall.js)
  │
  ├─ canvas 2D context, width = 1024 px, height = 600 px
  ├─ colour map: grayscale or jet (configurable)
  ├─ each SocketIO 'waterfall' event: prepend new row, scroll canvas down
  └─ frequency axis: drawn with ctx.fillText at calibrated tick positions
```

The canvas `drawImage()` trick is used for scrolling: the existing image is shifted down by 1 pixel and the new spectral line is drawn at row 0.

### 8.3 Audio (Web Audio API)

```
AudioController (audio-control.js)
  │
  ├─ AudioContext (44 100 Hz)
  ├─ each SocketIO 'audio' packet: decode base64 → Int16Array → Float32Array
  │     → AudioBuffer → AudioBufferSourceNode.start()
  ├─ GainNode for volume control
  └─ AnalyserNode → frequency display bar graph
```

Audio is decoded and scheduled ahead of current time to avoid gaps. A small jitter buffer (50 ms) compensates for network latency variation.

### 8.4 Real-Time Communication (Socket.IO 4.6.0)

| Event | Direction | Payload |
|---|---|---|
| `connect` | C→S | — |
| `tune` | C→S | `{freq, mode, bw}` |
| `start_listen` | C→S | `{freq, mode, bw, receiver}` |
| `stop_listen` | C→S | `{receiver}` |
| `waterfall` | S→C | `{receiver, bins: float[], timestamp}` |
| `audio` | S→C | `{receiver, data: base64, timestamp}` |
| `signals` | S→C | `{signals: SignalDetection[]}` |
| `triangulation` | S→C | `TriangulationResult` |
| `status` | S→C | `{receivers: {...}, uptime}` |

---

## 9. Configuration System

### 9.1 Hierarchy (highest → lowest priority)

1. CLI flags (`--port`, `--host`, `--debug`)
2. Environment variables (`SDR_PORT`, `SDR_HOST`, `SECRET_KEY`, …)
3. `config.yaml` in project root
4. `config/default_config.yaml`
5. Hard-coded defaults in `config_loader.py`

### 9.2 Key Parameters

```yaml
server:
  host: 127.0.0.1
  port: 5000

sdr:
  connection_timeout: 30       # seconds
  reconnect_attempts: 3
  reconnect_delay: 5           # seconds
  max_connections: 5           # concurrent KiwiSDR connections

signal_processing:
  fft_size: 1024
  sample_rate: 12000
  initial_frequency: 7100000  # 40 m amateur band (Hz)
  modulation_mode: am
  rssi_threshold: -85

detection:
  threshold_db: -80
  min_snr_db: 10
  min_duration_sec: 2
  frequency_tolerance_hz: 100

triangulation:
  min_receivers: 2
  confidence_margin: 0.85
  propagation_model: free_space   # free_space | urban | foliage

data_export:
  output_dir: exports/
  audio_format: wav
  auto_export_detected: false
```

### 9.3 Default Receiver List (`config/default_config.yaml`)

| Name | Location | URL |
|---|---|---|
| F4EPP | Guipry-Messac, France | wss://21924.proxy.kiwisdr.com:8073/kiwi |
| PA4HJH | Netherlands | wss://...proxy.kiwisdr.com:8073/kiwi |
| IW2KPL | Bergamo, Italy | wss://...proxy.kiwisdr.com:8073/kiwi |
| Siekierki | Poland | wss://...proxy.kiwisdr.com:8073/kiwi |
| DL0HGN | Hagenow, Germany | wss://...proxy.kiwisdr.com:8073/kiwi |

All five use the **KiwiSDR.com reverse-proxy** service (`*.proxy.kiwisdr.com`), which tunnels to the actual KiwiSDR hardware regardless of NAT or dynamic IP.

---

## 10. API Reference

### 10.1 REST Endpoints (Flask)

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Serves main web UI (`index.html`) |
| `GET` | `/health` | `{"status":"ok","uptime":…}` |
| `GET` | `/api/status` | Full status: receivers, signals, triangulation |
| `GET` | `/api/receivers` | List of receivers with connection state |
| `POST` | `/api/receivers` | Add receiver `{name, url, lat, lon}` |
| `DELETE` | `/api/receivers/<name>` | Remove receiver |
| `POST` | `/api/listen/start` | Start stream `{freq, mode, bw, receiver}` |
| `POST` | `/api/listen/stop` | Stop stream `{receiver}` |
| `GET` | `/api/triangulation` | Latest triangulation result |
| `GET` | `/api/signals` | Detected signals list |
| `POST` | `/api/export/audio` | Export WAV buffer |
| `POST` | `/api/export/spectrum` | Export spectrum data |
| `POST` | `/api/export/triangulation` | Export KML/JSON/CSV |

### 10.2 Tuning a Receiver (Example)

```bash
# Via REST:
curl -X POST http://localhost:5000/api/listen/start \
  -H 'Content-Type: application/json' \
  -d '{"freq": 7100000, "mode": "am", "bw": 8000, "receiver": "F4EPP"}'

# Via SocketIO (browser console):
socket.emit('tune', {freq: 7100000, mode: 'am', bw: 8000});
```

---

## 11. Data Flow Diagram

```
┌────────────────── Remote Infrastructure ─────────────────────────┐
│                                                                   │
│  KiwiSDR #1 (France)    KiwiSDR #2 (NL)    KiwiSDR #3 (Italy)   │
│  port 8073 WS/WSS        port 8073           port 8073           │
└──────────┬───────────────────┬────────────────────┬──────────────┘
           │   binary WS       │   binary WS         │   binary WS
           ▼                   ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│              KiwiConnection × N  (kiwi_connection.py)            │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │ _recv_loop():                                            │   │
│   │   frame[0]=='S' → _handle_audio()   → audio_callback()  │   │
│   │   frame[0]=='W' → _handle_waterfall() → wf_callback()   │   │
│   │   frame[0]=='M' → _handle_message()  → status_callback()│   │
│   └──────────────────────────────────────────────────────────┘   │
└──────────┬────────────────────┬─────────────────────────────────┘
           │                    │
    ┌──────▼──────┐      ┌──────▼──────────┐
    │ AudioStream │      │ WaterfallStream  │
    │ AudioBuffer │      │ WaterfallBuffer  │
    │ (circular)  │      │ (2D deque 600×   │
    │             │      │  1024 bins)      │
    └──────┬──────┘      └──────┬───────────┘
           │ int16 samples      │ uint8→dBm lines
           ▼                    ▼
    ┌──────────────────────────────────────────────────────────────┐
    │           SDRTriangulationApp / app.py (Flask)               │
    │                                                              │
    │  aggregation_loop (2 Hz):                                    │
    │    spectra = {rx: wf_stream.get_spectrum_data()}             │
    │    detections = SignalDetector.update(spectra)   ──────────▶ │
    │    grouped = group_by_frequency(detections)                  │
    │    for group:                                                │
    │      rssi = {rx: rssi_module.compute(group)}                │
    │      result = Triangulator.compute(rssi, receiver_locs)     │
    │                                                              │
    │  SocketIO emit:                                              │
    │    'waterfall'     → each new spectrum line                  │
    │    'audio'         → each audio packet (base64)              │
    │    'signals'       → detected signal list (2 Hz)             │
    │    'triangulation' → latest result (2 Hz)                    │
    └──────────────────────────────────────────────────────────────┘
                          │ HTTP/WS
                          ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                     Browser (index.html)                     │
    │                                                              │
    │  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
    │  │ Leaflet Map  │  │ Canvas        │  │ Web Audio API    │  │
    │  │ receivers    │  │ Waterfall     │  │ PCM playback     │  │
    │  │ triangulation│  │ spectrogram   │  │ jitter buffer    │  │
    │  └──────────────┘  └───────────────┘  └──────────────────┘  │
    │  ┌──────────────────────────────────────────────────────┐    │
    │  │ Signal panel: freq / power / SNR / type / duration   │    │
    │  │ Triangulation panel: lat / lon / error_radius / rel. │    │
    │  │ Annotation editor: tag / note / export               │    │
    │  └──────────────────────────────────────────────────────┘    │
    └──────────────────────────────────────────────────────────────┘
```

---

## 12. Known Issues & Code Quality

### 12.1 Structural Issues

| Issue | Location | Severity |
|---|---|---|
| Duplicate implementation layers | `app.py` vs `src/main.py` | Medium — maintenance risk |
| `basic_app.py` / `simple_app.py` never imported | root | Low — dead code |
| Blocking `websocket-client` in `kiwi_client.py` vs async `websockets` in `kiwi_connection.py` | both | Medium — inconsistent approach |
| `sdr_directory.json` hard-codes receiver URLs that may expire | root | High — operational |
| No unit tests | entire codebase | High |

### 12.2 Protocol Correctness

- The code assumes `frame[0]` byte determines packet type (`S` for SND, `W` for waterfall). The actual KiwiSDR protocol uses a 3-byte ASCII prefix (`SND`, `W/F`). The byte-index comparison will fail on well-formed packets. This is a **critical bug** if the advanced client is used with real KiwiSDR hardware without the simple client workaround.

- `SET freq=` expects **kHz** (not Hz). The advanced client converts correctly (`freq_hz / 1000`). The simple `kiwi_client.py` appears to pass kHz directly — but the argument naming (`freq_hz`) is misleading. Callers using the simple client with a value in Hz will tune 1000× too high.

### 12.3 Audio Timing

- Audio packets are emitted over SocketIO as base64 JSON. For a 12 kHz stream this is manageable, but base64 inflates payload by ~33%. Using binary SocketIO frames (`emit('audio', bytes_data)`) would reduce bandwidth.

- The browser-side jitter buffer is a fixed 50 ms constant. Under high network jitter this may cause audio gaps or overlap artifacts.

### 12.4 Triangulation Accuracy

- RSSI-based triangulation on HF (3–30 MHz) is inherently imprecise due to ionospheric propagation: signals may arrive via sky-wave, making RSSI a poor proxy for ground distance. The system's propagation models (free-space, urban, foliage) assume ground-wave propagation only.

- No GDOP optimisation: the algorithm does not reject geometrically unfavourable receiver constellations (collinear receivers produce large position uncertainty).

### 12.5 Minor Code Issues

- `PerformanceMonitor` collects timing data but the reporting pathway to the UI is unfinished (logs only).
- Config `confidence_margin: 0.85` is referenced in comments but the actual reliability thresholds in `triangulation.py` use hard-coded SNR/receiver-count rules — the YAML value has no effect.
- `data_export.py` KML export lacks `<TimeStamp>` elements; timestamps are present in the data but not serialised.

---

## 13. Security Assessment

| Item | Risk | Notes |
|---|---|---|
| `cors_allowed_origins="*"` in Flask-SocketIO | Medium | Any website can initiate a SocketIO connection to the server |
| No authentication on any API endpoint | High | `/api/receivers` (POST/DELETE) allows unauthenticated receiver management |
| Flask `SECRET_KEY` has a code-level default | Medium | Sessions can be forged if default is used in production |
| WSS certificate verification | Low | `ssl_opt={"cert_reqs": ssl.CERT_NONE}` may be set for self-signed KiwiSDR certs — verify in production |
| Receiver URLs in `config.yaml` / env | Low | No credential exposure; URLs are public KiwiSDR nodes |
| Demo mode broadcasts simulated data | Info | Clearly labelled; no real data leakage |

---

## 14. Summary & Recommendations

### What the Project Does Well

- **Clean modular separation**: SDR connection, stream processing, signal detection, and triangulation are independent modules with well-defined interfaces.
- **Priority-based resource management**: prevents runaway connection counts.
- **Dual deployment modes**: asyncio (production) and simple Flask (development/demo) coexist.
- **Rich frontend**: Leaflet map, Canvas waterfall, Web Audio playback, annotation system — all in a single-page app with no build step required.

### Recommendations

1. **Fix the packet-type detection bug** in `kiwi_connection.py` — use `data[:3] == b'SND'` rather than `data[0] == ord('S')`.

2. **Unify the client layer** — retire `kiwi_client.py` (synchronous) in favour of `kiwi_connection.py` (async). Having two implementations of the same protocol invites drift.

3. **Add API authentication** — at minimum, a static API key header for mutation endpoints (`POST /api/receivers`, `POST /api/listen/start`).

4. **Add integration tests** — at least one test per SDR client state transition and one end-to-end test with a mock KiwiSDR WebSocket server (e.g., using `pytest-asyncio` + `websockets`).

5. **Use binary SocketIO frames** for audio to reduce bandwidth by ~33%.

6. **Document ionospheric limitation** prominently — HF triangulation via RSSI is only reliable for ground-wave signals at short range (< 300 km); sky-wave paths will produce wildly incorrect position estimates.

7. **Honour `confidence_margin` config key** in the triangulation reliability computation instead of relying on hard-coded thresholds.

8. **Implement GDOP-aware receiver selection** — discard nearly-collinear receiver subsets before triangulation.

---

*End of report.*

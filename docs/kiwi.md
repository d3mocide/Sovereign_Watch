# Remote SDR (WebSDR / KiwiSDR) — Comprehensive Implementation Report

## Overview

The remote SDR feature provides access to the global **KiwiSDR network** — a public directory of HF/shortwave software-defined radios available worldwide. It supports real-time audio streaming, S-meter visualization, frequency tuning, and spy station presets.

---

## File Map

| Layer | File | Purpose |
|---|---|---|
| Backend | `routes/websdr.py` | Flask blueprint, API endpoints, audio proxy |
| Backend | `utils/kiwisdr.py` | Low-level KiwiSDR WebSocket client |
| Frontend | `static/js/modes/websdr.js` | Browser UI, map, audio streaming |
| Template | `templates/partials/modes/websdr.html` | Sidebar panel HTML |
| Main UI | `templates/index.html:2258-2303` | Map visuals container |
| Tests | `tests/test_websdr.py` | Endpoint + helper tests |
| Tests | `tests/test_kiwisdr.py` | Client unit + integration tests |
| App init | `app.py:951-952` | Registers WebSocket audio handler |

---

## 1. How It Connects to WebSDRs

### Receiver Discovery

The system fetches the **KiwiSDR public directory** — a JavaScript file that lists all known receivers worldwide.

```python
# routes/websdr.py
KIWI_DATA_URLS = [
    "https://rx.skywavelinux.com/kiwisdr_com.js",
    "http://rx.linkfanel.net/kiwisdr_com.js",
]
```

`_fetch_kiwi_receivers()` (`routes/websdr.py:69`) downloads this file, extracts the embedded `var kiwisdr_com = [...]` JavaScript array via regex, fixes trailing commas for valid JSON, then parses each receiver record into Python dicts.

### Audio Connection

Once a receiver is selected, audio flows through two WebSocket hops:

```
Browser
  └─ WebSocket: ws://localhost/ws/kiwi-audio
       └─ Backend (Flask/flask-sock)
            └─ WebSocket: ws://kiwi-host:8073/{timestamp}/SND
                 └─ Remote KiwiSDR hardware
```

The backend (`routes/websdr.py:337-505`) acts as a **transparent proxy** — it connects outward to the KiwiSDR host using `KiwiSDRClient` (`utils/kiwisdr.py`), then forwards binary audio frames inward to the browser.

### KiwiSDR WebSocket Protocol

`KiwiSDRClient.connect()` (`utils/kiwisdr.py:108`) performs this handshake after opening the WebSocket:

```
SET auth t=kiwi p=[password]
SET compression=0
SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=50
SET mod=[mode] low_cut=[Hz] high_cut=[Hz] freq=[kHz]
SET AR OK in=12000 out=44100
```

A keepalive thread sends `SET keepalive` every 5 seconds to prevent timeout.

---

## 2. How It Populates Lists

### Backend Caching

```python
# routes/websdr.py:33-38
_receiver_cache: list = []
_cache_lock = threading.Lock()
_cache_timestamp: float = 0.0
CACHE_TTL = 3600  # 1 hour
```

`get_receivers()` (`routes/websdr.py:191`) either returns the cached list or calls `_fetch_kiwi_receivers()` if the cache is stale. The `?refresh=true` query param forces a bypass.

### Per-Receiver Parsed Fields

From the raw JS directory data, each receiver becomes:

| Field | Source | Notes |
|---|---|---|
| `name` | JS object | Display name |
| `url` | JS object | Access URL |
| `lat` / `lon` | `gps` field | Parsed via `_parse_gps_coord()` |
| `freq_lo` / `freq_hi` | `bands` field (Hz→kHz) | For frequency filtering |
| `available` | `users < users_max` | Boolean availability flag |
| `distance_km` | Haversine calculation | Added by `/nearest` endpoint |

### API Endpoints for List Population

**`GET /websdr/receivers`** (`routes/websdr.py:210`)
- Filter by `freq_khz` (checks if in receiver's band range)
- Filter by `available=true`
- Returns max 100 receivers + total counts

**`GET /websdr/receivers/nearest`** (`routes/websdr.py:237`)
- Requires `lat` + `lon` params
- Sorts all receivers by Haversine distance
- Returns top 10 closest

**`GET /websdr/spy-station/<station_id>/receivers`** (`routes/websdr.py:273`)
- Looks up the spy station's primary frequency
- Filters receivers that cover that frequency
- Returns matching receivers + station metadata

### Frontend List Rendering

`renderReceiverList()` (`static/js/modes/websdr.js:142`) displays the top 50 receivers in a scrollable sidebar list. Each entry shows name (cyan), user count with color-coded availability badge, location, and antenna description. Clicking calls `selectReceiver(index)`.

---

## 3. How It Handles Frequency Changes

### Initial Tune (on connect)

When `selectReceiver(index)` is called (`websdr.js:169`), it reads the frequency from the `#websdrFrequency` input (default: 6500 kHz) and mode from `#websdrMode_select`, then passes them to `connectToReceiver()`:

```javascript
// websdr.js:189 — sends this JSON to the backend WebSocket
{ cmd: 'connect', url: receiverUrl, freq_khz: freqKhz, mode: mode }
```

The backend's `_handle_kiwi_command('connect', ...)` (`routes/websdr.py:365`) extracts those values and passes them to `KiwiSDRClient.connect()`.

### Live Retune (without reconnecting)

`tuneKiwi()` (`websdr.js:376`) sends a lightweight tune command:

```javascript
{ cmd: 'tune', freq_khz: freqKhz, mode: mode }
```

Backend (`routes/websdr.py:437`) routes to `KiwiSDRClient.tune()` (`utils/kiwisdr.py:167`), which sends:

```
SET mod=[mode] low_cut=[Hz] high_cut=[Hz] freq=[kHz]
```

No reconnection is needed. The backend sends back `{ type: 'tuned', freq_khz, mode }` to update the browser display.

### Mode Filters Applied During Tune

```python
# utils/kiwisdr.py
MODE_FILTERS = {
    'am':  (-4500, 4500),   # Symmetric ±4.5 kHz
    'usb': (300, 3000),     # Upper sideband
    'lsb': (-3000, -300),   # Lower sideband
    'cw':  (300, 800),      # CW passband
}
```

### Dual Tune Controls

There are two separate places to enter a frequency:

| Element | Location | Trigger |
|---|---|---|
| `#websdrFrequency` + `#websdrMode_select` | Sidebar panel | `searchReceivers()` or `selectReceiver()` |
| `#kiwiBarFrequency` + `#kiwiBarMode` | Audio control bar (top of map) | `tuneFromBar()` → `tuneKiwi()` |

`tuneFromBar()` (`websdr.js:385`) syncs the sidebar input to match after tuning.

### Spy Station Preset Tuning

`tuneToSpyStation(stationId, freqKhz)` (`websdr.js:530`) has two paths:

- **Already connected:** Calls `tuneKiwi(freqKhz)` directly
- **Not connected:** Fetches `/websdr/spy-station/{id}/receivers`, populates the receiver list, and shows a notification with how many receivers cover that frequency

---

## 4. Waterfall Mappings

The INTERCEPT remote SDR interface does **not implement a visual waterfall display** in the traditional SDR sense. There is no FFT/spectrogram rendering client-side or server-side. Instead, signal strength is represented via an **S-meter** that updates from the audio stream.

### S-Meter as Signal Indicator

The KiwiSDR SND binary frame contains a signal strength value:

```
# utils/kiwisdr.py:238
SND frame binary layout:
  Offset 0-2:  "SND" magic
  Offset 3:    flags
  Offset 4-7:  sequence number (big-endian uint32)
  Offset 8-9:  S-meter raw (big-endian int16, units: 0.1 dBm)
  Offset 10+:  PCM audio (int16 LE)
```

The backend packs this into the audio frame forwarded to the browser:

```python
# routes/websdr.py (on_audio callback)
frame = struct.pack('>h', smeter_raw) + pcm_bytes
_kiwi_audio_queue.put(frame)
```

### Browser S-Meter Decoding and Display

`handleKiwiAudio()` (`websdr.js:259`) extracts the first 2 bytes as a big-endian int16, then `updateSmeterDisplay()` (`websdr.js:410`) converts to human-readable S-units:

```javascript
// websdr.js:410
dbm = kiwiSmeter / 10          // Convert 0.1 dBm units to dBm

// S9 = -73 dBm per IARU standard
if (dbm >= -73) {
    sUnit = dbm > -73 ? `S9+${dbm + 73}` : 'S9'
} else {
    sUnit = `S${Math.round((dbm + 127) / 6)}`   // S0–S8
}

pct = Math.min(100, Math.max(0, (dbm + 127) / 1.27))
```

The bar width and label are updated every 200ms via `kiwiSmeterInterval`. The S-meter appears in both the sidebar panel (`#kiwiSmeterBar`) and the audio control bar (`#kiwiBarSmeterBar`).

### Map as Spatial "Waterfall"

The Leaflet.js map (`websdr.js:102`) provides a geographic view of receiver availability, which serves as a spatial signal coverage indicator:

- **Cyan markers** (`#00d4ff`, opacity 0.8, radius 6): Available receivers
- **Gray markers** (`#666`): At-capacity / unavailable receivers
- Popup on click: name, location, antenna, user count, "Listen" button
- Map fits bounds around all found receivers after each search

---

## Complete Data Flow Diagram

```
User enters freq (e.g., 6500 kHz) + clicks "Find Receivers"
  │
  ▼
searchReceivers() [websdr.js:78]
  │  GET /websdr/receivers?freq_khz=6500&available=true
  ▼
get_receivers() [websdr.py:191]
  │  Cache hit? → return list    Cache miss? ↓
  ▼
_fetch_kiwi_receivers() [websdr.py:69]
  │  HTTP GET kiwisdr_com.js
  │  Regex: var kiwisdr_com = [...]
  │  JSON parse + field extraction
  ▼
Return filtered JSON (max 100 receivers)
  │
  ▼
renderReceiverList() + plotReceiversOnMap() [websdr.js:142, 102]
  │  Sidebar list + cyan/gray map markers
  ▼
User clicks receiver → selectReceiver(index) [websdr.js:169]
  │
  ▼
connectToReceiver(url, freqKhz, mode) [websdr.js:189]
  │  WS open: ws://localhost/ws/kiwi-audio
  │  Send: { cmd:'connect', url, freq_khz, mode }
  ▼
_handle_kiwi_command('connect', ...) [websdr.py:365]
  │
  ▼
KiwiSDRClient.connect(host, port, ...) [kiwisdr.py:108]
  │  ws://host:port/{timestamp}/SND
  │  Handshake: SET auth → SET compression → SET mod → SET AR
  │  Spawn: _receive_loop + _keepalive_loop threads
  ▼
_parse_snd_frame() [kiwisdr.py:238]
  │  Extract smeter_raw (bytes 8-9) + PCM (bytes 10+)
  │  Call on_audio(pcm, smeter)
  ▼
Backend on_audio callback [websdr.py]
  │  Pack: struct.pack('>h', smeter) + pcm
  │  _kiwi_audio_queue.put(frame)
  ▼
WebSocket send loop → browser
  │
  ▼
handleKiwiAudio() [websdr.js:259]
  │  Bytes 0-1: S-meter int16 BE → kiwiSmeter
  │  Bytes 2+:  PCM int16 → float32 → kiwiAudioBuffer
  ▼
Web Audio API ScriptProcessor [websdr.js:283]
  │  Pull float32 chunks → GainNode → speakers
  ▼
updateSmeterDisplay() [websdr.js:410] every 200ms
  │  dBm → S-unit → bar width + label
  ▼
User retunes → tuneKiwi() [websdr.js:376]
  │  Send: { cmd:'tune', freq_khz, mode }
  ▼
KiwiSDRClient.tune() [kiwisdr.py:167]
  │  SET mod=[mode] low_cut=X high_cut=Y freq=Z
  │  (no reconnect needed)
  ▼
Backend: ws.send({ type:'tuned', freq_khz, mode })
  │
  ▼
Frontend: handleKiwiStatus() updates display labels
```

---

## Key Architecture Decisions

| Decision | Rationale |
|---|---|
| Backend WebSocket proxy | Avoids CORS issues; browser can't connect directly to arbitrary KiwiSDR hosts |
| 1-hour receiver cache | Reduces load on public KiwiSDR directory servers |
| S-meter in audio frame | KiwiSDR SND binary protocol embeds signal strength alongside PCM |
| `flask-sock` optional | Graceful degradation if WebSocket library not installed; audio feature disabled |
| Fallback data URLs | Two KiwiSDR directory mirrors for resilience |
| `maxsize=200` audio queue | Bounds memory use; drops oldest frames under backpressure |
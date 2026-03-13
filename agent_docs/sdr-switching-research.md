# KiwiSDR Dynamic Switching — Research Report

**Branch:** `claude/research-sdr-switching-RSIDM`
**Date:** 2026-03-02
**Scope:** Improving KiwiSDR node management in Sovereign Watch by adopting patterns from `d3mocide/intercept-downstream`

---

## 1. Current State — Sovereign Watch

### How KiwiSDR Is Used Today

The JS8Call bridge (`js8call/server.py`) establishes a single KiwiSDR connection at startup:

```
kiwirecorder.py --nc -s HOST -p PORT -f FREQ -m MODE --OV
       ↓ stdout PCM S16LE @ 12 kHz
pacat --playback → KIWI_RX (PulseAudio null-sink)
       ↓
KIWI_RX.monitor → JS8Call audio input
```

Configuration is entirely static — loaded from environment variables at container start:

```bash
KIWI_HOST=kiwisdr.example.com
KIWI_PORT=8073
KIWI_FREQ=14074    # kHz
KIWI_MODE=usb
```

### What the Runtime API Currently Supports

| Capability | Supported? | Notes |
|---|---|---|
| Switch to different node | ✅ | `SET_KIWI` WebSocket action tears down and rebuilds pipeline |
| Stop connection | ✅ | `DISCONNECT_KIWI` WebSocket action |
| Query current node | ✅ | `GET /api/kiwi` REST endpoint |
| Discover available nodes | ❌ | No directory integration |
| Auto-select nearest node | ❌ | Manual host/port entry only |
| Filter by frequency coverage | ❌ | No coverage awareness |
| Retune without disconnect | ❌ | Every frequency change kills/restarts the subprocess |
| Fallback on failure | ❌ | Single point of failure |
| Persist node preferences | ❌ | Config resets on container restart |

### Core Limitation

The `SET_KIWI` handler at `server.py:616-646` stops the kiwirecorder subprocess and spawns a new one. There is no concept of a node registry, no directory lookup, and no geographic intelligence — the operator must manually know the host, port, frequency coverage, and availability of a node before connecting.

---

## 2. Reference Implementation — `intercept-downstream`

### Architecture Overview

`d3mocide/intercept-downstream` treats KiwiSDR as one source in a broader SDR ecosystem. Its relevant modules:

| File | Role |
|---|---|
| `utils/kiwisdr.py` | `KiwiSDRClient` — stateful WebSocket client with retuning |
| `routes/websdr.py` | REST API for node discovery, proximity search, frequency filtering |
| `utils/database.py` | SQLite persistence for settings and node history |
| `utils/sdr/base.py` | Hardware abstraction (RTL-SDR, HackRF, LimeSDR, etc.) |

### Key Patterns Worth Adopting

#### 2.1 Public KiwiSDR Directory Integration

The `routes/websdr.py` module fetches the KiwiSDR public listing (the same JSON feed that powers `kiwisdr.com/public`) and caches it for one hour:

```python
# ~60-line fetch+parse block:
# - GET https://kiwisdr.com/public/?db=1
# - Parse receiver objects (JS notation → proper JSON)
# - Extract: hostname, port, gps (lat/lon), num_ch, users, active, freq ranges
# - Cache with TTL timestamp
```

This turns the directory from an external website into an internal API the app controls.

#### 2.2 Geographic Proximity Selection

```python
# GET /websdr/receivers/nearest
# Input: lat, lon query params (or derived from MY_GRID)
# Processing: Haversine distance for every cached receiver
# Output: sorted list, closest first
```

For Sovereign Watch, `MY_GRID` (Maidenhead locator) is already stored and geocoded in `server.py:199-267`. That geocoded lat/lon can drive proximity-sorted node selection.

#### 2.3 Frequency-Aware Filtering

```python
# GET /websdr/spy-station/<id>/receivers
# Filters the cached node list to receivers whose published
# frequency coverage includes the target frequency
```

Each KiwiSDR node in the public directory declares its frequency range. A node covering 14 MHz should be preferred for JS8Call's 14.074 MHz calling frequency.

#### 2.4 Retune Without Reconnect

`KiwiSDRClient.tune()` sends new SET commands over the existing WebSocket rather than tearing down the connection. This is significant because kiwirecorder rebuilds the WebSocket handshake and AGC state on every restart, introducing ~2-5 seconds of dead audio and disrupting JS8Call's SNR baseline.

#### 2.5 Node Failover

The `KiwiSDRClient` exposes disconnect callbacks. The intercept-downstream pattern uses these to trigger automatic failover to the next-nearest node from the cached directory.

---

## 3. Gap Analysis

| Feature | `intercept-downstream` | Sovereign Watch (current) | Priority |
|---|---|---|---|
| Node directory fetch | ✅ | ❌ | HIGH |
| Proximity sort by MY_GRID | ✅ | ❌ | HIGH |
| Frequency range filtering | ✅ | ❌ | HIGH |
| Retune without subprocess restart | ✅ | ❌ | HIGH |
| Automatic failover | ✅ | ❌ | MEDIUM |
| Frontend node browser UI | Partial | ❌ | MEDIUM |
| Node preference persistence | ✅ (SQLite) | ❌ | LOW |
| Multi-SDR hardware abstraction | ✅ | ❌ | LOW (no local SDR hardware in stack) |

---

## 4. Recommended Implementation Plan

### Phase 1 — Node Discovery Service (Backend)

Add a new module `js8call/kiwi_directory.py`:

1. **Fetch** the public KiwiSDR directory JSON on demand and on a 1-hour background refresh cycle
2. **Parse** each node: hostname, port, gps coordinates, frequency min/max, active user count, channel count
3. **Filter** nodes by:
   - Frequency coverage (must include `KIWI_FREQ ± 500 kHz`)
   - Active user count (prefer nodes with free channels: `users < num_ch`)
   - Reachability (optional lightweight TCP probe before returning)
4. **Sort** by Haversine distance from MY_GRID geocode
5. **Expose** via new REST endpoint: `GET /api/kiwi/nodes`

### Phase 2 — Stateful KiwiSDR Client

Refactor `_start_kiwi_pipeline()` in `server.py`:

1. Replace the `subprocess + kiwirecorder` pattern with a Python-native WebSocket client (ws4py already in `requirements.txt`) implementing the KiwiSDR binary protocol directly
2. Implement a `tune(freq, mode)` method that sends `SET freq` and `SET mod` commands over the live WebSocket — no process restart
3. Implement a `connect(host, port)` method that gracefully closes the old socket before opening a new one
4. Surface connection state changes as `KIWI.STATUS` WebSocket events (already wired to frontend)

### Phase 3 — Failover & Health Monitoring

1. Subscribe to `on_disconnect` callback from the native client
2. On unexpected disconnect: pull next node from the cached proximity-sorted list and attempt reconnect
3. Expose failover events to frontend as a new message type: `KIWI.FAILOVER`
4. Add retry budget (e.g., 3 attempts before surfacing error to user)

### Phase 4 — Frontend Node Browser

Extend `RadioTerminal.tsx`:

1. Add a "Browse Nodes" panel that calls `GET /api/kiwi/nodes`
2. Display: hostname, distance (km), active users / total channels, frequency range, signal (SNR or availability)
3. One-click connect button that dispatches `SET_KIWI` via the existing WebSocket action
4. Show current node info in status bar with connection quality indicator

---

## 5. Files to Create / Modify

### New Files

| File | Purpose |
|---|---|
| `js8call/kiwi_directory.py` | Node directory fetch, parse, filter, sort logic |
| `js8call/kiwi_client.py` | Native Python KiwiSDR WebSocket client (replaces kiwirecorder subprocess) |
| `frontend/src/components/js8call/KiwiNodeBrowser.tsx` | Node discovery UI panel |
| `frontend/src/hooks/useKiwiNodes.ts` | React hook for node list API calls |

### Modified Files

| File | Changes |
|---|---|
| `js8call/server.py` | Swap subprocess pipeline for `kiwi_client.py`; add `/api/kiwi/nodes` endpoint; wire failover callbacks |
| `js8call/requirements.txt` | Add `aiohttp` (async HTTP for directory fetch) |
| `frontend/src/components/js8call/RadioTerminal.tsx` | Integrate `KiwiNodeBrowser` panel |
| `frontend/src/types.ts` | Add `KiwiNode` interface |
| `.env.example` | Document new optional vars (`KIWI_AUTO_SELECT`, `KIWI_MAX_USERS`) |

---

## 6. KiwiSDR Binary Protocol Reference

The native client must implement this minimal handshake (derived from kiwiclient source):

```
1. WebSocket connect → ws://HOST:PORT/{timestamp}/SND
2. Send: "SET auth t=kiwi p="
3. Send: "SET mod={mode} low_cut={lc} high_cut={hc} freq={freq_kHz}"
4. Send: "SET compression=0"
5. Send: "SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=50"
6. Send: "SET AR OK in=12000 out=44100"
7. Receive binary SND frames:
   - Bytes 0-2: magic "SND"
   - Byte 3: flags
   - Bytes 4-7: sequence number (big-endian uint32)
   - Bytes 8-9: RSSI (big-endian int16)
   - Bytes 10+: PCM S16LE @ 12 kHz mono audio payload
8. Keepalive: Send "SET keepalive" every 5 seconds
```

---

## 7. Agent Prompts

The following prompts are ready for use with implementation agents.

---

### AGENT PROMPT A — Kiwi Directory Service

```
## Task: Implement KiwiSDR Node Discovery Service

### Context
You are working on the Sovereign Watch project at /home/user/Sovereign_Watch.
The JS8Call bridge lives in js8call/server.py. Currently it connects to a single
hardcoded KiwiSDR node. We want to add dynamic node discovery.

### What to Build
Create js8call/kiwi_directory.py with the following:

1. A `KiwiDirectory` class with:
   - `async def refresh()` — fetches https://kiwisdr.com/public/?db=1, parses
     receiver JSON, stores results internally with a timestamp
   - `def get_nodes(freq_khz, lat, lon, max_users_pct=0.8)` — returns a list of
     `KiwiNode` dataclasses sorted by Haversine distance from (lat, lon), filtered
     to nodes whose freq range covers freq_khz and whose user count is below
     max_users_pct * total channels
   - Auto-refresh in background every 3600 seconds using asyncio.create_task

2. A `KiwiNode` dataclass:
   - Fields: host (str), port (int), lat (float), lon (float),
     freq_min_khz (float), freq_max_khz (float), users (int), num_ch (int),
     distance_km (float)

3. A standalone `haversine(lat1, lon1, lat2, lon2) -> float` function returning
   distance in km

4. The public directory URL returns a JavaScript-style object literal. You must
   handle minor parsing quirks (unquoted keys, trailing commas). Use a regex-
   based pre-processor or json5 if available, otherwise regex-extract fields.

### Integration
In js8call/server.py:
- Instantiate `KiwiDirectory` at startup (in the lifespan context manager)
- Add endpoint: GET /api/kiwi/nodes
  - Query params: freq (kHz, optional, defaults to KIWI_FREQ), limit (int,
    default 10)
  - Returns JSON array of KiwiNode dicts including distance_km
- The MY_GRID env var is already geocoded in the `maidenhead_to_latlon()` function
  in server.py — reuse it to get lat/lon for proximity sorting

### Constraints
- Use aiohttp for the async HTTP fetch (add to requirements.txt)
- Gracefully handle network errors (log warning, return empty list, retry on
  next call)
- Do not block the event loop; all I/O must be async
- Keep the module under 200 lines

### Tests to Pass
Manually verify:
1. GET /api/kiwi/nodes returns a non-empty JSON array when the container has
   internet access
2. Nodes are sorted closest-first relative to MY_GRID
3. Nodes with freq range that does not include KIWI_FREQ are excluded
```

---

### AGENT PROMPT B — Native KiwiSDR Client (Subprocess Replacement)

```
## Task: Replace kiwirecorder Subprocess with Native Python KiwiSDR Client

### Context
You are working on the Sovereign Watch project at /home/user/Sovereign_Watch.
Currently js8call/server.py spawns kiwirecorder.py as a subprocess and pipes
its PCM output to PulseAudio. Every frequency/host change requires killing and
restarting the subprocess (~3 second gap). We want a native Python client that
can retune without restarting.

### What to Build
Create js8call/kiwi_client.py with a `KiwiClient` class:

```python
class KiwiClient:
    def __init__(self, on_audio: Callable[[bytes], None],
                 on_status: Callable[[dict], None]):
        # on_audio: called with raw S16LE PCM chunks @ 12 kHz mono
        # on_status: called with {"connected": bool, "host": ..., ...}

    async def connect(self, host: str, port: int, freq_khz: float, mode: str)
        # Closes existing connection first if open
        # Performs KiwiSDR WebSocket handshake (see protocol below)
        # Spawns receive loop and keepalive loop as asyncio tasks

    async def tune(self, freq_khz: float, mode: str)
        # Sends SET mod and SET freq over existing live WebSocket
        # Does NOT reconnect — just sends two commands

    async def disconnect(self)
        # Gracefully closes WebSocket and cancels tasks

    @property
    def is_connected(self) -> bool

    @property
    def config(self) -> dict  # host, port, freq, mode
```

### KiwiSDR Binary Protocol
Implement this exact handshake sequence:
1. WebSocket connect to ws://HOST:PORT/{unix_timestamp_ms}/SND
2. Send text: "SET auth t=kiwi p="
3. Send text: f"SET mod={mode} low_cut=-5000 high_cut=5000 freq={freq_khz:.3f}"
4. Send text: "SET compression=0"
5. Send text: "SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=50"
6. Send text: "SET AR OK in=12000 out=44100"
7. Receive loop: binary frames, bytes 10+ are PCM payload → call on_audio(payload)
8. Keepalive loop: send "SET keepalive" text every 5 seconds

Mode string mapping:
- "usb" → mod="usb", low_cut=300, high_cut=2700
- "lsb" → mod="lsb", low_cut=-2700, high_cut=-300
- "am"  → mod="am",  low_cut=-5000, high_cut=5000
- "cw"  → mod="cw",  low_cut=300,   high_cut=800

### Audio Output
The on_audio callback receives raw PCM. The caller (server.py) is responsible
for piping it to PulseAudio via pacat (the entrypoint.sh already sets up
KIWI_RX null-sink). Spawn pacat as a subprocess in server.py's startup, keep
it running, and write PCM chunks to its stdin from the on_audio callback.
This separates audio routing from the KiwiSDR protocol.

### Integration in server.py
- Replace `_start_kiwi_pipeline()` and `_stop_kiwi_pipeline()` with calls to
  `kiwi_client.connect()` and `kiwi_client.disconnect()`
- Replace the SET_KIWI handler's subprocess logic with `kiwi_client.connect()`
  for host changes or `kiwi_client.tune()` for same-host frequency changes
- Wire `on_status` callback to broadcast `KIWI.STATUS` messages to WebSocket
  clients (already done for the old pipeline, preserve the message format)

### Dependencies
- Use `websockets` library (already in requirements.txt)
- No new dependencies needed

### Constraints
- All async — no threading
- Handle WebSocket close codes gracefully (1000=normal, 1001=going away,
  others=error → trigger reconnect logic in server.py)
- Log all protocol messages at DEBUG level
```

---

### AGENT PROMPT C — Frontend Node Browser UI

```
## Task: Add KiwiSDR Node Browser Panel to RadioTerminal

### Context
You are working on the Sovereign Watch project at /home/user/Sovereign_Watch.
The main radio terminal is at:
  frontend/src/components/js8call/RadioTerminal.tsx

A new backend endpoint GET /api/kiwi/nodes now returns an array of available
KiwiSDR nodes sorted by distance. We need a UI to browse and connect to them.

### What to Build

1. Create frontend/src/hooks/useKiwiNodes.ts:
   - Calls GET /api/kiwi/nodes?freq={currentFreq}&limit=20 on mount
   - Returns { nodes: KiwiNode[], loading: boolean, error: string | null, refetch: () => void }
   - Polls every 5 minutes to refresh the list

2. Add KiwiNode to frontend/src/types.ts:
   ```typescript
   export interface KiwiNode {
     host: string;
     port: number;
     lat: number;
     lon: number;
     freq_min_khz: number;
     freq_max_khz: number;
     users: number;
     num_ch: number;
     distance_km: number;
   }
   ```

3. Create frontend/src/components/js8call/KiwiNodeBrowser.tsx:
   - A collapsible panel (default collapsed)
   - Header shows: "SDR Nodes" + current connected host + collapse toggle
   - When expanded, renders a scrollable list (max-height 300px) of KiwiNode rows
   - Each row shows:
     - Hostname (truncated to 30 chars)
     - Distance badge: "Xkm" right-aligned, green <500km / yellow <2000km / red otherwise
     - Load bar: users/num_ch as a narrow progress bar
     - Connect button: dispatches SET_KIWI over the existing WebSocket prop
   - Show spinner while loading, error message if fetch failed
   - Highlight currently connected node (match by host+port)
   - Refetch button (circular arrow icon)

4. Integrate into RadioTerminal.tsx:
   - Import and render <KiwiNodeBrowser> in the KiwiSDR config section
     (search for the existing host:port:freq:mode inline config widget)
   - Pass the sendMessage (WebSocket send) function and currentKiwiConfig as props
   - The SET_KIWI message format is already defined: { action: "SET_KIWI",
     host, port, freq, mode } — use the currently configured freq/mode when
     switching nodes so only the endpoint changes

### Style Constraints
- Match existing Tailwind classes in RadioTerminal.tsx (dark theme, zinc-800/900
  backgrounds, zinc-400 text, emerald accents for active states)
- Keep the component under 150 lines
- No new npm dependencies — use only what is already in package.json
```

---

### AGENT PROMPT D — Failover & Health Monitoring

```
## Task: Add KiwiSDR Automatic Failover to JS8Call Bridge

### Context
You are working on the Sovereign Watch project at /home/user/Sovereign_Watch.
js8call/server.py uses KiwiClient (newly added) to manage the KiwiSDR
connection. We need automatic failover when a node goes offline.

### What to Build
In js8call/server.py, add a `KiwiFailoverManager` class or set of functions:

1. `async def failover(reason: str)`:
   - Logs the reason for failover
   - Calls kiwi_directory.get_nodes() to get a fresh sorted node list
   - Skips the currently-failed node (by host:port)
   - Attempts connect() on the next node in the list
   - Retries up to 3 candidates before giving up
   - Broadcasts `{ "type": "KIWI.FAILOVER", "from": old_host, "to": new_host,
     "reason": reason }` to all WebSocket clients on success
   - Broadcasts `{ "type": "KIWI.ERROR", "message": "No available nodes" }` on
     failure

2. Wire failover into KiwiClient:
   - Pass a `on_disconnect` callback to KiwiClient
   - In KiwiClient's receive loop, on unexpected close (not initiated by our
     disconnect() call), invoke the on_disconnect callback with the close code
   - In server.py's on_disconnect handler, call failover("connection_lost")

3. Health endpoint update:
   - GET /health already exists
   - Add fields: "failover_count" (int), "last_failover_at" (ISO timestamp or null),
     "candidate_nodes_available" (int from directory cache)

### Constraints
- Failover must not block the event loop — use asyncio.create_task
- Add a 10-second cooldown between failover attempts to avoid rapid cycling
- Log all failover events at WARNING level with structured fields
- Keep all changes within server.py and kiwi_client.py — no new files needed
  for this task
```

---

## 8. Dependency Notes

| Package | Already Present | Needed For |
|---|---|---|
| `websockets` | ✅ `requirements.txt` | Native KiwiSDR client (Prompt B) |
| `ws4py` | ✅ `requirements.txt` | (can be removed once Prompt B is done) |
| `numpy` | ✅ `requirements.txt` | PCM processing |
| `aiohttp` | ❌ | Directory fetch (Prompt A) — add to requirements.txt |
| `json5` | ❌ optional | Parsing KiwiSDR directory (Prompt A) — or use regex fallback |

---

## 9. Summary

The `d3mocide/intercept-downstream` codebase demonstrates a mature pattern for
treating KiwiSDR as a discoverable, interchangeable resource rather than a static
configuration value. The three key ideas to port to Sovereign Watch are:

1. **Directory-as-API**: Fetch and cache the public KiwiSDR node list; expose it
   internally so the app controls node selection rather than the operator having
   to know individual hostnames.

2. **Stateful client with retuning**: A native WebSocket client that can change
   frequency without reconnecting eliminates dead-air during band or mode changes.

3. **Proximity + coverage routing**: Sort candidates by Haversine distance from
   MY_GRID and filter by frequency coverage — the two properties most predictive
   of a good connection for JS8Call operations.

Implementing all four agent prompts above will bring Sovereign Watch's KiwiSDR
integration to parity with intercept-downstream and beyond, with the added benefit
of tight integration into the existing JS8Call terminal UI and JS8 station map.

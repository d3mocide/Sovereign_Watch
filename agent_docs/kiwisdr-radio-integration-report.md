# KiwiSDR Radio Integration — Gap Analysis & Implementation Plan

**Branch:** `claude/kiwisdr-radio-integration-vUura`
**Date:** 2026-03-05
**Scope:** Expanding the Radio App Mode with a full-featured KiwiSDR node selection
interface, drawing on the patterns documented in `kiwi.md` and
`sdr-switching-research.md`.

---

## Executive Summary

Sovereign Watch has a working JS8Call radio terminal with basic KiwiSDR support,
but node management is entirely manual — the operator must know a node's hostname,
port, and frequency coverage before connecting. The `kiwi.md` reference describes
a mature pattern (from `d3mocide/intercept-downstream`) with dynamic directory
lookup, proximity-sorted node lists, lossless retuning, and automatic failover.
This report maps every gap between the current state and that target, then
prescribes a phased implementation.

---

## 1. Current Architecture

### 1.1 JS8Call Bridge (`js8call/server.py`)

The bridge is an 803-line FastAPI service that ties together three subsystems:

```
JS8Call (UDP port 2242/2245)
    ↓ JSON datagrams
FastAPI Bridge (port 8080)
    ↓ WebSocket ws://localhost:8080/ws/js8
React Frontend (RadioTerminal.tsx)
```

KiwiSDR audio is injected via a **subprocess pipeline**:

```
kiwirecorder.py --nc -s HOST -p PORT -f FREQ -m MODE --OV
       ↓  stdout: S16LE PCM @ 12 kHz mono
pacat --playback → PulseAudio null-sink "KIWI_RX"
       ↓  monitor source
JS8Call QAudioInput reads "KIWI_RX.monitor"
```

Configuration is loaded from environment variables at container start:

```bash
KIWI_HOST=kiwisdr.example.com
KIWI_PORT=8073
KIWI_FREQ=14074     # kHz
KIWI_MODE=usb
```

### 1.2 Frontend Radio Terminal (`RadioTerminal.tsx`)

The radio terminal is a 718-line React/TypeScript component with:

- **Message log** — RX.DIRECTED / TX.SENT with SNR colour-coding
- **Heard stations sidebar** — sorted by recency, showing distance/bearing
- **Inline KiwiSDR config** — a single row of `host : port : freq` text inputs
  with a Connect / Disconnect button
- **Transmit panel** — target callsign + message body (160-char limit)
- **Auto-reconnect WebSocket** — exponential backoff (2 s → 30 s)

### 1.3 WebSocket Protocol (existing)

| Direction | Message | Purpose |
|-----------|---------|---------|
| Client → Server | `SET_KIWI { host, port, freq, mode }` | Connect to a node |
| Client → Server | `DISCONNECT_KIWI` | Drop the connection |
| Client → Server | `SET_FREQ { freq }` | Change JS8Call dial frequency |
| Server → Client | `KIWI.STATUS { connected, host, port, freq, mode }` | State broadcast |
| Server → Client | `KIWI.ERROR { message }` | Connection failure notice |

---

## 2. Target Architecture (from `kiwi.md`)

The `intercept-downstream` reference implementation treats KiwiSDR as a
**discoverable, interchangeable resource** rather than a static config value.
Its key components:

| Component | Role |
|-----------|------|
| `utils/kiwisdr.py` — `KiwiSDRClient` | Stateful WebSocket client; retunes without reconnecting |
| `routes/websdr.py` | Fetches/caches public KiwiSDR directory; REST API for node discovery, proximity search, frequency filtering |
| Database | Persists selected-node history |
| Frontend `websdr.js` | Scrollable node list with map; S-meter display; one-click connect |

### 2.1 Node Discovery Flow (target)

```
Operator opens "Browse Nodes" panel
    ↓
GET /api/kiwi/nodes?freq=14074&limit=20
    ↓
kiwi_directory.py fetches https://kiwisdr.com/public/?db=1  (cached 1 h)
    ↓
Filter: freq range covers 14074 kHz  AND  users < num_ch
    ↓
Sort: Haversine distance from MY_GRID geocode
    ↓
React renders scrollable list with distance badge + channel load bar
    ↓
Operator clicks "Connect" → SET_KIWI dispatched via existing WebSocket
```

### 2.2 Retuning Flow (target — no dead audio)

```
Operator changes frequency in FreqInput
    ↓ same host, different freq
KiwiClient.tune(freq_khz, mode)
    ↓ sends over live WebSocket (no reconnect)
"SET mod=usb low_cut=300 high_cut=2700 freq=14.074"
    ↓
JS8Call continues hearing audio without interruption
```

### 2.3 KiwiSDR Binary Protocol

```
1. WS connect → ws://HOST:PORT/{unix_ms}/SND
2. → "SET auth t=kiwi p="
3. → "SET mod={mode} low_cut={lc} high_cut={hc} freq={freq_kHz:.3f}"
4. → "SET compression=0"
5. → "SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=50"
6. → "SET AR OK in=12000 out=44100"
7. ← binary SND frames:
       [0-2]  "SND" magic
       [3]    flags
       [4-7]  sequence (uint32 BE)
       [8-9]  RSSI (int16 BE, units: 0.1 dBm)
       [10+]  PCM S16LE @ 12 kHz mono
8. → "SET keepalive"  (every 5 s)
```

---

## 3. Gap Analysis

### 3.1 Backend Gaps

| Feature | Current | Target | Priority |
|---------|---------|--------|----------|
| Public KiwiSDR directory fetch | ❌ None | Fetch + cache `kiwisdr.com/public/?db=1` hourly | **HIGH** |
| Proximity sort | ❌ None | Haversine from MY_GRID geocode | **HIGH** |
| Frequency-range filtering | ❌ None | Filter to nodes covering JS8Call's dial freq | **HIGH** |
| User-count / availability filter | ❌ None | Exclude nodes at capacity | **HIGH** |
| `GET /api/kiwi/nodes` endpoint | ❌ None | Return sorted, filtered node list | **HIGH** |
| Native KiwiSDR WebSocket client | ❌ Subprocess only | `KiwiClient` class with `tune()` | **HIGH** |
| Lossless retuning | ❌ Kill + restart (~3-5 s gap) | `tune()` sends SET commands over live WS | **HIGH** |
| Automatic failover | ❌ None | Try next-nearest node on disconnect | **MEDIUM** |
| Failover cooldown | ❌ None | 10 s minimum between attempts | **MEDIUM** |
| `KIWI.FAILOVER` event | ❌ None | Broadcast on auto-switch | **MEDIUM** |
| Failover stats in `/health` | ❌ None | `failover_count`, `last_failover_at` | **MEDIUM** |
| Node preference persistence | ❌ Reset on restart | SQLite or file-based history | **LOW** |
| `KIWI_AUTO_SELECT` env var | ❌ None | Auto-connect nearest node on startup | **LOW** |

### 3.2 Frontend Gaps

| Feature | Current | Target | Priority |
|---------|---------|--------|----------|
| Node browser panel | ❌ Manual host:port input only | Scrollable list with distance + load | **HIGH** |
| `useKiwiNodes` hook | ❌ None | Polls `GET /api/kiwi/nodes` every 5 min | **HIGH** |
| `KiwiNode` TypeScript type | ❌ None | Typed interface in `types.ts` | **HIGH** |
| Distance badge (colour-coded) | ❌ None | Green < 500 km / Yellow < 2000 km / Red | **HIGH** |
| Channel load bar | ❌ None | `users / num_ch` progress bar | **HIGH** |
| One-click connect | ❌ Copy-paste host:port manually | "Connect" button dispatches `SET_KIWI` | **HIGH** |
| Current node highlight | ❌ None | Active node row highlighted in list | **MEDIUM** |
| Refresh button | ❌ None | Re-fetches directory on demand | **MEDIUM** |
| `KIWI.FAILOVER` toast | ❌ None | Banner "Switched to `node.example.com`" | **MEDIUM** |
| S-meter display | ❌ None | Live dBm → S-unit bar from SND frames | **LOW** |
| Waterfall / geographic map | ❌ None | Leaflet map with cyan node markers | **LOW** |
| Spy-station preset tuning | ❌ None | Pre-defined shortwave station frequencies | **LOW** |

### 3.3 Protocol / Integration Gaps

| Feature | Current | Target | Priority |
|---------|---------|--------|----------|
| `SET_KIWI` triggers subprocess | Kills + respawns `kiwirecorder.py` | Calls `KiwiClient.connect()` | **HIGH** |
| Same-host freq change path | Always tears down subprocess | Detects same host → calls `tune()` | **HIGH** |
| `on_audio` callback chain | PCM written to pacat via pipe | PCM written to persistent pacat process | **HIGH** |
| `on_disconnect` callback | None | Triggers failover manager | **MEDIUM** |
| Mode → filter mapping | Hardcoded in kiwirecorder args | Implemented in `KiwiClient.tune()` | **HIGH** |

---

## 4. Implementation Plan

### Phase 1 — Node Discovery Service (Backend)

**Files:** `js8call/kiwi_directory.py` *(new)*, `js8call/server.py` *(modified)*,
`js8call/requirements.txt` *(add `aiohttp`)*

#### 4.1.1 `KiwiDirectory` class

```python
@dataclass
class KiwiNode:
    host: str
    port: int
    lat: float
    lon: float
    freq_min_khz: float
    freq_max_khz: float
    users: int
    num_ch: int
    distance_km: float = 0.0

class KiwiDirectory:
    DIRECTORY_URLS = [
        "https://kiwisdr.com/public/?db=1",
        "https://rx.skywavelinux.com/kiwisdr_com.js",   # fallback mirror
    ]
    CACHE_TTL = 3600  # seconds

    async def refresh(self) -> None: ...
        # aiohttp GET → regex-extract JS array → parse fields
        # Store with timestamp

    def get_nodes(
        self,
        freq_khz: float,
        lat: float,
        lon: float,
        max_users_pct: float = 0.8,
        limit: int = 20,
    ) -> list[KiwiNode]: ...
        # Filter by freq range coverage
        # Filter by user count < max_users_pct * num_ch
        # Haversine sort ascending
        # Return first `limit` results

    async def _auto_refresh_loop(self) -> None: ...
        # asyncio.create_task — refresh every CACHE_TTL seconds
```

Key implementation note: The public directory returns a JavaScript-style object
literal. Pre-process with regex to quote unquoted keys and strip trailing commas
before passing to `json.loads()`.

#### 4.1.2 New REST endpoint in `server.py`

```
GET /api/kiwi/nodes
  Query params:
    freq  (float kHz, optional — defaults to KIWI_FREQ)
    limit (int, default 10)
  Response:
    [
      {
        "host": "kiwi.example.com",
        "port": 8073,
        "lat": 51.5,
        "lon": -0.1,
        "freq_min_khz": 0,
        "freq_max_khz": 30000,
        "users": 2,
        "num_ch": 8,
        "distance_km": 847.3
      },
      ...
    ]
```

The `maidenhead_to_latlon()` function already exists in `server.py` — reuse it
to convert `MY_GRID` to the lat/lon for proximity sorting.

#### 4.1.3 Lifespan wiring

```python
# server.py — lifespan context manager (already used for startup tasks)
async with asynccontextmanager(app):
    kiwi_directory = KiwiDirectory()
    await kiwi_directory.refresh()                      # initial populate
    asyncio.create_task(kiwi_directory._auto_refresh_loop())
    yield
```

---

### Phase 2 — Native KiwiSDR Client (Subprocess Replacement)

**Files:** `js8call/kiwi_client.py` *(new)*, `js8call/server.py` *(modified)*

#### 4.2.1 `KiwiClient` class

```python
class KiwiClient:
    MODE_FILTERS = {
        "usb": (300, 2700),
        "lsb": (-2700, -300),
        "am":  (-5000, 5000),
        "cw":  (300, 800),
    }

    def __init__(
        self,
        on_audio:      Callable[[bytes], None],
        on_status:     Callable[[dict], None],
        on_disconnect: Callable[[int], None],
    ): ...

    async def connect(self, host: str, port: int,
                      freq_khz: float, mode: str) -> None:
        # 1. Close existing connection if open
        # 2. WS connect → ws://host:port/{unix_ms}/SND
        # 3. Perform handshake sequence (SET auth → SET mod → SET AR)
        # 4. asyncio.create_task(_receive_loop)
        # 5. asyncio.create_task(_keepalive_loop)
        # 6. Call on_status({"connected": True, "host": host, ...})

    async def tune(self, freq_khz: float, mode: str) -> None:
        # Send SET mod and SET freq over live WS — no reconnect
        lc, hc = self.MODE_FILTERS[mode]
        await self._ws.send(
            f"SET mod={mode} low_cut={lc} high_cut={hc} freq={freq_khz:.3f}"
        )

    async def disconnect(self) -> None:
        # Set _disconnecting flag (suppress on_disconnect callback)
        # Cancel tasks, close WS

    @property
    def is_connected(self) -> bool: ...

    @property
    def config(self) -> dict: ...  # host, port, freq, mode
```

**`_receive_loop`:** Reads binary frames → extracts RSSI (bytes 8-9) and PCM
(bytes 10+) → calls `on_audio(pcm_bytes)`. On unexpected close, calls
`on_disconnect(close_code)`.

**`_keepalive_loop`:** Sends `"SET keepalive"` every 5 seconds.

#### 4.2.2 Audio output via persistent pacat

Instead of spawning pacat as part of the pipeline subprocess, keep it running
continuously. The `on_audio` callback writes PCM chunks to pacat's stdin:

```python
# server.py — startup
pacat_proc = subprocess.Popen(
    ["pacat", "--playback", "--raw",
     "--format=s16le", "--rate=12000", "--channels=1",
     "--sink=KIWI_RX"],
    stdin=subprocess.PIPE,
)

def handle_audio(pcm: bytes) -> None:
    if pacat_proc.stdin:
        pacat_proc.stdin.write(pcm)
```

This separates KiwiSDR protocol handling (Python async) from audio routing
(persistent subprocess), so retuning produces no dead air.

#### 4.2.3 `SET_KIWI` handler update in `server.py`

```python
# Before: always kills subprocess, spawns new one
# After:
if (msg.host == kiwi_client.config.get("host")
        and msg.port == kiwi_client.config.get("port")):
    # Same node — lossless retune
    await kiwi_client.tune(msg.freq, msg.mode)
else:
    # Different node — reconnect
    await kiwi_client.connect(msg.host, msg.port, msg.freq, msg.mode)
```

---

### Phase 3 — Failover & Health Monitoring

**Files:** `js8call/server.py` *(modified)*, `js8call/kiwi_client.py` *(modified)*

#### 4.3.1 `KiwiFailoverManager`

```python
class KiwiFailoverManager:
    COOLDOWN = 10       # seconds between failover attempts
    MAX_CANDIDATES = 3  # nodes to try before giving up

    async def failover(self, reason: str) -> None:
        if time.time() - self._last_attempt < self.COOLDOWN:
            return  # rate limit
        self._last_attempt = time.time()

        nodes = kiwi_directory.get_nodes(
            freq_khz=kiwi_client.config["freq"],
            lat=own_lat, lon=own_lon,
        )
        # Skip current (failed) node
        candidates = [n for n in nodes
                      if n.host != kiwi_client.config["host"]][:self.MAX_CANDIDATES]

        for node in candidates:
            try:
                await kiwi_client.connect(node.host, node.port,
                                          kiwi_client.config["freq"],
                                          kiwi_client.config["mode"])
                await broadcast({"type": "KIWI.FAILOVER",
                                 "from": old_host,
                                 "to": node.host,
                                 "reason": reason})
                self._failover_count += 1
                return
            except Exception:
                continue

        await broadcast({"type": "KIWI.ERROR",
                         "message": "No available KiwiSDR nodes"})
```

#### 4.3.2 Health endpoint additions

```json
GET /health response (additions):
{
  "failover_count": 2,
  "last_failover_at": "2026-03-05T14:22:00Z",
  "candidate_nodes_available": 18
}
```

---

### Phase 4 — Frontend Node Browser UI

**Files:**
- `frontend/src/types.ts` *(add `KiwiNode` interface)*
- `frontend/src/hooks/useKiwiNodes.ts` *(new)*
- `frontend/src/components/js8call/KiwiNodeBrowser.tsx` *(new)*
- `frontend/src/components/js8call/RadioTerminal.tsx` *(integrate browser)*

#### 4.4.1 `KiwiNode` type (`types.ts`)

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

#### 4.4.2 `useKiwiNodes` hook

```typescript
// frontend/src/hooks/useKiwiNodes.ts
export function useKiwiNodes(freqKhz: number) {
  const [nodes, setNodes] = useState<KiwiNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `http://localhost:8080/api/kiwi/nodes?freq=${freqKhz}&limit=20`
      );
      setNodes(await res.json());
      setError(null);
    } catch (e) {
      setError("Failed to fetch nodes");
    } finally {
      setLoading(false);
    }
  }, [freqKhz]);

  useEffect(() => {
    fetchNodes();
    const id = setInterval(fetchNodes, 5 * 60 * 1000);  // 5-min poll
    return () => clearInterval(id);
  }, [fetchNodes]);

  return { nodes, loading, error, refetch: fetchNodes };
}
```

#### 4.4.3 `KiwiNodeBrowser` component (layout sketch)

```
┌─ SDR Nodes ─────────────────────── [↻] [∨] ─┐
│ Connected: sdr.example.com                   │
├──────────────────────────────────────────────┤
│ ▶ kiwi.node1.net          [  23 km ●] [▬▬░░] [Connect] │
│   kiwi.node2.org          [ 847 km ●] [▬▬▬░] [Connect] │
│   distant.sdr.io          [3200 km ●] [▬░░░] [Connect] │
│   ...                                        │
└──────────────────────────────────────────────┘
```

- Distance badge colours: emerald < 500 km, yellow < 2000 km, red ≥ 2000 km
- Load bar: `users / num_ch` as a 4-pip progress bar (Tailwind `w-full`)
- Active row: `bg-zinc-700 border-l-2 border-emerald-500`
- All classes match existing `RadioTerminal.tsx` dark-theme conventions

#### 4.4.4 Integration point in `RadioTerminal.tsx`

```tsx
{/* Replace the existing inline host:port:freq config row with: */}
<KiwiNodeBrowser
  currentFreqKhz={kiwiFreq}
  currentConfig={activeKiwiConfig}
  onConnect={(node) =>
    sendRaw({
      action: "SET_KIWI",
      host: node.host,
      port: node.port,
      freq: kiwiFreq,
      mode: kiwiMode,
    })
  }
/>
```

The existing manual-entry inputs can be preserved as a collapsed "Advanced"
sub-section inside `KiwiNodeBrowser` for operators who need to connect to
private/unlisted nodes.

---

### Phase 5 — S-Meter Display (Enhancement)

**Files:** `frontend/src/components/js8call/RadioTerminal.tsx` *(or new
`KiwiSmeter.tsx`)*

The KiwiSDR SND frame already contains RSSI at bytes 8-9. Currently the
frontend ignores this data (audio is routed through PulseAudio, not the browser).
This phase is only applicable if audio is later proxied directly to the browser.

Conversion formula (from `kiwi.md`):

```javascript
const dbm = kiwiSmeterRaw / 10;
// IARU: S9 = -73 dBm
const sUnit = dbm >= -73
  ? `S9+${Math.round(dbm + 73)}`
  : `S${Math.round((dbm + 127) / 6)}`;
const pct = Math.min(100, Math.max(0, (dbm + 127) / 1.27));
```

---

## 5. File Inventory

### New Files

| File | Purpose | Phase |
|------|---------|-------|
| `js8call/kiwi_directory.py` | Directory fetch, parse, filter, proximity sort | 1 |
| `js8call/kiwi_client.py` | Native KiwiSDR WebSocket client with `tune()` | 2 |
| `frontend/src/hooks/useKiwiNodes.ts` | React hook for node list API | 4 |
| `frontend/src/components/js8call/KiwiNodeBrowser.tsx` | Node browser panel | 4 |

### Modified Files

| File | Changes | Phase |
|------|---------|-------|
| `js8call/server.py` | Add `GET /api/kiwi/nodes`; wire `KiwiClient`; add failover | 1, 2, 3 |
| `js8call/requirements.txt` | Add `aiohttp` | 1 |
| `frontend/src/types.ts` | Add `KiwiNode` interface | 4 |
| `frontend/src/components/js8call/RadioTerminal.tsx` | Integrate `KiwiNodeBrowser` | 4 |
| `.env.example` | Document `KIWI_AUTO_SELECT`, `KIWI_MAX_USERS` | 1 |

---

## 6. Dependency Audit

| Package | Status | Needed For |
|---------|--------|-----------|
| `websockets` | ✅ In `requirements.txt` | Native KiwiSDR client (Phase 2) |
| `aiohttp` | ❌ Missing | Directory fetch (Phase 1) — add to `requirements.txt` |
| `ws4py` | ✅ In `requirements.txt` | Can be removed after Phase 2 |
| `numpy` | ✅ In `requirements.txt` | PCM processing |
| `json5` | Optional | KiwiSDR directory parsing; regex fallback is sufficient |

Frontend: no new npm packages required — only React built-ins and existing
Tailwind CSS classes.

---

## 7. Testing Checklist

### Phase 1
- [ ] `GET /api/kiwi/nodes` returns a non-empty array when the container has
      internet access
- [ ] Nodes are sorted closest-first relative to `MY_GRID`
- [ ] Nodes whose frequency range does not include the current `KIWI_FREQ` are
      excluded
- [ ] Response is served from cache on subsequent calls within 1 hour

### Phase 2
- [ ] `SET_KIWI` to a new host produces audio within 2 seconds
- [ ] `SET_KIWI` to the same host with a different freq retunes without
      audio dropout (verify with `parecord` monitoring the KIWI_RX sink)
- [ ] `DISCONNECT_KIWI` stops audio and updates `KIWI.STATUS` to connected=false

### Phase 3
- [ ] Simulate node drop (e.g., `iptables -I OUTPUT -d $NODE_IP -j DROP`)
- [ ] Bridge automatically switches to the next nearest node within 15 seconds
- [ ] `KIWI.FAILOVER` event appears in browser console
- [ ] Failover does not trigger more than once per 10 seconds

### Phase 4
- [ ] `KiwiNodeBrowser` renders a list when `/api/kiwi/nodes` returns data
- [ ] Currently connected node row is highlighted
- [ ] Clicking "Connect" on a different node dispatches `SET_KIWI`
- [ ] Distance badges show correct colours
- [ ] Spinner appears while loading; error state shows when endpoint unreachable

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| KiwiSDR public directory URL changes or goes offline | Phase 1 returns empty list | Two mirror URLs with fallback; graceful empty-list return |
| Native WS client behaves differently from kiwirecorder | Audio quality regression | Keep kiwirecorder as a runtime fallback via env var `KIWI_USE_SUBPROCESS=1` |
| Retune command race condition (tune while reconnecting) | Protocol error / disconnect | Guard `tune()` with connection state check; queue tune if connecting |
| Failover loop (all candidates fail) | Rapid reconnect storm | MAX_CANDIDATES=3 + 10 s cooldown + exponential backoff |
| pacat process death while KiwiClient is running | Silent audio loss | Health check monitors pacat PID; restart on death |
| Frontend polls at wrong bridge URL | Nodes endpoint unreachable | Use same base URL constant already used for `/ws/js8` |

---

## 9. Priority Summary

| Phase | Work Items | Effort | Impact |
|-------|-----------|--------|--------|
| 1 — Node Discovery | `kiwi_directory.py` + REST endpoint | ~200 LoC Python | Unlocks browsable node list |
| 2 — Native Client | `kiwi_client.py` + server.py refactor | ~250 LoC Python | Eliminates dead air on retune |
| 4 — Frontend Browser | Hook + component + RadioTerminal integration | ~250 LoC TypeScript | Operator UX — most visible change |
| 3 — Failover | `KiwiFailoverManager` in `server.py` | ~100 LoC Python | Resilience — lower urgency |
| 5 — S-Meter | Frontend display only | ~50 LoC TypeScript | Enhancement — only if browser audio path added |

**Recommended sequencing:** 1 → 2 → 4 → 3 → 5

Phase 2 (native client) must come before Phase 3 (failover), but Phase 4
(frontend) can be developed in parallel with Phase 2 once the `GET /api/kiwi/nodes`
endpoint from Phase 1 is available.

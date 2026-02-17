# TASK: Tier 1 & Tier 2 Feature Implementation

**Priority**: P0–P2
**Scope**: Backend-03 (Historian), FE-08 (Search), FE-10 (Payload Inspector), FE-11 (Replay System)
**Baseline**: v0.4.0 ("Hybrid Reality" — Mapbox 3D + CARTO, CoT alignment fix, batch TAK worker)

---

## Context

Sovereign Watch is a self-hosted Multi-INT fusion platform (Aviation ADS-B + Maritime AIS). Data flows:

```
Pollers (Python async) → Redpanda Kafka (adsb_raw, ais_raw topics)
    → Backend API (FastAPI) → WebSocket /api/tracks/live (TAK Protobuf binary)
    → TAK Web Worker (decode batches of 10, flush every 50ms)
    → TacticalMap (React + Deck.gl, 60fps animation loop)
```

The platform has **no persistence layer** between Kafka and the frontend. Tracks exist only in-memory on the client. The `tracks` hypertable in TimescaleDB exists (schema in `backend/db/init.sql`) but nothing writes to it. This blocks replay, search-by-history, and analytics.

### v0.4.0 Changes to Be Aware Of

1. **TAK Worker now batches**: Messages arrive as `entity_batch` (array of decoded objects, up to 10, flushed every 50ms) instead of individual `entity_update`. Both message types are handled in TacticalMap via `processEntityUpdate()` (line 506).
2. **Types extracted to `types.ts`**: `IntelEvent`, `MissionLocation`, `MissionProps` are now proper interfaces — no more `unknown` casts.
3. **Controlled view state**: TacticalMap now uses `viewState` state + `onMove` for camera control (not uncontrolled `initialViewState`). New `enable3d` state, pitch/bearing camera controls.
4. **`PollingAreaVisualization` component deleted**: AOT boundaries are now native Mapbox GL sources/layers managed imperatively in a `useEffect` (lines 1156-1238).
5. **Rhumb line bearing**: Course is now computed from trail geometry (`getBearing` at line 119), not from reported heading.
6. **Visual state includes altitude**: `visualStateRef` stores `{ lon, lat, alt }` (was `{ lon, lat }`).
7. **`mapLoaded` gate**: Overlay `setProps` is guarded by `mapLoaded` state (line 1052).
8. **New dependencies**: `mapbox-gl@^3.18.1`, `@types/mapbox-gl@^3.4.1` added to package.json.
9. **`SidebarLeft.missionProps`** is now typed as `MissionProps | null` (not `unknown`).
10. **`onCenterMap`** on SidebarRight is now `() => void` (params removed — stub only).

---

## Feature 1: Backend-03 — Historian (P0)

### What
A standalone async background task (inside the existing `backend/api` service) that consumes from Kafka topics `adsb_raw` and `ais_raw` and writes decoded track points to the TimescaleDB `tracks` hypertable.

### Schema Target
```sql
-- Already exists in backend/db/init.sql
CREATE TABLE IF NOT EXISTS tracks (
    time        TIMESTAMPTZ NOT NULL,
    entity_id   TEXT NOT NULL,
    type        TEXT,
    lat         DOUBLE PRECISION,
    lon         DOUBLE PRECISION,
    alt         DOUBLE PRECISION,
    speed       DOUBLE PRECISION,
    heading     DOUBLE PRECISION,
    meta        JSONB,
    geom        GEOMETRY(POINT, 4326)
);
-- Hypertable with 1-day chunks, 24h retention, compression after 24h
-- Indices: ix_tracks_geom (GIST), ix_tracks_entity_time (entity_id, time DESC)
```

### Implementation Plan

**File**: `backend/api/main.py` (add historian as a background task on startup)

1. Create an `AIOKafkaConsumer` subscribing to `adsb_raw` and `ais_raw` topics with a **dedicated** `group_id` (e.g., `historian-writer`) so it gets its own copy of all messages independent of the WebSocket broadcast consumers.
2. Use `auto_offset_reset="latest"` — we only persist forward, not historical backfill.
3. For each message:
   - The Kafka message is a TAK Protobuf binary (magic bytes `0xbf 0x01 0xbf` + payload). The existing WebSocket endpoint broadcasts these raw bytes to frontend clients. For the Historian, decode the Protobuf server-side using the existing `tak_pb2.TakMessage` import (line 18 of main.py).
   - Extract from decoded `CotEvent`: `uid` → `entity_id`, `type`, `lat`, `lon`, `hae` → `alt`, `detail.track.speed` → `speed`, `detail.track.course` → `heading`, `time` → `time`.
   - Pack remaining fields (`callsign` from `detail.contact.callsign`, `how`, etc.) into `meta` JSONB.
   - Compute `geom` using `ST_SetSRID(ST_MakePoint(lon, lat), 4326)`.
4. **Batch inserts** using `asyncpg`'s `executemany` for efficiency. Buffer up to ~100 rows or 2 seconds, whichever comes first, then flush.
5. Register the historian as an `asyncio.create_task()` inside the FastAPI `startup` event (`@app.on_event("startup")`). Cancel it on `shutdown`.

### Key Constraints
- Do NOT create a separate container/service. Run inside `backend-api`.
- Use the existing `asyncpg` pool (`pool` global) for writes.
- The `group_id` must differ from WebSocket consumers (which use `api-client-{uuid}`) to avoid stealing messages.
- Handle reconnection gracefully (Kafka and DB).
- Log write throughput periodically (e.g., every 60s: "Historian: wrote N rows in last 60s").

### New API Endpoints (add to main.py)

```python
# GET /api/tracks/history/{entity_id}
# Returns the last N track points for a given entity from TimescaleDB.
# Query params: ?limit=100&hours=1
# Response: [{ time, lat, lon, alt, speed, heading, meta }]

# GET /api/tracks/search
# Search by callsign or entity_id substring.
# Query params: ?q=UAL123&limit=20
# Response: [{ entity_id, callsign, type, last_seen, lat, lon }]
# Uses: SELECT DISTINCT ON (entity_id) ... WHERE meta->>'callsign' ILIKE '%query%' OR entity_id ILIKE '%query%'
# ORDER BY time DESC to get most recent position per entity.
```

---

## Feature 2: FE-08 — Search Widget (P1)

### What
A search input in the left sidebar that lets operators find entities by callsign or UID. Shows results from both live in-memory entities and persisted history (via the API).

### Implementation Plan

**New file**: `frontend/src/components/widgets/SearchWidget.tsx`

1. Render a text input with the tactical theme (dark background, cyan border, mono font).
2. On input change (debounced 300ms):
   - **Local search**: Filter the live entities Map where `callsign` or `uid` includes the query (case-insensitive). These are live tracks.
   - **API search** (if Historian is available): `GET /api/tracks/search?q={query}&limit=10`. These are historical tracks that may no longer be live.
3. Display results in a dropdown list below the input:
   - Live results: green dot indicator + callsign + type icon (aircraft/vessel).
   - Historical results: gray dot + callsign + "last seen X min ago".
4. On result click:
   - If entity is live: call `onEntitySelect(entity)` and fly the map to its position.
   - If entity is historical: fly the map to last known position.
5. Keyboard: `Escape` clears search, `Enter` selects first result.

**Integration**:
- Add `<SearchWidget>` to `SidebarLeft.tsx` at the top, above `LayerFilters`.
- `SidebarLeft` is already typed with `SidebarLeftProps` interface (line 10 of SidebarLeft.tsx). Add new props to this interface.

**Props needed from parent (thread through App.tsx)**:
- `entities: Map<string, CoTEntity>` — TacticalMap exposes `entitiesRef`. Pass a callback or ref from App.
- `onEntitySelect: (entity: CoTEntity) => void` — already exists in App.tsx as `setSelectedEntity`.
- `onFlyTo: (lat: number, lon: number) => void` — new callback. Implement in TacticalMap by calling `mapRef.current.flyTo()` and expose via a new prop or callback.

### Styling
Match existing tactical theme: `bg-black/40`, `border-hud-green/30`, `text-cyan-400`, `font-mono`, `backdrop-blur`. Use `lucide-react` icons (`Search`, `X`, `Plane`, `Ship`).

---

## Feature 3: FE-10 — Payload Inspector (P2)

### What
A toggleable "Terminal Mode" panel that shows raw decoded payloads for the currently selected entity. Useful for debugging and operator trust-building.

### Implementation Plan

**New file**: `frontend/src/components/widgets/PayloadInspector.tsx`

1. Only visible when an entity is selected AND the inspector toggle is active.
2. Displays:
   - Raw CoTEntity object as formatted JSON (syntax-highlighted with CSS, not a library).
   - Last 5 raw TAK messages for this entity (store in a per-entity ring buffer).
   - Timestamp delta between updates (shows polling cadence).
3. Style as a "terminal" panel: monospace font, dark background (`bg-black/90`), green text (`text-green-400`), subtle border.
4. Add a toggle button (terminal icon from `lucide-react`) to the `TopBar` or `SidebarRight`.

**Data flow — IMPORTANT v0.4.0 change**: The TAK Worker now sends `entity_batch` messages (array of decoded protobuf objects, batched up to 10 items, flushed every 50ms). See `tak.worker.ts` lines 7-19 for the batching logic.

To capture raw payloads:
- In `tak.worker.ts`, extend the batch items to include a `_raw` field containing the decoded protobuf object (the `object` variable at line 65) alongside the existing `cotEvent` data. This is already the full decoded object, so just ensure it's preserved.
- In `TacticalMap.tsx` `processEntityUpdate()` (line 506), when processing each entity, stash the raw payload into a `Map<string, RawPayload[]>` ref (ring buffer, max 5 per UID).
- Pass this ref's data for the selected entity down to `PayloadInspector` via `SidebarRight`.

---

## Feature 4: FE-11 — Replay System (P2)

### What
A time-slider that lets operators scrub through historical track data from TimescaleDB. Requires Backend-03 (Historian) to be functional.

### Implementation Plan

**New file**: `frontend/src/components/widgets/ReplayControls.tsx`

1. **UI**: A horizontal time-slider bar rendered at the bottom of the screen. **Important**: The bottom bar now has 2D/3D buttons plus optional pitch/bearing controls when in 3D mode (TacticalMap.tsx lines 1342-1385). Position the replay slider **above** these controls.
   - Range: configurable window (default: last 1 hour).
   - Shows current playback time in UTC.
   - Play/Pause button, playback speed selector (1x, 2x, 5x, 10x).
   - "LIVE" button to exit replay mode and return to real-time.
2. **Replay Mode**:
   - When the slider is dragged or play is pressed, the frontend enters "replay mode".
   - In replay mode, the WebSocket connection is **paused** (messages buffered but not rendered).
   - Instead, the frontend fetches historical data from the API:
     ```
     GET /api/tracks/replay?start={iso}&end={iso}
     ```
   - The backend returns all track points in the time window, grouped by entity_id.
   - The frontend steps through time, rendering each entity at its position for that timestamp.
3. **New API endpoint** (add to `backend/api/main.py`):
   ```python
   # GET /api/tracks/replay
   # Query params: start (ISO), end (ISO)
   # Returns all track rows in the window, ordered by time ASC.
   # Response: [{ time, entity_id, type, lat, lon, alt, speed, heading, meta }]
   # Use TimescaleDB time_bucket for coarser granularity if needed.
   ```
4. **Integration with TacticalMap**:
   - Add a `replayMode: boolean` state to App.tsx.
   - When `replayMode` is true, TacticalMap reads from a `replayEntities` Map instead of the live `entitiesRef`.
   - The animation loop (line 736) renders the replay entities the same way (same layers, same interpolation, same 3D stems if `enable3d` is true).
   - When "LIVE" is clicked, resume WebSocket rendering.

### Styling
Same tactical theme. The time-slider should use cyan accent color. The "LIVE" button should pulse green when in live mode, be gray when in replay mode. Match the existing bottom control bar aesthetic (`bg-black/40 backdrop-blur-md rounded-lg border border-white/5`).

---

## Implementation Order

```
1. Backend-03: Historian          ← Foundation, everything else depends on this
2. FE-08: Search (live only)      ← Can ship with local search first, add API search after Historian
3. FE-10: Payload Inspector       ← Independent, can be done in parallel with Search
4. FE-11: Replay System           ← Requires Historian + new API endpoints
```

## File Map (v0.4.0 accurate)

| Feature | Files to Create/Modify |
|---------|----------------------|
| Backend-03 | `backend/api/main.py` (add historian task + 3 new endpoints) |
| FE-08 | `frontend/src/components/widgets/SearchWidget.tsx` (new), `frontend/src/components/layouts/SidebarLeft.tsx` (add search props + render), `frontend/src/components/map/TacticalMap.tsx` (expose entities + flyTo callback), `frontend/src/App.tsx` (wire search props through) |
| FE-10 | `frontend/src/components/widgets/PayloadInspector.tsx` (new), `frontend/src/components/layouts/SidebarRight.tsx` (integrate), `frontend/src/workers/tak.worker.ts` (ensure raw protobuf object preserved in batch items), `frontend/src/components/map/TacticalMap.tsx` (add raw payload ring buffer ref), `frontend/src/App.tsx` (toggle state) |
| FE-11 | `frontend/src/components/widgets/ReplayControls.tsx` (new), `backend/api/main.py` (replay endpoint), `frontend/src/App.tsx` (replay mode state), `frontend/src/components/map/TacticalMap.tsx` (replay entity source, pause live feed) |

## Existing Dependencies (already installed — NO new packages)
- **Backend**: `asyncpg`, `aiokafka`, `fastapi`, `redis`, `protobuf`, `grpcio-tools` — all in `backend/api/requirements.txt`
- **Frontend**: `react@18.2`, `lucide-react@0.300`, `tailwindcss@3.4`, `protobufjs@7.5`, `mapbox-gl@3.18`, `deck.gl@8.9` — all in `frontend/package.json`
- **No new dependencies needed** for any feature

## Key Technical Notes

- **Kafka message format**: TAK Protobuf binary (magic bytes `0xbf 0x01 0xbf` + Protobuf payload). Backend already has `from proto.tak_pb2 import TakMessage, CotEvent, Detail, Contact, Track` (line 18 of main.py). Use this for server-side decoding in the Historian.
- **Frontend entity type**: `CoTEntity` from `frontend/src/types.ts` (lines 3-18). Also exports `IntelEvent`, `MissionLocation`, `MissionProps`.
- **Ship detection**: `entity.type.includes('S')` — maritime entities have CoT type containing `S` (e.g., `a-f-S-C-M`).
- **The `tracks` hypertable has a 24-hour retention policy**. Replay is limited to the last 24h.
- **TacticalMap** uses `entitiesRef` (a `useRef<Map<string, CoTEntity>>`, line 288) for zero-render entity storage. The animation loop reads from this ref at 60fps.
- **Animation loop** starts at line 736. It does cleanup, counting, filtering, interpolation, and layer construction in a single pass.
- **Controlled view state** (line 278): `viewState` is now React state, updated via `onMove`. The map is rendered as `<GLMap {...viewState} onMove={...}>`.
- **processEntityUpdate** (line 506): Extracted function that handles a single decoded TAK object. Called from both `entity_batch` and `entity_update` worker messages.
- Tailwind config uses tactical theme: `hud-green`, `tactical-bg`, `cyan-400`, plus standard Tailwind utilities.

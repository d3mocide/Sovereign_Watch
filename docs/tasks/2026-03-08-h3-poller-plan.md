# Ingest-13 + FE-09: H3 Adaptive Aviation Poller — Implementation & Testing Plan

**Date:** 2026-03-08
**Roadmap IDs:** Ingest-13 (backend), FE-09 (frontend debug layer)
**Branch prefix:** `claude/<session-id>`

---

## What We're Building

Replace the current fixed 3-point polling loop in `service.py` with the
`H3PriorityManager` from `h3_sharding.py`. Instead of three overlapping
150nm radius circles, the coverage zone is divided into ~469 Resolution-4
H3 cells (~1770km² each). Each cell is polled independently via a Redis
ZSET priority queue:

- **Active cell** (returned ≥1 aircraft last poll): re-poll in 10 s
- **Empty cell** (0 aircraft): back off to 60 s

This eliminates most overlapping duplicate ingest, concentrates API quota
where aircraft actually are, and gives real coverage telemetry we can
visualize on the map.

### Key design decision: Resolution 4

| Resolution | Area | Edge | ~Radius needed | Cells for 150nm zone |
|-----------|------|------|---------------|----------------------|
| 4 | 1770 km² | 22 km | 15 nm | ~469 |
| 7 | 5 km² | 1.2 km | 1 nm | ~170,000 |

Resolution 7 eliminates overlap entirely but requires orders of magnitude
more API calls to initialize. Resolution 4 with a 15nm radius call has a
small overlap (~1.5nm at cell edges) that the existing Arbitrator already
handles. **Resolution 4 is the right call.**

---

## Architecture After Integration

```
PollerService
├── H3PriorityManager (Redis ZSET: h3:poll_queue, h3:aircraft_counts)
│   └── initialize_region() → ~469 cells seeded on startup
├── source_loop() [modified]
│   └── get_next_batch(5) → poll 5 cells per tick → update_priority()
└── process_aircraft_batch() [unchanged]
    └── → Arbitrator → Kafka
```

The `calculate_polling_points()` method is **replaced** by
`H3PriorityManager.get_next_batch()`. Source loops pull from the shared
queue rather than cycling through fixed lat/lon offsets.

---

## Implementation Steps

### Step 1 — Fix h3_sharding.py (known issues)

1. Remove duplicate `self.resolution = 4` assignment (lines 23 and 32).
2. Add `close()` method to properly shut down the Redis connection.
3. Add a `publish_state()` method that writes cell state to a Redis Hash
   (`h3:cell_state`) for the debug API to read:
   ```
   h3:cell_state → HASH { cell_id: json({count, next_poll, interval}) }
   ```

### Step 2 — Wire into service.py

1. Import `H3PriorityManager` in `service.py`.
2. In `PollerService.__init__`: instantiate `self.h3_manager = H3PriorityManager(REDIS_URL)`.
3. In `setup()`: call `await self.h3_manager.start()` then
   `await self.h3_manager.initialize_region(center_lat, center_lon, radius_km)`.
   - Convert `radius_nm` → `radius_km` (`* 1.852`).
4. In `navigation_listener()`: when mission area changes, call
   `await self.h3_manager.initialize_region(...)` to re-seed the queue
   with `nx=True` (won't overwrite existing active cells).
5. Replace `calculate_polling_points()` usage in `source_loop()`:
   - Call `await self.h3_manager.get_next_batch(batch_size=5)`.
   - For each cell, call `get_cell_center_radius(cell)` to get `(lat, lon, 15)`.
   - After `process_aircraft_batch()`, call
     `await self.h3_manager.update_priority(cell, aircraft_count)`.

### Step 3 — Debug API endpoint

Add `GET /api/debug/h3_cells` to the backend API (SSE or plain JSON) that
reads `h3:cell_state` from Redis and returns:

```json
[
  { "cell": "842b5c5ffffffff", "lat": 45.51, "lon": -122.67,
    "count": 12, "interval_s": 10, "next_poll_epoch": 1741478400 },
  ...
]
```

This is the data source for FE-09.

### Step 4 — FE-09: H3 Debug Layer

Add a new `H3CoverageLayer.tsx` using deck.gl's `H3HexagonLayer`:

- **Color**: green (`#00ff88`) for 10s-interval cells, grey (`#334`) for
  60s-interval cells.
- **Opacity**: scaled by `count` (more aircraft = more opaque).
- **Tooltip**: cell ID, aircraft count, next poll time, interval.
- **Toggle**: add "H3 COVERAGE" to the Debug / Dev section in
  `LayerFilters.tsx`. Hidden by default, only shown in dev mode
  (`import.meta.env.DEV`).
- **Poll interval**: fetch `/api/debug/h3_cells` every 5 s.

---

## Testing Plan

### Phase 1 — Unit Tests (no containers required)

**File:** `backend/ingestion/aviation_poller/test_h3_sharding.py`

Run with: `cd backend/ingestion/aviation_poller && python -m pytest test_h3_sharding.py -v`

#### Test cases

| Test | What it verifies |
|------|-----------------|
| `test_initialize_region_cell_count` | `initialize_region(45.5, -122.7, 275)` seeds between 400–550 cells in the Redis ZSET. Use `fakeredis.aioredis`. |
| `test_initialize_region_nx_idempotent` | Calling `initialize_region` twice does not overwrite scores of already-queued cells. |
| `test_get_next_batch_ordering` | `get_next_batch(5)` returns the 5 cells with the lowest score (earliest `next_poll`). |
| `test_update_priority_active_cell` | After `update_priority(cell, count=5)`, the cell score = `now + 10`. |
| `test_update_priority_empty_cell` | After `update_priority(cell, count=0)`, the cell score = `now + 60`. |
| `test_get_cell_center_radius` | `get_cell_center_radius(cell)` returns `(lat, lon, 15)` where lat/lon are within the cell boundary. |
| `test_resolution_4_cell_area` | Spot-check that `h3.cell_area(cell, unit='km^2')` is between 1000–2500 km² for any returned cell. |
| `test_close_releases_redis` | After `close()`, the Redis connection is no longer open. |

#### Dependency
Add `fakeredis[aioredis]` to `backend/ingestion/aviation_poller/requirements.txt`
for test isolation. No live Redis needed.

---

### Phase 2 — Integration Tests (service wiring)

**File:** `backend/ingestion/aviation_poller/test_service_h3.py`

These test that `PollerService` uses the H3 manager correctly without
making real HTTP calls.

| Test | What it verifies |
|------|-----------------|
| `test_setup_initializes_h3_manager` | After `setup()`, `service.h3_manager.redis` is not None. |
| `test_source_loop_polls_from_queue` | Patch `h3_manager.get_next_batch` → returns 1 cell. Patch `poller._fetch` → returns 3 aircraft. Assert `update_priority` called with count=3. |
| `test_mission_update_reseeds_queue` | Send a nav update via mock pubsub. Assert `h3_manager.initialize_region` called with new coords. |
| `test_small_radius_still_uses_h3` | With `radius_nm=30`, assert H3 manager is still used (not the old 1-point fast path). |

---

### Phase 3 — Debug Visualization (manual / live testing)

This is how you validate efficiency and coverage during development.

#### Setup

1. Start with `docker compose up -d` (all services running).
2. Enable the H3 debug toggle in the frontend (dev mode only).
3. Open the map.

#### What to look for

| Signal | Healthy | Problem |
|--------|---------|---------|
| Cell colors | Active flight corridors (SEA-PDX, transpacific approach) are bright green; open ocean cells are grey | All cells green = adaptive backoff not working |
| Cell opacity | Varies — busy cells near airports are more opaque | All same opacity = count not publishing |
| Duplicate suppression | Arbitrator "skipped" log count drops by 30–50% vs current fixed-point polling | No change = H3 cells are still overlapping too much |
| API call rate | `adsb_fi` / `adsb_lol` token spend drops in quiet periods | Rate same as before = queue draining too fast |
| Coverage holes | All cells within the mission radius are colored | Grey ring inside the AOR = `initialize_region` k-ring size too small |

#### Metrics to capture before and after

From service logs, record for a 10-minute window:

```
Before H3: total_polls, total_aircraft, arbitrator_skips, source_429s
After  H3: total_polls, total_aircraft, arbitrator_skips, source_429s
```

Target outcome: `total_polls` down, `total_aircraft` neutral or up,
`arbitrator_skips` down significantly, `source_429s` flat or down.

---

### Phase 4 — Ruff lint

```bash
cd backend/ingestion/aviation_poller && ruff check .
```

Must pass clean before PR.

---

## Open Questions / Risks

| Question | Notes |
|----------|-------|
| **Queue starvation** | If all 469 cells have `next_poll` in the future and `get_next_batch` only returns due cells, source loops will idle. Consider `get_next_batch` returning cells regardless of score, then sleeping the delta. |
| **Mission pivot re-seed** | When DAM pivots to a new area, old cells from the previous region will linger in the queue. Need a `flush_queue()` before `initialize_region()` on area change, or use a queue key that includes the mission ID. |
| **Resolution 4 edge overlap** | ~1.5nm overlap at cell edges is handled by the Arbitrator. Confirmed acceptable. |
| **h3 library in container** | `h3` Python package requires native bindings. Verify it's in `requirements.txt` and the Docker image already has it (it was used by the dead file, so it may already be installed). |

---

## Definition of Done

- [ ] `test_h3_sharding.py` — all 8 unit tests pass with `fakeredis`
- [ ] `test_service_h3.py` — all 4 integration tests pass
- [ ] `ruff check .` passes clean
- [ ] Live test: H3 debug layer renders on map, cell colors change dynamically
- [ ] Live metric capture: `arbitrator_skips` reduced ≥20% vs baseline
- [ ] `h3_sharding.py` no longer appears in dead code review
- [ ] ROADMAP.md Ingest-13 and FE-09 moved to Completed

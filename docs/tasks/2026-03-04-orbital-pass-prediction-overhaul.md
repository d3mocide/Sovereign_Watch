# 2026-03-04 - Orbital Pass Prediction Backend & Frontend Overhaul

## Context

The satellite dashboard UI was completed in Phase 1–5 of the previous task
(`2026-03-03-implement-satellite-dashboard.md`), but the **backend pass
prediction API was never actually implemented**. As a result:

- `PassPredictorWidget` renders an empty pass list
- `DopplerWidget` never receives slant-range data
- `PolarPlotWidget` never receives az/el path points

This task closes that gap end-to-end.

---

## Root Cause

The `tracks` hypertable has a **24-hour retention policy**, so TLE strings
stored in `meta` are regularly purged. The pass prediction API needs fresh
TLEs at any time. A dedicated `satellites` table (no retention, upsert on
arrival) is therefore required before any pass math can be done.

---

## Implementation Phases

---

### Phase 1 — Satellites Table (Database)

**Goal**: Persist the latest TLE + metadata for every NORAD ID, independent of
track retention.

**Files to change**:
- `backend/db/init.sql`

**Steps**:
1. Add `satellites` table:
   ```sql
   CREATE TABLE IF NOT EXISTS satellites (
     norad_id      TEXT PRIMARY KEY,
     name          TEXT,
     category      TEXT,
     tle_line1     TEXT NOT NULL,
     tle_line2     TEXT NOT NULL,
     period_min    FLOAT,
     inclination_deg FLOAT,
     eccentricity  FLOAT,
     updated_at    TIMESTAMPTZ DEFAULT NOW()
   );
   ```
2. No hypertable, no retention policy — this is a plain lookup table.

**Prompt for agent**:
```
Add a `satellites` table to backend/db/init.sql that stores the latest TLE
and orbital metadata for each NORAD ID (primary key). Columns: norad_id TEXT
PK, name TEXT, category TEXT, tle_line1 TEXT NOT NULL, tle_line2 TEXT NOT
NULL, period_min FLOAT, inclination_deg FLOAT, eccentricity FLOAT,
updated_at TIMESTAMPTZ DEFAULT NOW(). No hypertable, no retention policy.
```

---

### Phase 2 — Historian Upsert (Backend Service)

**Goal**: Every time the Historian consumes an `orbital_raw` Kafka message, it
upserts the TLE data into the `satellites` table.

**Files to change**:
- `backend/api/services/historian.py`

**Steps**:
1. After inserting the track point, run an `INSERT … ON CONFLICT (norad_id) DO
   UPDATE` with the TLE fields extracted from `meta.classification`.
2. Only upsert when `tle_line1` and `tle_line2` are present (guard against
   non-orbital messages).

**Prompt for agent**:
```
In backend/api/services/historian.py, after the existing track INSERT, add an
upsert to the `satellites` table whenever the consumed Kafka message contains
tle_line1 and tle_line2 in its metadata. Use INSERT … ON CONFLICT (norad_id)
DO UPDATE SET tle_line1=…, tle_line2=…, name=…, category=…, period_min=…,
inclination_deg=…, eccentricity=…, updated_at=NOW(). Extract fields from the
protobuf meta dict already decoded in the Historian. Do not break the existing
track INSERT logic.
```

---

### Phase 3 — Pass Prediction Router (Backend API)

**Goal**: Implement `GET /api/orbital/passes` and `GET
/api/orbital/groundtrack/{norad_id}` using sgp4 (already in requirements).

**Files to create**:
- `backend/api/routers/orbital.py`

**Files to change**:
- `backend/api/main.py` (register router)

**Endpoint — passes**:
```
GET /api/orbital/passes
  ?lat=<float>&lon=<float>     # observer location
  &hours=<int default=6>       # prediction window
  &min_elevation=<float=10>    # minimum AOS elevation (deg)
  &norad_ids=<csv optional>    # filter to specific satellites
```
Response schema per pass:
```json
{
  "norad_id": "25544",
  "name": "ISS (ZARYA)",
  "category": "stations",
  "aos": "2026-03-04T18:32:00Z",
  "tca": "2026-03-04T18:38:00Z",
  "los": "2026-03-04T18:44:00Z",
  "max_elevation": 72.4,
  "aos_azimuth": 315.2,
  "los_azimuth": 143.7,
  "duration_seconds": 724,
  "points": [
    {"t": "2026-03-04T18:32:00Z", "az": 315.2, "el": 10.0, "slant_range_km": 1820.3},
    ...
  ]
}
```

**Algorithm**:
1. Load all matching TLEs from `satellites` table (or filtered subset).
2. For each satellite, step through the prediction window at 10-second
   intervals using `sgp4.api.Satrec`.
3. Convert TEME → ECEF → observer topocentric using GMST + observer ECEF.
4. Compute azimuth + elevation for each step.
5. Detect AOS (el crosses `min_elevation` rising) and LOS (el drops below).
6. Record TCA (peak elevation) within each visible window.
7. For each pass, store 10-second `points[]` for polar plot and Doppler use.
8. Sort results by AOS ascending.

**Endpoint — groundtrack**:
```
GET /api/orbital/groundtrack/{norad_id}
  ?minutes=<int default=90>   # propagation window (one orbit ≈ 90 min)
  &step_seconds=<int default=30>
```
Response: array of `{t, lat, lon, alt_km}`.

**Implementation notes**:
- Use `sgp4.api.Satrec.twoline2rv()` (already used in `orbital_pulse`).
- Reuse coordinate math from `backend/ingestion/orbital_pulse/utils.py` —
  copy the relevant functions into a new `backend/api/utils/sgp4_utils.py`.
- Observer ECEF from WGS-84 geodetic (same formula already in utils.py).
- Use `asyncpg` connection from `request.app.state.db`.

**Prompt for agent**:
```
Create backend/api/routers/orbital.py with two FastAPI routes:

1. GET /api/orbital/passes — accepts query params lat, lon, hours (default 6),
   min_elevation (default 10.0), norad_ids (optional comma-separated string).
   Loads TLEs from the `satellites` table, propagates each satellite through
   the window in 10-second steps using sgp4.api.Satrec, converts TEME to
   topocentric az/el relative to the observer using GMST rotation and WGS-84
   ECEF. Detects AOS/LOS/TCA crossings, returns a JSON list of passes sorted
   by AOS including a points[] array (t, az, el, slant_range_km at 10s steps
   within each visible window). Skip passes where max_elevation < min_elevation.

2. GET /api/orbital/groundtrack/{norad_id} — accepts minutes (default 90) and
   step_seconds (default 30). Loads TLE from satellites table, propagates and
   returns array of {t, lat, lon, alt_km}.

Create backend/api/utils/sgp4_utils.py and copy the teme_to_ecef_vectorized
and ecef_to_lla_vectorized helper functions from
backend/ingestion/orbital_pulse/utils.py, adding an ecef_to_topocentric
function that returns (azimuth_deg, elevation_deg, slant_range_km) given
observer ECEF and satellite ECEF vectors.

Register the new router in backend/api/main.py with prefix /api/orbital.

Add sgp4 to backend/api/requirements.txt if not already present.
```

---

### Phase 4 — Pass Prediction Hook (Frontend)

**Goal**: Create a React hook that fetches passes from the new API and feeds
the three widgets.

**Files to create**:
- `frontend/src/hooks/usePassPredictions.ts`

**Hook signature**:
```ts
usePassPredictions(
  observerLat: number,
  observerLon: number,
  options?: { hours?: number; minElevation?: number; noradIds?: string[] }
): {
  passes: PassResult[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
```

**Behaviour**:
- Poll every 5 minutes (passes are recomputed from current time).
- Abort in-flight requests on unmount or re-trigger.
- Return empty array while loading (do not flash stale data).

**Types to add to `frontend/src/types.ts`**:
```ts
export interface PassPoint {
  t: string;
  az: number;
  el: number;
  slant_range_km: number;
}

export interface PassResult {
  norad_id: string;
  name: string;
  category: string;
  aos: string;
  tca: string;
  los: string;
  max_elevation: number;
  aos_azimuth: number;
  los_azimuth: number;
  duration_seconds: number;
  points: PassPoint[];
}
```

**Prompt for agent**:
```
Create frontend/src/hooks/usePassPredictions.ts — a React hook that fetches
from GET /api/orbital/passes with query params lat, lon, hours, min_elevation,
and optional norad_ids. Re-fetches every 5 minutes using setInterval, cancels
in-flight requests with AbortController on unmount. Returns { passes, loading,
error, refetch }. Add PassPoint and PassResult interfaces to
frontend/src/types.ts.
```

---

### Phase 5 — Wire Widgets in OrbitalSidebarLeft (Frontend)

**Goal**: Replace the hardcoded empty arrays in `OrbitalSidebarLeft` with live
data from `usePassPredictions`.

**Files to change**:
- `frontend/src/components/layouts/OrbitalSidebarLeft.tsx`

**Steps**:
1. Import `usePassPredictions`.
2. Replace hardcoded `lat=45.52, lon=-122.68` with values from
   `useMissionArea` (already available in the codebase).
3. Call `usePassPredictions(lat, lon)`.
4. Pass `passes` to `PassPredictorWidget`.
5. For the selected pass (first pass or user-selected), pass its `points[]` to
   `DopplerWidget` as `passPoints` and to `PolarPlotWidget`.

**Prompt for agent**:
```
In frontend/src/components/layouts/OrbitalSidebarLeft.tsx, import and call
the usePassPredictions hook using the observer lat/lon from useMissionArea
(or fall back to CENTER_LAT/CENTER_LON env vars). Replace the empty passes
array passed to PassPredictorWidget with the live passes from the hook. Add
local state for `selectedPassIndex` (default 0). Pass the selected pass's
points[] array to DopplerWidget as passPoints and to PolarPlotWidget. Show a
subtle loading spinner in place of the pass list while loading=true.
```

---

### Phase 6 — Lint, Tests, Commit, Push

**Goal**: Verify nothing is broken and ship the branch.

**Steps**:
1. Backend lint + tests:
   ```bash
   cd backend/api && ruff check . && python -m pytest
   ```
2. Frontend lint + tests:
   ```bash
   cd frontend && npm run lint && npm run test
   ```
3. Fix any issues found.
4. Commit all changes with a descriptive message.
5. Push to `claude/orbital-map-sgp4-6bXiE`.

**Prompt for agent**:
```
Run ruff check on backend/api, fix any lint errors. Run python -m pytest on
backend/api, fix any failing tests. Run npm run lint and npm run test on
frontend, fix any failures. Then commit all staged changes with message:
"feat: add orbital pass prediction API and wire frontend widgets" and push to
origin claude/orbital-map-sgp4-6bXiE.
```

---

## Dependency Map

```
Phase 1 (DB schema)
    └─► Phase 2 (Historian upsert)
            └─► Phase 3 (Pass API)  ◄─ can start in parallel with Phase 4
Phase 4 (React hook)
    └─► Phase 5 (Wire widgets)
                └─► Phase 6 (Lint + push)
```

Phases 3 and 4 can be executed in parallel once Phase 2 is complete.

---

## Files Changed Summary

| File | Action |
|------|--------|
| `backend/db/init.sql` | Add `satellites` table |
| `backend/api/services/historian.py` | Add TLE upsert after track insert |
| `backend/api/utils/sgp4_utils.py` | New — TEME/ECEF/topocentric helpers |
| `backend/api/routers/orbital.py` | New — `/api/orbital/passes` + groundtrack |
| `backend/api/main.py` | Register orbital router |
| `backend/api/requirements.txt` | Confirm `sgp4` present |
| `frontend/src/types.ts` | Add `PassPoint`, `PassResult` interfaces |
| `frontend/src/hooks/usePassPredictions.ts` | New — polling hook |
| `frontend/src/components/layouts/OrbitalSidebarLeft.tsx` | Wire hook → widgets |

---

## Definition of Done

- [ ] `satellites` table exists in `init.sql`
- [ ] Historian upserts TLE on every `orbital_raw` message
- [ ] `GET /api/orbital/passes` returns correctly shaped JSON
- [ ] `GET /api/orbital/groundtrack/{norad_id}` returns lat/lon/alt array
- [ ] `usePassPredictions` hook polls and returns typed data
- [ ] `PassPredictorWidget` renders live passes
- [ ] `DopplerWidget` renders Doppler curve for selected pass
- [ ] `PolarPlotWidget` renders az/el path for selected pass
- [ ] All backend ruff + pytest checks pass
- [ ] All frontend lint + vitest checks pass
- [ ] Changes committed and pushed to `claude/orbital-map-sgp4-6bXiE`

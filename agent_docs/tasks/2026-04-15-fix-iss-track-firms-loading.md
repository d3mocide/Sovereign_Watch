# Fix: ISS Track Not Updating + FIRMS Not Loading

## Issue

Three related regressions introduced by task work on Apr 13–15:

1. **ISS history trail not updating (live)** — The ISS ground-track in the animation loop was always rendering stale data. WebSocket / REST live positions appeared to do nothing.
2. **ISS track looks distorted on page refresh** — After a container restart, `fetchTrack` returns positions spanning a time gap. Without gap detection, Deck.gl `PathLayer` drew a straight line across the gap (potentially thousands of km), making the trail look incorrect.
3. **FIRMS layer loading nothing at all** — The fire-hotspot layer was rendering zero features even when FIRMS data exists globally.

---

## Root Causes

### 1. ISS timestamps: integer vs. ISO-8601 string

`backend/ingestion/space_pulse/sources/iss.py` writes:
```python
"timestamp": int(record["time"].timestamp())   # Unix epoch integer
```

`buildISSLayer.ts → toOrderedTrack()` filters positions with:
```typescript
.filter(p => typeof p.timestamp === "string")
```

Every position arriving via WebSocket or REST had an integer timestamp → silently filtered out every frame. Only `fetchTrack()` (which reads from TimescaleDB, which serialises `TIMESTAMPTZ` as ISO-8601) produced visible trail points. This is why refreshing "fixed" the trail briefly.

### 2. No time-gap detection in `splitTrackAtAntimeridian`

When the space_pulse container restarted (triggered by recent task rebuilds), `fetchTrack` returned 1080 positions spanning the restart gap. `splitTrackAtAntimeridian` only split on longitude flips; it had no concept of temporal gaps. Deck.gl rendered one continuous path including the jump, causing the distortion.

### 3. FIRMS global default was `false`

The `2026-04-14-fix-firms-global-subfilter-scope.md` task correctly scoped non-global FIRMS fetches to the mission-area bbox. However, `DEFAULT_FILTERS.firmsGlobal` remained `false`. With the default mission area set to Portland OR (no active fires during this period), `GET /api/firms/hotspots?lat=45.5&lon=-122.6&radius=150nm` returned `{features: []}`, and `buildFIRMSLayer` short-circuits on empty data.

---

## Solution

### Fix 1: normalize ISS timestamps in `useISSTracker.ts`

Added `normalisePosition()` callback that accepts the raw WebSocket/REST payload and converts any numeric Unix timestamp to ISO-8601 before calling `appendPosition()`. Both `fetchRest` and `ws.onmessage` now pass through `normalisePosition` instead of casting raw data directly.

### Fix 2: time-gap segment splitting in `buildISSLayer.ts`

Added `MAX_TRACK_GAP_MS = 10 * 60 * 1000` (10 minutes). In `splitTrackAtAntimeridian`, before checking for antimeridian crossing, consecutive ordered points whose timestamps differ by more than this threshold now start a new path segment. This prevents Deck.gl from drawing a misleading connecting line across restart gaps.

### Fix 3: default FIRMS to global in `useAppFilters.ts`

Changed `firmsGlobal: false` → `firmsGlobal: true` in `DEFAULT_FILTERS`. First-time users (and those without localStorage state) now query the full global dataset, which always has fire data somewhere on Earth. Users who previously saved `firmsGlobal: false` are unaffected; they can re-enable "GLOBAL" in the Environmental layer panel.

---

## Changes

| File | Change |
| :--- | :--- |
| `frontend/src/hooks/useISSTracker.ts` | Added `normalisePosition()` callback; updated `fetchRest` and `ws.onmessage` callers; updated dependency arrays |
| `frontend/src/layers/buildISSLayer.ts` | Added `MAX_TRACK_GAP_MS`; added time-gap segment splitting in `splitTrackAtAntimeridian`; fixed pre-existing `let→const` lint error for `lon1` |
| `frontend/src/hooks/useAppFilters.ts` | Changed `firmsGlobal: false` → `firmsGlobal: true` in `DEFAULT_FILTERS` |

### `normalisePosition` (added to `useISSTracker.ts`)

```typescript
const normalisePosition = useCallback((raw: Record<string, unknown>): ISSPosition => {
  const ts = raw.timestamp;
  const timestamp =
    typeof ts === "string"
      ? ts
      : typeof ts === "number"
        ? new Date(ts * 1000).toISOString()
        : new Date().toISOString();
  return {
    lat:          raw.lat as number,
    lon:          raw.lon as number,
    timestamp,
    altitude_km:  (raw.altitude_km as number | null) ?? null,
    velocity_kms: (raw.velocity_kms as number | null) ?? null,
  };
}, []);
```

### Time-gap splitting (added to `buildISSLayer.ts`)

```typescript
const MAX_TRACK_GAP_MS = 10 * 60 * 1000;

// inside the for-loop:
const prevMs = new Date(prev.timestamp).getTime();
const currMs = new Date(curr.timestamp).getTime();
const timeGapTooLarge = (currMs - prevMs) > MAX_TRACK_GAP_MS;

// ...
} else if (timeGapTooLarge) {
    if (currentSegment.length >= 2) {
        segments.push({ path: currentSegment });
    }
    currentSegment = [[curr.lon, curr.lat]];
} else {
    // antimeridian crossing or normal append
```

---

## Verification

```
cd frontend
pnpm run lint      → passed (clean, no errors)
pnpm run typecheck → passed (no type errors)
pnpm run test      → 254/254 tests passed
                     (1 unrelated pre-existing error: useMissionHash.test.ts missing jsdom)
```

---

## Benefits

- **Correctness**: ISS ground-track now updates live via WebSocket as the satellite moves. Before this fix, the trail only reflected the state at page load (from `fetchTrack`).
- **Visual quality**: Time-gap detection prevents the "distorted trail" artifact when the space_pulse container restarts, keeping visual path segments temporally contiguous.
- **FIRMS availability**: Fire hotspot data is visible on first load for all users, not just those with an active fire within their mission area.
- **Resilience**: `normalisePosition` is defensive — if the ISS poller is later updated to send ISO-8601 strings (the correct fix on the backend), the frontend continues to work without changes.

---

## Notes / Follow-up

The ISS poller should ideally send ISO-8601 timestamps to be consistent with backend conventions. Changing line 137 of `backend/ingestion/space_pulse/sources/iss.py`:

```python
# Current (sends integer):
"timestamp": int(record["time"].timestamp())

# Preferred (sends ISO-8601):
"timestamp": record["time"].isoformat()
```

This requires rebuilding `sovereign-space-pulse` (`docker compose up -d --build sovereign-space-pulse`). The frontend now handles both formats defensively so this is not urgent.

# Feature: Global FIRMS Coverage Toggle

## Issue

The NASA FIRMS ingestion poller was hard-coded to a mission-area bounding box.
There was no way to ingest world-wide fire hotspot data, and no UI to switch
between mission-area and global coverage without code changes.

Related: the FIRMS data layer rendering bug (empty Redis cache poisoning the
fast-path) was fixed in a prior commit on this branch.

## Solution

Two orthogonal changes:

1. **Backend** — add `FIRMS_BBOX_MODE` env var to the ingestion poller so it
   can switch from the NASA area/bbox endpoint to the World endpoint without
   any code changes.

2. **Frontend** — add a `firmsGlobal` filter flag wired through
   `MapFilters → useAppFilters → App.tsx → useInfraData`. A compact "GLOBAL"
   chip appears next to the NASA FIRMS toggle in the Environmental layer panel.
   When active, the hook's FIRMS fetch appends explicit world-wide bbox params
   (`min_lat=-90&max_lat=90&min_lon=-180&max_lon=180`) so the API skips the
   mission-area Redis cache and returns all rows currently in the DB.

## Changes

| File | Change |
|---|---|
| `backend/ingestion/space_pulse/sources/firms.py` | Added `FIRMS_BBOX_MODE` env var (`"mission"` \| `"global"`); added `FIRMS_WORLD_BASE_URL` constant; `_poll()` branches to use the FIRMS World endpoint when `FIRMS_BBOX_MODE=global`; updated module docstring |
| `frontend/src/types.ts` | Added `firmsGlobal?: boolean` to `MapFilters` interface |
| `frontend/src/hooks/useAppFilters.ts` | Added `firmsGlobal: false` to `DEFAULT_FILTERS` |
| `frontend/src/hooks/useInfraData.ts` | Exported `UseInfraDataOptions` interface; hook now accepts `options?: UseInfraDataOptions`; added `firmsGlobalRef`; extracted FIRMS fetch into a dedicated reactive `useEffect([options?.firmsGlobal])` that owns its own interval and re-fires immediately on toggle |
| `frontend/src/App.tsx` | `useInfraData({ firmsGlobal: !!filters.firmsGlobal })` |
| `frontend/src/components/widgets/LayerVisibilityControls.tsx` | Converted FIRMS `<label>` wrapper to `<div>` + inner `<label>` (flex-1) + `<button>` GLOBAL chip sibling; chip is disabled when FIRMS layer is off |

### Ingestion (backend)

```bash
# Mission-area mode (default — unchanged from before)
FIRMS_BBOX_MODE=mission  # or omit entirely

# Global mode — fetches from:
# https://firms.modaps.eosdis.nasa.gov/api/country/csv/{key}/{source}/World/{days}
FIRMS_BBOX_MODE=global
```

The World endpoint returns the same VIIRS/MODIS CSV schema as the area
endpoint, so `_parse_csv()` required no changes.

### Scale expectations for global mode

| Source | Detections / 24 h | DB rows after 3 days |
|---|---|---|
| VIIRS SNPP | ~5 000 – 30 000 | ~90 000 max |
| MODIS | ~2 000 – 10 000 | ~30 000 max |
| Combined | ~35 000 peak | ~105 000 max |

TimescaleDB with the GiST spatial index handles this comfortably.  The API
`limit` parameter (default 2 000, max 10 000) may need raising when global
data is fully loaded — a follow-up task.

### Frontend reactive effect

The FIRMS fetch was extracted from the monolithic main `useEffect([], [])` into
its own effect with a `[options?.firmsGlobal]` dependency array:

```typescript
useEffect(() => {
  firmsGlobalRef.current = !!options?.firmsGlobal;
  const fetchFirms = async () => { /* ... */ };
  fetchFirms();
  const firmsInterval = setInterval(fetchFirms, 5 * 60 * 1000);
  return () => clearInterval(firmsInterval);
}, [options?.firmsGlobal]);
```

Toggling the chip tears down the old interval and immediately re-fetches
with the new URL.  Other data-fetch intervals are unaffected.

## Verification

1. `uv tool run ruff check backend/ingestion/space_pulse/sources/firms.py` — passed
2. `uv tool run ruff check backend/api/routers/firms.py` — passed (prior fix)
3. Pre-existing node_modules-missing TypeScript errors in the monorepo are
   unaffected; no new type errors introduced in changed files.
4. Manual flow:
   - Inject test data → FIRMS layer renders (bug fix from prior commit)
   - Click GLOBAL chip → chip highlights in orange; re-fetch fires immediately
   - Set `FIRMS_BBOX_MODE=global` + restart poller → world-wide hotspots ingest
     and appear on map with GLOBAL chip active

## Benefits

- Operators can ingest and display world-wide fire data without code changes
- UI chip gives immediate visual feedback and triggers a live re-fetch on toggle
- Reactive FIRMS interval is decoupled from other data hooks — toggling global
  mode does not restart DNS/outage/cable/GDELT polling
- Default behaviour (`FIRMS_BBOX_MODE=mission`, `firmsGlobal=false`) is fully
  backwards-compatible

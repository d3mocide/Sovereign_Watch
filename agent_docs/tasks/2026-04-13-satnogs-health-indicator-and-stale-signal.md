## Issue
Operators wanted SatNOGS freshness visibility in UI without reading backend logs, specifically a clear signal when station data is stale but still served from cache.

## Solution
Added an opt-in metadata envelope on `/api/satnogs/stations` and consumed it in the System Health widget to display SatNOGS state as `HEALTHY`, `STALE`, or `ERROR` with source context.

## Changes
- Updated `backend/api/routers/satnogs.py`:
  - Added `include_meta` query param (default `false`) to keep legacy array response unchanged for existing callers.
  - Added `_stations_response(...)` helper returning `{ stations, meta }` when `include_meta=true`.
  - Added metadata fields: `source`, `stale`, `count`, `served_at`.
  - Wired metadata through live/cache/stale-backoff/stale-error return paths.
- Updated `frontend/src/components/widgets/SystemHealthWidget.tsx`:
  - Added SatNOGS metadata fetch via `/api/satnogs/stations?include_offline=false&include_meta=true`.
  - Added `EXTERNAL` section with `SATNOGS STATIONS` status chip.
  - Mapped metadata to UI statuses:
    - `live`/`cache` => `HEALTHY`
    - stale responses => `STALE`
    - metadata unavailable => `ERROR`
  - Switched multi-source loading to `Promise.allSettled(...)` so one failed request does not blank the whole widget.

## Verification
- Backend:
  - `cd backend/api && uv tool run ruff check . && uv run python -m pytest`
  - Result: Ruff passed, 135 tests passed.
- Frontend:
  - `cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test`
  - Result: lint passed, typecheck passed, vitest passed (18 files, 268 tests).

## Benefits
- System Health now surfaces SatNOGS freshness directly in UI.
- Existing map/layer consumers are unaffected because default stations endpoint response remains an array.
- Better operator awareness during upstream SatNOGS instability without extra backend log inspection.

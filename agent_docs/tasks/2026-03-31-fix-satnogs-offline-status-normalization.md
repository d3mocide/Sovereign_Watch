# 2026-03-31-fix-satnogs-offline-status-normalization

## Issue
SatNOGS map/sidebar status appeared uniformly `offline`, causing confusion about station availability.

Root causes:
1. Backend passed upstream station `status` through directly without normalization.
2. Stations endpoint cached responses for 24 hours, making stale status likely.
3. Frontend fetched a single unfiltered station list.

## Solution
Normalized status in backend, reduced station cache TTL, and changed frontend fetch strategy to prefer online stations first with fallback to full inventory.

## Changes
- `backend/api/routers/satnogs.py`
  - Added `_normalize_station_status(...)`.
  - Added `/stations` query param `include_offline` (default `false`).
  - Added `last_seen` field passthrough.
  - Reduced station cache TTL to 5 minutes.
- `frontend/src/hooks/useSatNOGS.ts`
  - Fetches `/api/satnogs/stations?include_offline=false` first.
  - Falls back to `include_offline=true` if no online stations are returned.
- `frontend/src/types.ts`
  - Extended `SatNOGSStation` with optional `last_seen`.

## Verification
- `cd frontend && pnpm run lint` passed.
- `cd frontend && pnpm run test` passed (36 tests).
- `cd backend/api && uv tool run ruff check routers/satnogs.py routers/ai_router.py` passed.

## Benefits
Improves operator trust in SatNOGS status by reducing stale/offline bias and exposing online-first network state while preserving fallback visibility.

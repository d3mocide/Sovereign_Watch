## Issue

The backend dark-vessel land-mask fix initially broke backend startup because the FIRMS router assumed a repo-root relative path using `Path(__file__).resolve().parents[3]`. That assumption is invalid inside the backend container, where only `backend/api` is copied or mounted into `/app`. The underlying dark-vessel problem also remained: global dark-vessel candidates could include on-land FIRMS detections because the API had no land exclusion step.

## Solution

Kept the backend land-mask approach, but made asset discovery container-safe. The FIRMS router now resolves land-mask candidates defensively, the backend container mounts the existing `frontend/public/world-countries.json` asset at a stable in-container path, and the dark-vessel route normalizes FastAPI `Query(...)` defaults so direct unit invocation behaves like normal HTTP execution.

## Changes

- Updated `backend/api/routers/firms.py`
  - Added polygon extraction helpers for the world land-mask GeoJSON.
  - Added safe candidate-path discovery using `FIRMS_LANDMASK_PATH`, `/app/support/world-countries.json`, and iterative parent search instead of brittle fixed parent indexing.
  - Added startup-time land-mask loading with graceful fallback when no asset is available.
  - Updated `/api/firms/dark-vessels` to exclude hotspots intersecting land polygons before AIS nearest-neighbor matching.
  - Normalized FastAPI `Query` defaults inside `get_dark_vessels()` so direct test invocation uses primitive values instead of `Query` objects.
- Updated `backend/api/tests/test_firms_router.py`
  - Added regression coverage for polygon extraction and dark-vessel query land-mask parameters.
  - Fixed the land-mask assertion to compare against the patched test fixture instead of the restored module global.
- Updated `docker-compose.yml`
  - Mounted `frontend/public/world-countries.json` into the backend container at `/app/support/world-countries.json`.
- Removed `backend/api/support/world-countries.json`
  - Deleted the empty accidental artifact from the earlier failed attempt.

## Verification

- `docker compose -f docker-compose.yml -f compose.dev.yml up -d --build sovereign-backend`
  - Result: backend rebuilt and restarted successfully.
- `docker compose logs sovereign-backend --tail 40`
  - Result: backend served healthy requests after restart; no FIRMS router import crash.
- `docker compose exec sovereign-backend uv run python -m pytest tests/test_firms_router.py`
  - Result: passed (`5` tests).
- `docker compose exec sovereign-backend sh -lc "uv tool run ruff check . && uv run python -m pytest"`
  - Result: Ruff passed and backend API test suite passed (`145` tests).

## Benefits

- Restores backend startup stability after the land-mask change.
- Prevents obvious inland FIRMS detections from surfacing as dark-vessel candidates in the backend API.
- Makes the land-mask asset contract explicit for container runtime instead of relying on repo-relative path assumptions.

## Issue

The FIRMS global toggle on the frontend switched the request to a full-world bbox, but the backend still depended on mission-scoped ingest data from `space_pulse`. When no mission-area FIRMS detections existed, the database contained no recent world data to return, so the global toggle showed nothing. There was also a semantic bug: the route could serve the mission-scoped Redis FIRMS cache as if it were global data.

## Solution

Added a dedicated API-side global FIRMS fallback path that fetches live world data from NASA FIRMS when the user requests the global hotspot view and the app is not ingesting global FIRMS data. The backend now uses a separate world-cache key for that response instead of reusing the mission-scoped Redis cache.

## Changes

- Updated `backend/api/routers/firms.py`
  - Added FIRMS environment config for API-side live global fetches.
  - Added CSV parsing and confidence normalization helpers mirroring the poller format.
  - Added a dedicated `firms:global_live_geojson` cache path for true global requests.
  - Changed `/api/firms/hotspots` so global requests prefer dedicated world cache/live fetch rather than mission cache.
- Updated `backend/api/tests/test_firms_router.py`
  - Added regression coverage for live global FIRMS fallback and CSV normalization.
- Updated `docker-compose.yml`
  - Surfaced `FIRMS_MAP_KEY`, `FIRMS_SOURCE`, and `FIRMS_BBOX_MODE` to `sovereign-backend`.
- Updated `.env.example`
  - Documented `FIRMS_BBOX_MODE` alongside the FIRMS API key and source settings.

## Verification

- `cd backend/api && uv tool run ruff check .`
- `cd backend/api && uv run python -m pytest`
  - Result: passed (`143` tests).
- Runtime parity:
  - `docker compose -f docker-compose.yml -f compose.dev.yml up -d --build sovereign-backend`
  - Result: backend container rebuilt successfully with FIRMS env surfaced.

## Benefits

- The frontend global FIRMS toggle now has a true world-data path even when ingestion remains mission-scoped.
- Mission-scoped FIRMS cache is no longer mislabeled or reused as global data.
- The global toggle becomes testable even when the current AOT has no active FIRMS detections.
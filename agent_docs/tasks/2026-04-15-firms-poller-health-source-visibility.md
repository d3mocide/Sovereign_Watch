## Issue

The operations view did not report FIRMS as a first-class poller, and there was no source-level visibility for the multi-source FIRMS ingest path. When one upstream FIRMS product went empty or failed, operators had to inspect container logs manually to understand whether the poller was stale, healthy, or partially degraded.

## Solution

Added FIRMS-specific monitoring output from the Space Pulse poller, exposed that snapshot through the existing poller-health API, and rendered the per-source summary in the frontend health sidebar. The poller now distinguishes between complete upstream failure and successful-but-empty source responses.

## Changes

- backend/ingestion/space_pulse/sources/firms.py
  - Added Redis snapshot writes for per-source FIRMS cycle status under `firms:source_status`.
  - Recorded source status as `ok`, `empty`, or `error` with qualifying hotspot counts.
  - Raised a poll-cycle error when all FIRMS sources fail so poller health can reflect a real upstream outage.
- backend/ingestion/space_pulse/tests/test_firms.py
  - Added coverage for the FIRMS source-status Redis snapshot writer.
- backend/api/routers/system.py
  - Added FIRMS to `/api/config/poller-health` as a monitored poller.
  - Parsed `firms:source_status` into a compact detail string such as `NOAA20:515 | NOAA21:491 | SNPP:empty`.
- backend/api/tests/test_system_router.py
  - Added tests for FIRMS source-summary formatting and FIRMS poller-health inclusion.
- frontend/src/components/stats/types.ts
  - Extended `PollerHealth` with optional `detail` text.
- frontend/src/components/stats/PollerHealthSidebar.tsx
  - Rendered the poller detail line beneath the poller name in the health sidebar.

## Verification

- `cd backend/api && uv tool run ruff check . && uv run python -m pytest tests/test_firms_router.py tests/test_system_router.py`
  - Passed.
- `cd backend/ingestion/space_pulse && uv tool run ruff check .`
  - Passed.
- `cd backend/ingestion/space_pulse && uv run python -m pytest tests/test_firms.py`
  - Host-environment blocked by the known Windows/Python 3.14 `asyncpg==0.30.0` wheel build failure.
- `cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test`
  - Passed.

## Benefits

- FIRMS is now visible in the same operational health surface as the other pollers.
- Operators can tell whether NOAA-20, NOAA-21, or SNPP is empty or failing without tailing container logs.
- Full upstream failure is no longer reported as an implicitly healthy FIRMS cycle.
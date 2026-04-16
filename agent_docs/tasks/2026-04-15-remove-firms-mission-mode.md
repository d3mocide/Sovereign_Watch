# Remove FIRMS Mission Mode

## Issue

FIRMS still retained a backend mission-versus-global ingest split even after the frontend was changed to always request global coverage. That left the system behavior dependent on `FIRMS_BBOX_MODE`, which could still constrain the stored hotspot dataset to a mission bbox and make world coverage inconsistent.

## Solution

Removed the FIRMS mission/global mode split from the backend. The Space Pulse poller now always ingests the NASA FIRMS world endpoint, the API router treats the primary hotspot cache as global by default, and the `FIRMS_BBOX_MODE` environment variable is no longer used. Compose wiring and the local env file were cleaned up so there is no longer a runtime knob for mission-only FIRMS mode.

## Changes

- `backend/ingestion/space_pulse/sources/firms.py`: Removed `FIRMS_BBOX_MODE` and the mission-bbox helper path; FIRMS polling now always uses the world endpoint.
- `backend/api/routers/firms.py`: Removed `FIRMS_BBOX_MODE` handling and the separate global-live cache branch; default global requests now use the primary FIRMS cache and fall back to a live world fetch when needed.
- `backend/api/tests/test_firms_router.py`: Updated router tests to reflect the new always-global cache/fallback behavior.
- `backend/ingestion/space_pulse/tests/test_firms.py`: Updated the poller test to assert the world endpoint without mode monkeypatching.
- `docker-compose.yml`: Removed `FIRMS_BBOX_MODE` from backend and space-pulse service environments.
- `.env`: Removed the now-unused `FIRMS_BBOX_MODE` entry and stale comment.

## Verification

Ran targeted backend verification on host for the modified Python components:

- `cd backend/api && uv tool run ruff check .`
- `cd backend/api && uv run python -m pytest tests/test_firms_router.py`
- `cd backend/ingestion/space_pulse && uv tool run ruff check .`

Results:

- Backend API lint passed.
- Backend API FIRMS router tests passed: `5 passed`.
- Space Pulse lint passed.
- Space Pulse FIRMS pytest could not be completed in this host environment:
  - the service-local `.venv` does not have `pytest` installed,
  - and `uv run python -m pytest tests/test_firms.py` hit an environment/toolchain blocker on Windows with Python 3.14 because `asyncpg==0.30.0` failed to build.

## Benefits

FIRMS is now globally sourced by design rather than by optional runtime configuration. That removes a misleading mode split, makes the stored hotspot dataset consistent with the frontend’s global request model, and reduces the chance of partial-world behavior caused by stale mission-scoped ingest settings.

## Issue

After FIRMS support was added to `space_pulse`, the FIRMS poll cadence was tracked only with an in-process `last_fetch` timestamp using `time.monotonic()`. That meant container restarts and rebuilds ignored the prior fetch time, so FIRMS did not respect the same Redis-backed fetch timestamp pattern used by the other space-domain sources.

## Solution

Restored Redis-backed cadence tracking for FIRMS by persisting and reading a `firms_pulse:last_fetch` key, matching the existing SatNOGS and orbital source behavior. Also restored the optional constructor signature expected by the FIRMS tests.

## Changes

- Updated `backend/ingestion/space_pulse/sources/firms.py`
  - Added Redis key support for `firms_pulse:last_fetch`.
  - Replaced in-process monotonic cadence tracking with Redis-backed timestamp reads/writes.
  - Added cooldown logging and Redis-backed error recording for FIRMS poll failures.
  - Restored optional `client` / `redis_client` constructor defaults for compatibility with tests and helper-only usage.
- Updated `backend/ingestion/space_pulse/tests/test_firms.py`
  - Added tests covering Redis last-fetch reads and writes.

## Verification

- `docker compose -f docker-compose.yml -f compose.dev.yml up -d --build sovereign-space-pulse`
- `docker compose exec sovereign-space-pulse uv tool run ruff check .`
- `docker compose exec sovereign-space-pulse uv run python -m pytest`
- Runtime validation:
  - Verified `firms_pulse:last_fetch` exists in Redis with a live TTL.
  - Verified `sovereign-space-pulse` logs show FIRMS startup followed by cooldown enforcement.

## Benefits

- FIRMS now respects persisted fetch cadence across container restarts and rebuilds.
- Space-domain sources are consistent again in how fetch timing is stored and inspected.
- The full `space_pulse` container test suite is back to passing.
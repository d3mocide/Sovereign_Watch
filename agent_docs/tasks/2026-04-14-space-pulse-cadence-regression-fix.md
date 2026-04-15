## Issue

`space_pulse` had drifted into inconsistent scheduler behavior after recent changes. FIRMS tracked cadence only in process memory, space weather intervals were not persisted in Redis, and orbital/Celestrak refreshes still used a 6-hour cadence with restart-sensitive behavior. In practice, container restarts could trigger immediate re-fetches instead of respecting the intended persisted schedule.

## Solution

Standardized the scheduler behavior across `space_pulse` by persisting fetch cadence in Redis for FIRMS and space weather, and by changing orbital/TLE refreshes to a once-per-day scheduled fetch at the configured UTC hour with Redis-backed duplicate suppression.

## Changes

- Updated `backend/ingestion/space_pulse/sources/firms.py`
  - Added Redis-backed `firms_pulse:last_fetch` cadence tracking.
  - Preserved cooldowns across restarts and rebuilds.
- Updated `backend/ingestion/space_pulse/sources/space_weather.py`
  - Added Redis-backed last-fetch keys for Kp, Aurora, and NOAA Scales.
  - Replaced in-process cadence-only logic with persisted cooldown handling.
- Updated `backend/ingestion/space_pulse/sources/orbital.py`
  - Changed Celestrak refresh cadence from every 6 hours to daily.
  - Added logic to fetch at most once per UTC day when `SPACE_TLE_FETCH_HOUR` is enabled.
  - Added Redis-backed duplicate suppression using `orbital_pulse:last_fetch`.
- Updated tests:
  - `backend/ingestion/space_pulse/tests/test_firms.py`
  - `backend/ingestion/space_pulse/tests/test_space_weather.py`
  - `backend/ingestion/space_pulse/tests/test_orbital.py`
- Updated docs:
  - `.env.example`
  - `Documentation/README.md`
  - `Documentation/pollers/Space.md`
- Updated local runtime config:
  - `.env` now restores `SPACE_TLE_FETCH_HOUR=2` for scheduled daily Celestrak refreshes.

## Verification

- `docker compose -f docker-compose.yml -f compose.dev.yml up -d --build sovereign-space-pulse`
- `docker compose exec sovereign-space-pulse uv tool run ruff check .`
- `docker compose exec sovereign-space-pulse uv run python -m pytest`
- Result: Ruff passed and all `57` `space_pulse` tests passed.
- Runtime validation:
  - Verified Redis-backed fetch keys exist for FIRMS, orbital, and space weather.
  - Verified runtime logs show orbital cooldown / scheduling behavior and space weather cooldown persistence.

## Benefits

- Prevents restart-driven re-fetch storms across `space_pulse` sources.
- Makes scheduler behavior consistent and operator-auditable through Redis fetch keys.
- Aligns Celestrak refresh behavior with the configured UTC hour and the low-change nature of TLE datasets.
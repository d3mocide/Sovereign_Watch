# 2026-03-31 - Fix AI Router Asyncpg Interval Bindings

## Issue
Analyze Regional Risk requests were failing in production with:

- asyncpg.exceptions.DataError: invalid input for query argument $1: '24 hours' ('str' object has no attribute 'days')

Root cause: interval query parameters were passed as string values (for example, "24 hours") while asyncpg expected an interval-compatible binding strategy.

## Solution
Switched AI router time-window filtering from string interval binds to integer-hour binds multiplied by a fixed SQL interval:

- now() - ($1 * interval '1 hour')

The bound value is now an integer hour count, which asyncpg handles correctly.

## Changes
- Updated regional risk evaluation queries in [backend/api/routers/ai_router.py](backend/api/routers/ai_router.py) to:
  - replace $1::interval usage with ($1 * interval '1 hour')
  - pass integer lookback_hours values to fetch/fetchrow calls
- Updated clausal chains endpoint query construction in [backend/api/routers/ai_router.py](backend/api/routers/ai_router.py) to use the same integer-hour interval pattern.

## Verification
- Ran lint:
  - cd backend/api && uv tool run ruff check routers/ai_router.py
  - Result: pass
- Ran tests:
  - cd backend/api && uv run python -m pytest
  - Result: 57 passed, 1 failed
  - Failing test: tests/test_tracks_validation.py::test_track_history_hours_exceeded (expected 400, got 503)
  - This failure is outside the modified AI router path.

## Benefits
- Fixes Analyze Regional Risk runtime failure caused by asyncpg interval binding mismatch.
- Standardizes time-window query behavior across AI router endpoints.
- Reduces risk of similar runtime errors in alternate query paths.

## Issue
The `/api/satnogs/stations` endpoint frequently returned `502 Bad Gateway` when the SatNOGS upstream API was temporarily unavailable, producing repeated error logs and poor UI resilience.

## Solution
Hardened the stations proxy endpoint with:
- short-lived upstream failure backoff,
- stale-cache fallback during upstream outages,
- structured exception handling for HTTP status vs transport errors.

## Changes
- Updated `backend/api/routers/satnogs.py`:
  - Added `CACHE_TTL_STATIONS_STALE` (1 hour) and `CACHE_TTL_STATIONS_ERROR` (60s).
  - Added Redis-backed backoff key check before upstream calls.
  - Added stale cache fallback (`satnogs:stations:all:{include_offline}:stale`) on failures.
  - Cached successful responses in both hot cache and stale cache.
  - Replaced broad exception logging with explicit `httpx.HTTPStatusError` and `httpx.HTTPError` handlers using `exc_info=True`.
  - Returned `503` during active backoff with no stale data, and `502` for direct upstream failures when no stale data exists.

## Verification
- Ran: `cd backend/api && uv tool run ruff check . && uv run python -m pytest`
- Result:
  - Ruff: `All checks passed!`
  - Pytest: `135 passed`.

## Benefits
- Reduces repeated upstream hammering during outages.
- Improves endpoint availability by serving last known good station data.
- Produces actionable logs with exception type and traceback for troubleshooting.
- Reduces noisy repeated 502 responses for transient SatNOGS network issues.

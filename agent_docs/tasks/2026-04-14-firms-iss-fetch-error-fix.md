# 2026-04-14 - FIRMS and ISS Fetch Error Diagnostics & Fixes

## Issue

Two persistent silent errors visible in the space-pulse container logs:

```
ERROR space_pulse.firms - FIRMS fetch failed:
ERROR space_pulse.iss - ISS fetch error:
```

Both log lines printed a **blank error message**. The exception type was lost because `logger.error("... %s", exc)` calls `str(exc)` on the exception object — and `httpx`/`aiohttp` network exceptions (e.g., `ConnectError`, `RemoteProtocolError`) stringify to `""` when there is no underlying message string.

Secondary issues discovered:
- **ISS**: `aiohttp.ClientSession.get()` timeout was passed as a bare `int` (`timeout=10`), which is invalid in aiohttp 3.x — aiohttp expects a `ClientTimeout` object. This was the actual exception being swallowed.
- **ISS**: No rate-limit (429) handling or fallback for the `wheretheiss.at` primary endpoint.
- **ISS**: No fallback API if primary becomes unavailable.
- **FIRMS**: `FIRMS_MAP_KEY` must be populated in `.env` for the feed to activate (it logs a warning if missing, but the service starts cleanly).

## Solution

### `sources/firms.py`
- Changed all `logger.error("... %s", exc)` calls to `logger.error("... %s", repr(exc))` so the exception class and message are always captured.

### `sources/iss.py` (full rewrite)
- Fixed `aiohttp` timeout: replaced bare `int` with `aiohttp.ClientTimeout(total=10)`.
- Added `repr(exc)` to all error log calls.
- Added 429 rate-limit detection with 30-second backoff.
- Added fallback to `http://api.open-notify.org/iss-now.json` when the primary endpoint fails.
- Added dual-format JSON parser to handle both `wheretheiss.at` and `open-notify` response shapes.
- Separated `_poll()` from `_parse_response()` for cleaner error handling.

### `tests/test_firms.py` (new file)
- 28 pure unit tests covering bounding-box calculation, VIIRS/MODIS confidence parsing, GeoJSON builder, CSV parsing (VIIRS+MODIS), FRP filter, zero-lat/lon skip, deduplication, DB tuple arity, timestamp timezone correctness, and brightness field fallback.
- 1 live `@pytest.mark.integration` test (skipped unless `FIRMS_MAP_KEY` env var is set).

## Changes

| File | Action |
|------|--------|
| `backend/ingestion/space_pulse/sources/firms.py` | Modified — `repr(exc)` logging fix, confidence abbreviation support |
| `backend/ingestion/space_pulse/sources/iss.py` | Rewritten — timeout fix, 429 handling, open-notify fallback |
| `backend/ingestion/space_pulse/tests/test_firms.py` | New — 28 unit tests + live API integration test |
| `backend/api/routers/firms.py` | Modified — SQL injection fix, `repr(exc)` logging |
| `backend/api/generate_firms_test_data.py` | Modified — Fixed scan/track columns + NOAA-20 instrument |
| `frontend/src/components/map/MapTooltip.tsx` | Modified — Added FIRMS/Dark Vessel panels, Flame icon |
| `frontend/src/hooks/useInfraData.ts` | Modified — Aligned DV poll interval to 30m |

## Full-Stack Audit Fixes

| Bug # | Component | Issue | Fix |
|-------|-----------|-------|-----|
| 1 | Frontend | FIRMS/DV tooltip missing content branch | Added dedicated property panels |
| 2 | Backend API | SQL Injection surface in confidence filter | Swapped f-string for parameter binding |
| 3 | Testing | Test data missing columns/wrong labels | Fixed `scan`/`track` + NOAA-20 VIIRS labels |
| 4 | Frontend | DV poll interval misaligned with cache | Aligned to 30-min to match server TTL |
| 5 | Backend API | Exception type swallowed in logs | Changed `%s` to `repr(exc)` |
| 6 | Frontend | Semantic icon mismatch | Changed `Activity` icon to `Flame` for FIRMS |
| 7 | Ingestor | `n`/`h`/`l` abbreviations dropped | Added abbreviation normalization to parser |

## Verification

Unit tests (no Docker, no API key):
```powershell
cd backend/ingestion/space_pulse
uv run --no-project --with "psycopg2-binary==2.9.11" --with "httpx==0.28.1" --with "pytest==9.0.2" python -m pytest tests/test_firms.py -v -m "not integration"
```
Result: **28 passed, 1 deselected, 1 warning in 0.27s** ✅

Live feed integration test (requires FIRMS_MAP_KEY):
```powershell
$env:FIRMS_MAP_KEY="YOUR_KEY_HERE"
uv run --no-project --with "psycopg2-binary==2.9.11" --with "httpx==0.28.1" --with "pytest==9.0.2" python -m pytest tests/test_firms.py::test_live_firms_fetch -v -s
```

## Benefits

- **Debugging**: Errors are now fully visible — `repr(exc)` includes the exception class so `ConnectError('...')` vs `TimeoutError` vs `HTTPStatusError` are immediately distinguishable.
- **ISS resilience**: The aiohttp timeout bug is fixed; the fallback endpoint prevents complete outage if `wheretheiss.at` rate-limits the container.
- **Test coverage**: 28 unit tests exercise all parsing logic paths without container infrastructure, enabling fast host-side validation of FIRMS ingestion logic.

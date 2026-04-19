# 2026-04-19 — Data Quality Audit: TLE Interval, Clausal Chain Null-Coord, UTC Deprecations

## Issue

Deep audit of clausal chains, data normalization, and data accuracy surfaced three genuine bugs:

1. **TLE fetch interval mismatch** (`orbital.py`): Docstring stated "every 6 hours" but default scheduling was `fetch_hour=2` (daily at 2am UTC), giving 24-hour-old TLEs for decaying or high-eccentricity orbits. `fetch_interval_hours=24` only applied when `fetch_hour=-1`, which was never the default.

2. **False LOCATION_TRANSITION at (0, 0)** (`state_change_evaluator.py`): `safe_float(new_point.get("lat"))` returns `None` (not `0.0`) for missing coordinates, but the return value was typed as `float` in context and passed directly to `_detect_h3_boundary_cross`. If a track had no coordinates, `h3.latlng_to_cell(None, None, ...)` raised (caught silently), OR if `safe_float` returned `0.0` on a weird input, a spurious LOCATION_TRANSITION event pointing to the Gulf of Guinea (0°, 0°) would be emitted.

3. **`datetime.utcnow()` deprecated** (`maritime_poller/service.py`, `orbital.py`): Python 3.12 deprecates `datetime.utcnow()` and will remove it. 9 call sites in maritime_poller, 1 in orbital propagation_loop. The `isoformat() + "Z"` pattern also produces invalid RFC3339 (`+00:00Z`) when called on a timezone-aware datetime.

## Solution

### TLE Fetch Interval
- Changed `fetch_hour` default from `"2"` to `"-1"` (disabling daily-hour mode)
- Changed `fetch_interval_hours` from hardcoded `24` to `int(os.getenv("SPACE_TLE_FETCH_INTERVAL_HOURS", "6"))`
- Result: TLEs now refresh every 6 hours by default via interval-cooldown mode
- Operators can set `SPACE_TLE_FETCH_HOUR=2` to revert to daily-at-2am behavior
- Also replaced `datetime.utcnow()` in propagation_loop with `datetime.now(UTC).replace(tzinfo=None)` (keeping naive datetime for SGP4 jday() compatibility)

### Null Coordinate Guard
- Changed `new_lat = safe_float(new_point.get("lat"))` and `new_lon` to `default=None` (was already the default but now explicit)
- Added `if new_lat is not None and new_lon is not None` guard on the H3 boundary check
- Entities with missing coordinates skip all spatial checks cleanly; non-spatial checks (type change, speed, course, battery) still run

### UTC Deprecations (Maritime)
- Added `timezone` to `from datetime import` in `maritime_poller/service.py`
- Replaced all 9 `datetime.utcnow()` calls with `datetime.now(timezone.utc)`
- Fixed all `.isoformat() + "Z"` → `.isoformat().replace("+00:00", "Z")` (2 sites) to produce valid RFC3339 `Z`-suffix strings

## Changes

| File | Change |
|------|--------|
| `backend/ingestion/space_pulse/sources/orbital.py` | `fetch_hour=-1` default, `fetch_interval_hours=6` via env, `datetime.utcnow()` → `datetime.now(UTC)` |
| `backend/ingestion/tak_clausalizer/state_change_evaluator.py` | Explicit `default=None` for lat/lon, `None` guard before H3 boundary check |
| `backend/ingestion/maritime_poller/service.py` | Added `timezone` import, 9× `utcnow()` → `now(timezone.utc)`, 2× isoformat `+Z` fix |

## Verification

- `ruff check` passes on all 3 files with no errors
- Aviation timestamp format (ms float) confirmed NOT a bug — `clause_emitter.py` heuristically detects ms vs seconds via `_MAX_TS_S` threshold and handles both correctly
- Clausal chain schema, write path, AI router query, frontend hook, and layer builder confirmed consistent with no field-name mismatches

## Benefits

- Satellite positions are now based on TLEs that are at most 6 hours old (vs up to 24h previously), significantly improving accuracy for LEO/decaying orbits
- Eliminates false LOCATION_TRANSITION intel events for tracks with missing GPS coordinates
- Maritime poller is forward-compatible with Python 3.12+ deprecation removal
- `SPACE_TLE_FETCH_INTERVAL_HOURS` env var gives operators control over TLE freshness vs Celestrak rate-limit tradeoffs

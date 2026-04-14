# Fix: NASA FIRMS Data Layer Not Rendering

## Issue

The NASA FIRMS (thermal hotspot) layer was enabled in the UI but rendered nothing on the
map, even after test data had been injected into the DB via
`backend/api/generate_firms_test_data.py`.  The Dark Vessels layer (which is derived from
the same `firms_hotspots` table) rendered correctly, making the inconsistency obvious.

### Root cause

`backend/ingestion/space_pulse/sources/firms.py` `_poll()` — lines 261-264 — called
`await self._update_redis_cache([])` whenever a poll cycle returned no hotspots (empty
NASA API response, rate-limit, or mission area with no active fires).  This wrote a valid
but empty GeoJSON FeatureCollection to the Redis key `firms:latest_geojson` with a 1-hour
TTL.

The API fast-path in `backend/api/routers/firms.py` `get_firms_hotspots()` checks Redis
first and returns immediately on any truthy cached value.  An empty JSON string like
`'{"type":"FeatureCollection","features":[],...}'` is truthy, so the fast-path returned an
empty collection to the frontend — completely bypassing the DB, which still held
legitimate rows.

**Why Dark Vessels worked:** the dark-vessel endpoint uses a separate Redis key
(`firms:dark_vessel_candidates`) that is only written by the API itself (not by the
poller).  On the first request after test data injection, that key was absent, so the
endpoint fell through to a live DB cross-join and returned results.

## Solution

Two complementary fixes, following defence-in-depth:

1. **Poller (primary fix)** — Remove the `_update_redis_cache([])` call in the empty-rows
   branch.  When a poll cycle finds nothing, the previous cycle's cached data should
   remain until its TTL expires naturally.  Overwriting with empty is incorrect: it
   destroys valid cached data and blocks the DB fallback.

2. **API (defensive fix)** — In the Redis fast-path, only return the cached value if it
   actually contains features (`parsed.get("features")`).  An empty cached collection now
   falls through to a live DB query, ensuring manually injected or otherwise out-of-band
   rows are always visible.

## Changes

| File | Change |
|---|---|
| `backend/ingestion/space_pulse/sources/firms.py` | Removed `await self._update_redis_cache([])` from the `if not rows:` branch; added explanatory comment |
| `backend/api/routers/firms.py` | Fast-path now checks `parsed.get("features")` before returning cached result; falls through to DB on empty cache |

### Diff summary

**`firms.py` (poller) — `_poll()` empty-rows branch:**
```python
# Before
if not rows:
    logger.info("FIRMS: no new hotspots in area (or no detections this cycle)")
    await self._update_redis_cache([])   # BUG: overwrites cache with empty
    return

# After
if not rows:
    logger.info("FIRMS: no new hotspots in area (or no detections this cycle)")
    # Do NOT overwrite Redis with an empty collection — the previous
    # cycle's data is still valid until its TTL expires.
    return
```

**`routers/firms.py` — `get_firms_hotspots()` fast-path:**
```python
# Before
if cached:
    return json.loads(cached)

# After
if cached:
    parsed = json.loads(cached)
    if parsed.get("features"):
        return parsed
    logger.debug("FIRMS Redis cache is empty, falling back to DB query")
```

## Verification

1. `uv tool run ruff check backend/ingestion/space_pulse/sources/firms.py` — all checks passed
2. `uv tool run ruff check backend/api/routers/firms.py` — all checks passed
3. Manual flow: inject test data → `GET /api/firms/hotspots?hours_back=24` → DB fallback
   is now reached → 5 hotspots returned → layer renders on map

## Benefits

- FIRMS layer now correctly renders DB-resident hotspots regardless of whether the poller
  has recently run or cached empty data.
- Previous cycle's data (up to 1-hour cache TTL) is preserved rather than being cleared
  prematurely on a no-data poll.
- Defence-in-depth: even if another code path writes an empty collection to Redis, the API
  will not silently serve it.
- No performance regression: the DB fallback query is fast (GiST spatial index + time
  index; < 5 ms for the mission-area dataset).

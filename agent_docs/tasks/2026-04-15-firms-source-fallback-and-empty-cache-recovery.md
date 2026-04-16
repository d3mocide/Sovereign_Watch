# FIRMS Source Fallback And Empty Cache Recovery

## Issue

The FIRMS layer was rendering an implausibly small dataset because the runtime was pinned to a single upstream source, `VIIRS_SNPP_NRT`, whose `world/1` feed was returning zero rows at the time of inspection. The frontend and backend then fell back to a sparse Timescale window from the prior day. After the always-global refactor, a second runtime bug also appeared: if the Redis hotspot cache was empty but the last-fetch cooldown key still existed, the poller could try to bypass cooldown repeatedly and hammer the empty upstream feed.

## Solution

Made FIRMS ingestion and live fallback resilient to empty single-source feeds by supporting comma-separated multi-source configuration and defaulting to the higher-coverage VIIRS feeds together. Also changed the startup recovery behavior so an empty-cache cooldown bypass only happens once, which preserves immediate recovery after restart without creating a tight retry loop when upstream returns no rows.

## Changes

- `backend/ingestion/space_pulse/sources/firms.py`
  - Added comma-separated FIRMS source parsing with a multi-source default.
  - Polls each configured source in sequence and aggregates parsed hotspots across sources.
  - Writes the actual per-row source into Timescale and GeoJSON payloads.
  - Added Redis cache inspection and one-shot empty-cache recovery logic to avoid repeated immediate retries.
- `backend/api/routers/firms.py`
  - Added matching FIRMS source-list parsing for live global fallback requests.
  - Live global fetch now iterates configured sources instead of relying on one product.
- `backend/ingestion/space_pulse/tests/test_firms.py`
  - Updated unit coverage for source parsing, cache-empty detection, and the new world-endpoint behavior.
  - Removed stale mission-bbox helper references from the test file.
- `docker-compose.yml`
  - Changed the FIRMS source default for backend and Space Pulse to `VIIRS_NOAA20_NRT,VIIRS_NOAA21_NRT,VIIRS_SNPP_NRT`.
- `.env`
  - Updated the local FIRMS source setting to the same multi-source default for immediate runtime parity.
- `.env.example`
  - Updated the documented FIRMS source default and clarified that the setting accepts a comma-separated list.

## Verification

- `cd backend/api && uv tool run ruff check routers/firms.py tests/test_firms_router.py`
- `cd backend/api && uv run python -m pytest tests/test_firms_router.py`
- `cd backend/ingestion/space_pulse && uv tool run ruff check sources/firms.py tests/test_firms.py`
- `docker compose -f docker-compose.yml -f compose.dev.yml up -d --build sovereign-space-pulse sovereign-backend`
- Runtime checks after rebuild:
  - Redis cache: `firms:latest_geojson` exists and has non-zero size.
  - Timescale query: FIRMS 24-hour coverage increased from 102 rows in a small Venezuela-only window to 1108 rows spanning a much wider lat/lon range.

## Benefits

- FIRMS no longer collapses to a stale, tiny dataset when one upstream product is temporarily empty.
- Restart recovery can repopulate an empty cache immediately without hammering NASA in a tight loop.
- Live API fallback and poller ingest now follow the same multi-source contract, which reduces divergence between cache-backed and cache-miss behavior.

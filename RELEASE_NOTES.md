# Release - v1.0.6 - Thermal Watch

## Summary

v1.0.6 delivers the FIRMS thermal intelligence layer and dark-vessel anomaly engine to operators, resolves the two hold items that blocked the v1.0.6 candidate, and closes out a sweep of backend ingestion reliability fixes. The ISS ground-track now updates live in the animation loop and renders cleanly after container restarts. Fire hotspot data is now sourced globally by design, while the thermal layer starts off by default to reduce initial map noise.

## Key Features

- **NRT NASA FIRMS Thermal Layer** — VIIRS/MODIS thermal infrared hotspots on the tactical map with FRP-scaled radii and confidence-coded colors.
- **Dark Vessel Anomaly Detection** — Backend engine cross-references FIRMS heat signatures against AIS vessel positions. Vessel-scale hotspots with no AIS broadcast within 5nm/2h are surfaced as anomaly candidates.
- **FIRMS Source Health Visibility** — Operations surfaces now show compact per-source FIRMS ingest summaries so NOAA-20, NOAA-21, and SNPP drift can be diagnosed without container log inspection.
- **Live ISS Ground Track** — WebSocket-delivered positions now normalise Unix integer timestamps to ISO-8601 on arrival, keeping the orbital trail current in the animation loop.
- **ISS Track Gap Detection** — Consecutive positions separated by >10 minutes start a new path segment, eliminating the distorted line artifact after container restarts.

## Bug Fixes

- FIRMS thermal visibility now defaults to `false`, while dark-vessel anomalies remain enabled and FIRMS coverage stays global.
- FIRMS poller health now distinguishes healthy, empty, and failed upstream source responses instead of silently reporting partial upstream degradation as healthy.
- ISS live-track timestamps normalised at the hook boundary (`useISSTracker`) so all sources (WebSocket, REST, DB) produce trail points that pass the `buildISSLayer` filter.
- ISS track gap rendering fixed in `splitTrackAtAntimeridian`.
- SatNOGS pagination loop indentation corrected; PeeringDB IXP coordinates recovered from facility centroids; IODA Nominatim geocoder restored.

## Technical Details

- TimescaleDB migration **V004** adds `firms_hotspots` hypertable and `dark_vessel_candidates` table.
- `space_pulse` cadence policy: daily TLE refresh gated on UTC hour, FIRMS/space-weather cadence persisted in Redis across restarts.
- FIRMS no longer supports a mission-vs-global ingest mode; the poller always uses the NASA world endpoint and `FIRMS_BBOX_MODE` is no longer part of the runtime configuration.
- FIRMS source-cycle snapshots are now published to Redis under `firms:source_status` and surfaced through `/api/config/poller-health`.
- No breaking API or schema changes, no new required environment variables.

## Verification

- Frontend: `pnpm run lint` ✅ · `pnpm run typecheck` ✅ · `pnpm run test` ✅ (18/18 files, 268/268 tests)
- Backend API: `uv tool run ruff check . && uv run python -m pytest tests/test_firms_router.py tests/test_system_router.py` ✅ (7 targeted tests)
- Targeted poller verification: `space_pulse` lint ✅; host `space_pulse` pytest remains blocked by the known Windows/Python 3.14 `asyncpg==0.30.0` build issue.

## Upgrade Instructions

```bash
git pull origin main
docker compose pull
docker compose up -d --build
```

TimescaleDB migration V004 runs automatically on backend startup.

**SITREP Status: [GO]**

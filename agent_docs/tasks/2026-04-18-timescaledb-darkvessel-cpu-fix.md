# TimescaleDB CPU Bottleneck Resolution

**Date:** 2026-04-18

## Issue
- The `sovereign-timescaledb` container sustained >700% CPU utilization.
- Investigation traced the root cause to the `/api/firms/dark-vessels` endpoint passing the raw `world-countries.json` geometry string array dynamically to PostgreSQL. 
- PostGIS was forced to un-nest, parse into complex polygons, and compute Cartesian intersections without spatial indexes on every query execution.

## Solution
- **Database Schema**: Introduced `V005__world_land_polygons.sql` to permanently retain standard geographical bounds inside a dedicated `world_land_polygons` table protected by a `GIST` geometry index.
- **Backend Optimization**: Refactored `backend/api/main.py` lifespan to lazily pre-load all polygons using a bulk `executemany` statement upon first boot if the database table is empty.
- **Query Streamlining**: Removed the un-nested `$10` parameter from the `firms.py` router query and mapped the `maritime_hotspots` CTE directly to the new `world_land_polygons` geometries.

## Verification
- Backpatched tests in `test_firms_router.py` to assert against the updated query schema.
- Confirmed test suite (`uv run python -m pytest`) returns 100% green.
- Active query `pg_stat_activity` sweeps confirmed runaway intersections disappeared entirely and host CPU flatlined back to near-idle.

## Benefits
- Significant runtime efficiency gained for the system's Dark Vessel intelligence logic.
- Container stability and responsiveness returned to mission-ready tolerances.

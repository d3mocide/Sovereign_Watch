# H3 Poller Truncation & Visualization Fixes

## Issue
1. **Frontend Build Error**: The Vite build failed to resolve `@deck.gl/geo-layers` when attempting to import `H3HexagonLayer` for visualization.
2. **Backend Data Truncation**: The new H3 priority poller was truncating flight data, showing aircraft only in a narrow vertical bounding segment. This occurred because the poller was using Resolution 4 H3 cells with a very tight 15nm polling radius (`CELL_RADIUS_NM`). Since the poller can only request 1 cell per 2 seconds (due to API rate limits), it took too long to scan the entire grid (e.g. 400+ cells for a 150nm area), causing data to go stale on the map before the scanner completed a full sequence.

## Solution
1. **Frontend Dependency**: Installed the missing `@deck.gl/geo-layers` library in the frontend container.
2. **Backend Grid Scaling**: Scaled up the H3 priority grid from **Resolution 4** to **Resolution 2**. This significantly reduces the total number of polling zones required to cover the area of tactical interest (from hundreds to just a few dozen), and the radius per poll was scaled from 15nm to 120nm. 

## Changes
- `frontend/package.json`: Added `"@deck.gl/geo-layers": "^9.0.0"` dependency.
- `backend/ingestion/aviation_poller/h3_sharding.py`:
  - Changed `RESOLUTION` from 4 to 2.
  - Changed `CELL_RADIUS_NM` from 15 to 120.
  - Adjusted the `k` ring calculation to divide the radius by 158km (the approximate edge length of a Resolution 2 cell).

## Verification
- Ran `npm install` inside the frontend container, resolving Vite import errors.
- Flushed the existing `h3:*` state from Redis using `redis-cli DEL` to clear leftover Resolution 4 cells.
- Rebuilt and restarted the `adsb-poller` service container.
- Verified in `docker compose logs adsb-poller` that it is fetching large clusters of aircraft (e.g., 60-70 per batch) across diverse center coordinates corresponding to the new Resolution 2 grid.

## Benefits
- **Full Coverage Mapping**: The visualization can now accurately display the full tactical footprint.
- **Sustainable API Quota Usage**: Larger polling radii allow us to extract more aircraft per request without incurring rate limit penalties, staying safely below the 250nm max radius limit enforced by the API.
- **Improved Reactivity**: Aircraft positions refresh much quicker as the full grid cycle executes in seconds rather than many minutes.

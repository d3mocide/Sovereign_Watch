# Release - v0.55.0 - NDBC Ocean Buoy Intelligence Layer

This release integrates real-time NOAA NDBC ocean buoy observations into SovereignWatch as a first-class geospatial intelligence layer. Operators now get sea-state baseline context, water temperature, and wind telemetry directly on the tactical map and sidebar, establishing the environmental foundation needed for Phase 3 vessel risk and anomaly detection workflows.

### Key Features

- **Real-Time NDBC Polling**: Infra poller now fetches latest buoy observations every 15 minutes with cache-aware request handling.
- **Operational Buoy API**: New `/api/buoys/latest` endpoint serves buoy observations using Redis for fast global views and PostGIS for viewport-specific queries.
- **Buoy Layer Rendering**: Added Deck.gl buoy circles with radius mapped to wave height and color mapped to water temperature.
- **Tooltip and Sidebar Integration**: Hover and click interactions now route buoy entities into dedicated buoy telemetry views.
- **Map Control Integration**: Added buoy visibility controls under Environmental filters with synchronized tactical map behavior.

### Technical Details

- **Ingestion and Parsing**:
	- Added `parse_ndbc_latest_obs()` parsing pipeline for space-delimited NOAA payloads.
	- Extracts buoy ID, position, timestamp, and meteorological/oceanographic fields.
	- Filters invalid coordinates and rows with no usable measurements.
- **Database Layer**:
	- Added `ndbc_obs` hypertable with 1-day chunking and 30-day retention.
	- Added compression policy optimized by buoy ID and descending timestamp.
	- Added geospatial and lookup indexes for viewport and latest-station retrieval paths.
	- Added `ndbc_hourly_baseline` continuous aggregate for hourly mean/stddev baseline support.
- **Frontend Data and Rendering**:
	- Added `useNDBCBuoys()` hook with 500ms bbox debounce and 15-minute auto-refresh.
	- Added `buildNDBCLayer()` scatterplot with wave-height sizing and water-temperature color scale.
	- Added buoy entity classification and hover-card routing to prevent fallback avionics tooltips.
	- Added buoy telemetry fields in right sidebar (wave height, water temp, wind speed/direction, air temp, pressure).
- **Reliability Fixes**:
	- Fixed sticky buoy tooltip state on hover exit by clearing buoy hover entity on leave.
	- Fixed tooltip type fallback so buoy hovers are consistently rendered as buoy, not avionics.

### Upgrade Instructions

To upgrade your local or remote instance to v0.55.0:

1. Pull the latest code:
	 git pull origin main
2. Rebuild and restart services:
	 docker compose up -d --build
3. Optional frontend image rebuild if UI assets appear stale:
	 docker compose build frontend

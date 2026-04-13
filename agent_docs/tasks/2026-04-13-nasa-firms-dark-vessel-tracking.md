# NASA FIRMS Thermal Hotspot Ingestion + Dark Vessel Detection

## Issue

**GAP-03** (Missing maritime threat feeds) and **GAP-04** (No dark fleet / AIS-off detection)
identified in `agent_docs/research/phantom-risk-gap-analysis.md` as Critical severity.

The most consequential blind spot: vessels supporting sanctioned state actors (Iranian oil,
Russian crude transfers) routinely disable their AIS transponders to evade tracking. Sovereign
Watch had zero mechanism to detect a vessel that "went dark." A vessel that stopped broadcasting
simply disappeared from the track feed with no anomaly raised.

NASA FIRMS (Fire Information for Resource Management System) provides VIIRS/MODIS satellite
thermal infrared data that detects vessel engine heat signatures regardless of AIS status.
Cross-referencing FIRMS hotspots against AIS tracks yields dark vessel candidates.

## Solution

Integrate NASA FIRMS NRT API as a new source inside the existing `space_pulse` container
(VIIRS is a NASA satellite instrument — same domain), write hotspots to TimescaleDB, expose
them via two new REST endpoints, and render them on the map via two new Deck.gl layers.

Dark vessel detection is implemented as an on-demand PostGIS query that cross-references
recent FIRMS hotspots against AIS tracks in the same area and time window. Results are cached
in Redis for 30 minutes to avoid repeated expensive cross-joins.

No new container was required; FIRMS follows the same direct DB write + Redis cache pattern
as `space_weather.py`.

## Changes

### Ingestion (`backend/ingestion/space_pulse/`)

- **`sources/firms.py`** (new): `FIRMSSource` class.
  - Polls `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{source}/{bbox}/{days}`
    every `FIRMS_FETCH_INTERVAL_M` minutes (default 10).
  - Bounding box computed from `CENTER_LAT/LON/COVERAGE_RADIUS_NM` + 25% padding.
  - Parses CSV response for both VIIRS (bright_ti4, confidence string) and MODIS
    (brightness, 0-100 integer confidence) formats.
  - Filters low-confidence detections and FRP < `FIRMS_MIN_FRP` (default 0.5 MW).
  - Deduplicates in-process via `(acq_date, acq_time, lat, lon, satellite)` key set.
  - Persists to `firms_hotspots` via `psycopg2.extras.execute_values` with
    `ON CONFLICT DO NOTHING` on the unique dedup index.
  - Caches latest GeoJSON in Redis key `firms:latest_geojson` (TTL 1 hour).
  - If `FIRMS_MAP_KEY` is absent, logs a warning and exits gracefully (no crash).

- **`service.py`** (modified):
  - Imports `FIRMSSource`.
  - Adds `FIRMS_FETCH_INTERVAL_M` env var read.
  - Registers `FIRMSSource(redis_client, db_url, fetch_interval_m)` in sources list.
  - Updated module docstring.

### Database (`backend/db/migrations/`)

- **`V004__firms_dark_vessel.sql`** (new):
  - `firms_hotspots` hypertable (6-hour chunks, 3-day retention).
    Fields: time, lat/lon/geom, brightness, frp, confidence, satellite, instrument,
    source, daynight, scan, track, acq_date, acq_time.
    Indexes: GIST spatial, unique dedup, FRP/confidence composite.
  - `dark_vessel_candidates` plain table (long-term forensic retention).
    Fields: detected_at, hotspot lat/lon/geom, brightness/frp/confidence/satellite,
    nearest AIS MMSI + distance, risk_score/severity, dismissed flag.
    Indexes: detected_at DESC, GIST spatial, risk_score DESC (excluding dismissed).

### API (`backend/api/`)

- **`routers/firms.py`** (new):
  - `GET /api/firms/hotspots` — Returns FIRMS hotspots as GeoJSON FeatureCollection.
    Redis fast-path for global view; live DB query for bbox or filtered requests.
    Supports: `min_lat/max_lat/min_lon/max_lon`, `hours_back` (1-72), `min_frp`,
    `confidence` filter, `limit`.
  - `GET /api/firms/dark-vessels` — Cross-references `firms_hotspots` against `tracks`
    (AIS type `a-f-S%`) via PostGIS `ST_DWithin` + temporal window.
    Returns candidates with `risk_score` (0-1) and `risk_severity` label.
    Risk score = FRP intensity (0.40) + AIS absence magnitude (0.50) + night bonus (0.10).
    Results cached in Redis key `firms:dark_vessel_candidates` for 30 minutes.
    Supports: bbox, `hours_back`, `match_radius_nm` (default 5nm), `min_frp`,
    `ais_window_h` (±hours around acquisition), `min_risk_score`.

- **`main.py`** (modified): Imports and registers `firms.router` with `_viewer_auth`.

- **`services/risk_taxonomy.py`** (modified):
  - `SEVERITY_THRESHOLDS` — added `"firms"` [0.20, 0.45, 0.75] and
    `"dark_vessel"` [0.15, 0.40, 0.70] domains.
  - `DECAY_HALF_LIFE_HOURS` — added `"firms": 2.0` and `"dark_vessel": 6.0`.
  - `SOURCE_CONFIDENCE` — added `"VIIRS_SNPP_NRT": 0.92`,
    `"VIIRS_NOAA20_NRT": 0.90`, `"MODIS_NRT": 0.78`.

### Frontend (`frontend/src/`)

- **`layers/buildFIRMSLayer.ts`** (new):
  - `ScatterplotLayer` at Tier 4 / `depthBias: -92.0`.
  - Radius proportional to FRP (6 km base, +1.2 km/MW, max 60 km).
  - Fill colour encodes confidence × day/night:
    night+high → crimson, night+nominal → orange-red,
    day+high → amber, day+nominal → yellow-orange, low → grey.
  - Hover sets `hoveredInfra`; click sets `selectedInfra`.

- **`layers/buildDarkVesselLayer.ts`** (new):
  - Two `ScatterplotLayer`s at Tier 5 / `depthBias: -108.0`.
  - Outer alert ring: stroked-only, radius 12–80 km based on `risk_score`.
    Colour: CRITICAL=scarlet, HIGH=orange-red, MEDIUM=amber, LOW=grey.
  - Inner dot: filled, pick target for hover/click handlers.

- **`layers/composition.ts`** (modified):
  - Imports `buildFIRMSLayer` and `buildDarkVesselLayer`.
  - Adds `firmsData` and `darkVesselData` to `LayerCompositionOptions`.
  - Calls `buildFIRMSLayer` after NDBC buoys; `buildDarkVesselLayer` after jamming layer.

- **`types.ts`** (modified):
  - `MapFilters` — added `showFIRMS?: boolean` and `showDarkVessels?: boolean`.
  - `FIRMSHotspotProperties` interface (new).
  - `DarkVesselProperties` interface (new).

### Infrastructure

- **`docker-compose.yml`** (modified):
  - `sovereign-space-pulse` service gains FIRMS env vars:
    `FIRMS_MAP_KEY`, `FIRMS_SOURCE`, `FIRMS_FETCH_INTERVAL_M`, `FIRMS_DAYS_BACK`,
    `FIRMS_MIN_FRP`, `CENTER_LAT`, `CENTER_LON`, `COVERAGE_RADIUS_NM`.

- **`.env.example`** (modified):
  - Added `FIRMS_MAP_KEY` (blank default, free key from FIRMS portal),
    `FIRMS_SOURCE`, `FIRMS_FETCH_INTERVAL_M`, `FIRMS_DAYS_BACK`, `FIRMS_MIN_FRP`.

## Verification

```
backend/ingestion/space_pulse  uv tool run ruff check .  → All checks passed
backend/api                    uv tool run ruff check .  → All checks passed
backend/ingestion/space_pulse  uv run python -m pytest   → 15 passed
backend/api                    uv run python -m pytest   → 133 passed, 1 warning
frontend                       pnpm typecheck/lint        → node_modules not installed
                                                            on host; pre-existing
                                                            environment limitation.
                                                            All errors are identical
                                                            to pre-existing files.
```

## Benefits

- Closes **GAP-04** (dark fleet / AIS-off detection): thermal signatures from vessel
  engines now cross-referenced against AIS tracks. Vessels with heat signatures but no
  AIS broadcast within 5nm are surfaced as dark vessel candidates with a scored risk label.
- Closes **GAP-03** partial: VIIRS satellite feed from FIRMS added to maritime
  threat intelligence layer.
- Zero new containers: FIRMS integrates cleanly into `space_pulse` following the
  `SpaceWeatherSource` direct-DB-write pattern.
- API follows established Redis fast-path + DB fallback pattern (same as `/api/buoys/latest`).
- Risk taxonomy extended with domain-tuned thresholds and decay half-lives for FIRMS
  and dark vessel signals, ready for `escalation_detector.py` integration.
- Frontend layers follow z-ordering rules: FIRMS at Tier 4 (-92), dark vessel at Tier 5 (-108).

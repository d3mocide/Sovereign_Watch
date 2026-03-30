# Sovereign Watch — Advanced Geospatial Data Layers Implementation Plan

## Context

The d3FRAG Networks research document provides a comprehensive architecture evaluation for integrating five core intelligence data sources (NDBC ocean buoys, NGA maritime safety, NGA SMAPS jamming zones, NASA VIIRS satellite thermal, FAA NOTAMs) into Sovereign Watch. Your current implementation has a strong foundation:

- **Implemented domains**: Aircraft (ADS-B + OpenSky), Maritime AIS (AISStream), Orbital (Celestrak TLEs + SatNOGS), RF Infrastructure, Internet Infrastructure, GDELT news intelligence
- **Architecture gaps**: No oceanographic data, no proactive maritime threat intelligence (piracy/safety), no satellite thermal detection, no NOTAM ingestion, incomplete SMAPS jamming zone integration

The research document recommends a **sidecar architecture** where alternative sources run on separate Redpanda topics without replacing primaries — this aligns perfectly with your existing multi-source arbitration patterns (MultiSourcePoller for aviation, AISStream for maritime).

**Strategic alignment**: The research emphasizes data sovereignty (no commercial APIs), raw sensor telemetry (not model output), and cross-domain fusion queries. Your current stack (Jetson Nano edge, FastAPI/Redpanda/TimescaleDB/Deck.gl 9) matches the constraints exactly.

## Phase 1: Priority Assessment & Quick Wins

### Immediate Value (Weeks 1–2)

**Highest Priority — NDBC + NGA SMAPS (Maritime Baseline)**
- **NDBC** adds real-time sea state context (wave height WVHT, water temp WTMP, wind WSPD/WDIR) — critical for AIS dropout disambiguation (research section 3)
- **NGA SMAPS** adds piracy/threat spatial intelligence — currently missing entirely
- Both have straightforward HTTP APIs with no authentication
- Deck.gl implementation pattern already proven (ScatterplotLayer in your aurora/jamming/gdelt layers)
- **Effort**: ~25–30 hrs for both pipelines + dual layer rendering

**Lower Priority — FAA NOTAMs Phase 1 (AviationWeather.gov REST)**
- Your `holding_patterns` layer shows framework is ready
- Immediate REST API (no JMS subscription delay)
- Complements existing ADS-B layer
- **Effort**: ~15–20 hrs for poller + layer

**Deferred — VIIRS/FIRMS, SMAPS Advanced, EOG VBD**
- Higher integration complexity (NASA authentication, NetCDF parsing, IMAP gateway)
- Better suited for Phase 2 after NDBC/SMAPS foundation is solid
- Research recommends ~40+ hrs for VIIRS alone

---

## Phase 2: Detailed Implementation Plan

### 1. NDBC Ocean Buoy Layer (Primary)

**Research guidance**: Section 3 — primary source via AsyncNdbcApi, 30-min polling cadence, H3 cell partitioning for anomaly detection

#### Backend Integration (`backend/ingestion/ndbc_pulse.py`)

```
New ingestion service structure:
├── ndbc_pulse.py                    # Main poller (async HTTP to latest_obs.txt)
├── sources/
│   ├── ndbc_api.py                  # AsyncNdbcApi wrapper + ETag caching
│   └── ndbc_parser.py               # TSV → BuoyObservation model
├── processors/
│   └── buoy_anomaly_detector.py     # 30-day rolling mean, Z-score flagging
└── tests/
    └── test_ndbc_*.py

Data flow:
  HTTP GET latest_obs.txt (5-min refresh, ETag cache)
    → Parse TSV whitespace-delimited
    → BuoyObservation protobuf (lat, lon, WVHT, WTMP, WSPD, WDIR, GST, DPD, PRES)
    → Kafka topic `sw.ndbc.buoy`
    → TimescaleDB `ndbc_obs` hypertable (partitioned: time + H3 res5)
    → Continuous aggregate: 30-day rolling mean → anomaly Z-score flags
```

**Database schema additions** (`backend/db/init.sql`):

```sql
-- NDBC buoy observation hypertable
CREATE TABLE IF NOT EXISTS ndbc_obs (
  time           TIMESTAMPTZ NOT NULL,
  buoy_id        TEXT NOT NULL,
  geom           GEOMETRY(Point, 4326) NOT NULL,
  wvht_meters    FLOAT,           -- Significant wave height
  wtmp_celsius   FLOAT,           -- Sea surface temperature
  wspd_ms        FLOAT,           -- Wind speed
  wdir_degrees   FLOAT,           -- Wind direction
  gst_ms         FLOAT,           -- Gust speed
  dpd_seconds    FLOAT,           -- Dominant wave period
  pres_hpa       FLOAT,           -- Atmospheric pressure
  h3_res5        TEXT,            -- H3 cell (for spatial partitioning)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable(
  'ndbc_obs', 'time',
  if_not_exists => TRUE
);

CREATE INDEX ndbc_geom_idx ON ndbc_obs USING GIST (geom);
CREATE INDEX ndbc_buoy_id_idx ON ndbc_obs (buoy_id, time DESC);
CREATE INDEX ndbc_h3_idx ON ndbc_obs (h3_res5);

-- Continuous aggregate: 30-day rolling mean + stddev per buoy
CREATE MATERIALIZED VIEW IF NOT EXISTS ndbc_anomaly_baseline AS
SELECT
  buoy_id,
  time_bucket('1 hour', time) AS hour,
  avg(wvht_meters) AS wvht_mean,
  stddev(wvht_meters) AS wvht_stddev,
  avg(wtmp_celsius) AS wtmp_mean,
  stddev(wtmp_celsius) AS wtmp_stddev,
  FIRST(geom, time) AS geom
FROM ndbc_obs
WHERE time > NOW() - INTERVAL '30 days'
GROUP BY buoy_id, time_bucket('1 hour', time)
WITH DATA;

-- Retention policy: keep only latest 30 days
SELECT add_retention_policy('ndbc_obs', INTERVAL '30 days', if_not_exists => TRUE);
```

**Poller configuration** (`backend/ingestion/ndbc_pulse.py`):

- Polling interval: 15 minutes (research recommends 30-min, but 15 aligns with your GDELT refresh cadence)
- HTTP caching: ETag / If-Modified-Since (latest_obs.txt rarely changes within 5 min)
- Bounding box filtering: Optional (download full global, or subset to current tracked vessel H3 clusters for bandwidth conservation on Jetson)
- Error handling: Exponential backoff on 5xx, skip on 404 (indicates maintenance window)

---

### 2. NGA SMAPS Piracy + Maritime Safety Layer (Primary)

**Research guidance**: Section 4 — weekly shapefile download, geopandas SHP parsing, nav warnings regex extraction

#### Backend Integration (`backend/ingestion/nga_msi_pulse.py`)

```
Structure:
├── nga_msi_pulse.py                 # Main poller (Shapefile download + geopandas)
├── sources/
│   ├── nga_smaps_downloader.py       # ZIP download, zipfile extraction
│   ├── nga_nav_warnings_parser.py   # Regex coordinate extraction from narrative text
│   └── smaps_shapefile_parser.py     # geopandas GeoDataFrame → GeoJSON
├── processors/
│   └── threat_correlation.py        # Cross-reference SMAPS with AIS tracks
└── tests/
    └── test_nga_*.py

Data flow:
  HTTP GET msi.nga.mil/smaps_shapefile.zip (15:00 ET weekdays)
    → Decompress ZIP
    → Parse .shp with geopandas (WGS84 EPSG:4326 guaranteed)
    → smaps_incidents table (point geometries for attack locations)
    → Separate nav_warnings poll (msi.nga.mil/api/publications/)
    → Regex lat/lon extraction from narrative → nav_warnings table
    → Kafka topic `sw.nga.SMAPS` + `sw.nga.navwarning`
```

**Database schema additions**:

```sql
-- NGA SMAPS piracy incidents
CREATE TABLE IF NOT EXISTS smaps_incidents (
  id              SERIAL PRIMARY KEY,
  date            DATE NOT NULL,
  geom            GEOMETRY(Point, 4326) NOT NULL,
  attack_type     TEXT NOT NULL,            -- Armed Robbery, Boarding, Hijacking, Kidnapping
  vessel_name     TEXT,
  description     TEXT,
  imb_ref         TEXT,                      -- ICC-IMB report number (for sidecar cross-ref)
  threat_score    FLOAT DEFAULT 0,           -- Computed: recency + type severity
  h3_res5         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX SMAPS_geom_idx ON smaps_incidents USING GIST (geom);
CREATE INDEX SMAPS_date_idx ON smaps_incidents (date DESC);
CREATE INDEX SMAPS_h3_idx ON smaps_incidents (h3_res5);

-- Navigational warnings (polygons or buffers around hazards)
CREATE TABLE IF NOT EXISTS nav_warnings (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  geom            GEOMETRY(Geometry, 4326) NOT NULL,  -- Point buffer or polygon
  valid_from      TIMESTAMPTZ NOT NULL,
  valid_to        TIMESTAMPTZ,
  severity        TEXT,                    -- CRITICAL, WARNING, ADVISORY
  source_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX nav_warnings_geom_idx ON nav_warnings USING GIST (geom);
CREATE INDEX nav_warnings_valid_idx ON nav_warnings (valid_from, valid_to);

-- Threat score continuous aggregate (rolling 90-day piracy density)
CREATE MATERIALIZED VIEW IF NOT EXISTS smaps_threat_density AS
SELECT
  h3_res5,
  date_trunc('day', date) AS day,
  count(*) AS incident_count,
  max(threat_score) AS max_threat,
  ST_Centroid(ST_Collect(geom)) AS cluster_center
FROM smaps_incidents
WHERE date > NOW()::DATE - INTERVAL '90 days'
GROUP BY h3_res5, date_trunc('day', date)
WITH DATA;
```

**Poller parameters**:
- Schedule: 15:00 ET (NGA typically publishes 14:00–15:00 ET, weekdays only)
- Shapefile URL: `https://msi.nga.mil/api/public/smaps_shapefiles/latest.zip`
- Field mapping: lat/lon → geom, `type` → attack_type, `date` → date (convert to DATE type)
- Nav warnings: Secondary poll of RSS feed or manual parsing of `msi.nga.mil/publications/`

---

### 3. SMAPS Jamming Zone Layer (Enhanced from Current)

**Current state**: Your `jamming_analyzer` detects ADS-B jamming *evidence* (NIC/NACp degradation). Research recommends *proactive* zone ingestion.

**Research guidance**: Section 5 — MSCI RSS/IMAP gateway, NLP coordinate extraction, critical alerts bypass database

#### Enhancement Path (Lower Priority — Phase 2)

For MVP, keep your reactive jamming detector but add:
- MARAD RSS poller (simpler than full SMAPS IMAP gateway)
- Separate `sw.marad.advisory` topic
- GPS jamming zone visualization (PolygonLayer with pulsing opacity, research section 5.3)

```sql
-- Advisory zones (GPS jamming, sanctions, etc.)
CREATE TABLE IF NOT EXISTS maritime_advisories (
  id              SERIAL PRIMARY KEY,
  type            TEXT NOT NULL,            -- GPS_JAMMING, SANCTIONS, PORT_CLOSURE, etc.
  geom            GEOMETRY(Geometry, 4326) NOT NULL,
  valid_from      TIMESTAMPTZ NOT NULL,
  valid_to        TIMESTAMPTZ,
  severity        TEXT,
  source           TEXT,                    -- SMAPS, MARAD, etc.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX maritime_advisories_geom_idx ON maritime_advisories USING GIST (geom);
CREATE INDEX maritime_advisories_type_idx ON maritime_advisories (type, valid_from);
```

---

### 4. FAA NOTAM Layer — Phase 1 (AviationWeather.gov REST)

**Research guidance**: Section 7 — Phase 1 immediate (AviationWeather.gov REST), Phase 2 deferred (FAA SWIM JMS)

#### Backend Integration (`backend/ingestion/notam_poll_pulse.py`)

```
Structure:
├── notam_poll_pulse.py              # REST poll to aviationweather.gov
├── sources/
│   └── aviationweather_api.py       # AviationWeather.gov API client
└── tests/
    └── test_notam_*.py

Data flow:
  GET aviationweather.gov/api/data/notam?bbox={W},{S},{E},{N}
    → JSON response with NOTAM array
    → Parse: coordinates, radius (NM), classification (TFR, MOA, etc.)
    → Convert radius NM → meters (1 NM = 1,852m) for Deck.gl radiusUnits
    → notams hypertable (time + H3 partitioning)
    → Kafka topic `sw.faa.notam`
```

**Database schema**:

```sql
CREATE TABLE IF NOT EXISTS notams (
  time           TIMESTAMPTZ NOT NULL,
  notam_id       TEXT NOT NULL,
  geom           GEOMETRY(Point, 4326) NOT NULL,
  radius_meters  FLOAT NOT NULL,                -- Deck.gl radiusUnits: 'meters'
  type           TEXT NOT NULL,                -- TFR, MOA, AIRSPACE, GPS_TEST, PARACHUTE, etc.
  severity       TEXT NOT NULL,                -- CRITICAL, WARNING, ADVISORY
  valid_from     TIMESTAMPTZ NOT NULL,
  valid_to       TIMESTAMPTZ NOT NULL,
  description    TEXT,
  altitude_msl   INT,                          -- Floor altitude (feet)
  altitude_ceiling INT,                        -- Ceiling altitude (feet)
  h3_res5        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('notams', 'time', if_not_exists => TRUE);
CREATE INDEX notams_geom_idx ON notams USING GIST (geom);
CREATE INDEX notams_type_idx ON notams (type, valid_from, valid_to);

-- Auto-cleanup: remove expired NOTAMs
SELECT add_retention_policy('notams', INTERVAL '14 days', if_not_exists => TRUE);
```

**Poller parameters**:
- Polling interval: 5 minutes (NOTAMs can activate/expire rapidly, especially TFRs)
- Bounding box: Current visible map extent + buffer (100nm around tracked aircraft clusters)
- Notification strategy: On CRITICAL TFR activation, trigger WebSocket push (bypass DB) for immediate pilot awareness

---

## Phase 2: Frontend Layer Implementations

### 1. NDBC Buoy Layer (`frontend/src/layers/buildNDBCLayer.ts`)

**Deck.gl layer type**: `ScatterplotLayer` (research section 3.3 recommendation)

```typescript
// Visual encoding:
// - Radius = WVHT meters → radiusUnits: 'meters' (geodesically accurate)
// - Color = WTMP °C → d3-scale (blue →magenta → red, [-5°C, 35°C])
// - Opacity = Confidence (0.6–1.0 based on freshness)
// - Hover tooltip: [buoy_id, WVHT, WTMP, WSPD, WDIR, last_obs_time]
// - Selection: Expand radius + yellow stroke

Key props:
- data: buoyObservations[]
- getPosition: [lon, lat]
- getRadius: wvht_meters
- getFillColor: colorScale(wtmp_celsius)
- radiusUnits: 'meters' (mandatory per research)
- getLineColor: hoveredBuoy ? [255,255,0,255] : [200,200,200,100]
- getLineWidth: hoveredBuoy ? 3 : 1

Layer order (composition.ts): Insert between infrastructure (cables) and jamming zones
```

**Frontend integration** (`frontend/src/components/map/TacticalMap.tsx`):

```typescript
// Add filter:
filters.showBuoys?
  → Query API: GET /api/buoys/latest?bbox={bounds}
  → Zustand update: buoyData state

// Tooltip on hover:
onLayerHovered('buoy-layer', { object })
  → Display:
     "NDBC {buoy_id} | WVHT: {WVHT}m | WTMP: {WTMP}°C | WSPD: {WSPD}m/s | Updated: {time}"

// Cross-domain fusion query (Phase 3):
onClick on buoy
  → Query: "SELECT * FROM ais_tracks WHERE geom && buoy_geom + 50km buffer"
  → Highlight nearby vessels (sea state context)
```

---

### 2. NGA SMAPS Piracy + Nav Warnings Layer (`frontend/src/layers/buildSMAPSLayer.ts`)

**Deck.gl layer types**:
- Incidents: `IconLayer` (attack-type SVG atlas) + `ScatterplotLayer` (density heatmap at zoom < 6)
- Nav warnings: `GeoJsonLayer` or `PolygonLayer` (polygon geometries)

```typescript
// Incidents (zoom >= 8):
IconLayer {
  data: SMAPSIncidents,
  getPosition: [lon, lat],
  getIcon: (obj) => {
    // SVG atlas: kidnapping → red; armed robbery → orange; hijacking → yellow
    switch(obj.attack_type) {
      case 'Hijacking': return 'kidnapping-icon';
      case 'Armed Robbery': return 'robbery-icon';
      case 'Boarding': return 'boarding-icon';
      default: return 'incident-icon';
    }
  },
  iconAtlas: '...svg-atlas-url',
  iconMapping: {...},
  getSize: 40,
  getColor: [255, 100, 50, 255] // Orange default, selected = yellow
}

// Incidents (zoom < 6 — density):
HexagonLayer {
  data: SMAPSIncidents,
  getPosition: [lon, lat],
  getElevationValue: (points) => points.length,
  colorDomain: [0, 50],
  colorRange: ['#ebedf0', '#8B0000'], // white → dark red
  elevationDomain: [0, 50],
  elevationRange: [0, 5000],
  elevationScale: 50
}

// Nav warnings:
PolygonLayer {
  data: navWarnings,
  getPolygon: () => coordinates,
  getFillColor: [255, 200, 0, 50], // Amber semi-transparent
  getLineColor: [255, 200, 0, 200],
  getLineWidth: 2,
  lineWidthUnits: 'pixels'
}
```

**Threat scoring continuous aggregate** (for color intensity):

```sql
-- Rolling 90-day threat score (recency + severity)
SELECT
  id,
  threat_score =
    CASE
      WHEN CURRENT_DATE - date <= 7 THEN 10
      WHEN CURRENT_DATE - date <= 30 THEN 5
      WHEN CURRENT_DATE - date <= 90 THEN 2
      ELSE 0
    END *
    CASE
      WHEN attack_type = 'Kidnapping' THEN 3
      WHEN attack_type = 'Hijacking' THEN 2.5
      WHEN attack_type = 'Armed Robbery' THEN 1.5
      ELSE 1
    END
FROM smaps_incidents
WHERE date > CURRENT_DATE - INTERVAL '90 days'
ORDER BY threat_score DESC;
```

---

### 3. FAA NOTAM Layer (`frontend/src/layers/buildNOTAMLayer.ts`)

**Deck.gl layer types**:
- Circular NOTAMs: `ScatterplotLayer` with `radiusUnits: 'meters'` (research Section 7.2)
- Complex MOAs/Polygons: `GeoJsonLayer`

```typescript
// Circular NOTAMs (TFR, GPS test, etc.):
ScatterplotLayer {
  data: circularNotams,
  getPosition: [lon, lat],
  getRadius: (obj) => obj.radius_meters,
  radiusUnits: 'meters', // Geodesically accurate (mandatory per research)
  getFillColor: (obj) => {
    switch(obj.severity) {
      case 'CRITICAL': return [255, 0, 0, 180];      // Red
      case 'WARNING':  return [255, 165, 0, 150];    // Amber
      case 'ADVISORY': return [100, 150, 255, 100];  // Blue
      default: return [200, 200, 200, 100];
    }
  },
  getLineColor: (obj) => obj.severity === 'CRITICAL' ? [255, 255, 0, 255] : [200, 200, 200, 100],
  getLineWidth: (obj) => obj.severity === 'CRITICAL' ? 2 : 1,
  lineWidthUnits: 'pixels',
  transitions: {
    getLineWidth: 200,  // Pulsing effect over 200ms
    getLineColor: 200
  }
}

// Polygon NOTAMs (complex MOAs, restricted airspace):
GeoJsonLayer {
  data: complexNotams,
  lineWidthScale: 10,
  getLineColor: [255, 165, 0, 200],
  getFillColor: [255, 165, 0, 50],
  lineJointRounded: true
}
```

**Tooltip on hover**:

```typescript
onLayerHovered('notam-layer', { object }) {
  if (object) {
    return `
      ${object.type} | ${object.description}
      Altitude: ${object.altitude_msl}–${object.altitude_ceiling} MSL
      Valid: ${formatTime(object.valid_from)}–${formatTime(object.valid_to)}
      Severity: ${object.severity}
    `;
  }
}
```

**Critical alerts (TFR activation)**: Bypass database, push via WebSocket → toast notification in HUD

---

## Phase 3: Cross-Domain Fusion Queries

### Workflow 1 — Dark Vessel Identification (requires VIIRS integration)

**Not included in MVP but architecture-ready**. When VIIRS/FIRMS is added:

```sql
-- Query: AIS gap + VIIRS thermal + sea state confidence
SELECT
  ais.vessel_name,
  viirs.bright_ti4,
  viirs.frp_mw,
  ndbc.wvht_meters,
  ndbc.wspd_ms,
  CASE
    WHEN ndbc.wvht_meters < 1.0 AND ndbc.wspd_ms < 8 THEN 'HIGH_CONFIDENCE'
    WHEN ndbc.wvht_meters < 3.5 THEN 'WEATHER_PLAUSIBLE'
    ELSE 'INVESTIGATE'
  END AS dark_vessel_likelihood
FROM ais_gaps ais
JOIN thermal_detections viirs ON ST_DWithin(ais.geom, viirs.geom, 50000)
  AND viirs.acq_time BETWEEN ais.gap_start AND ais.gap_start + INTERVAL '6 hours'
JOIN ndbc_obs ndbc ON ST_DWithin(ais.geom, ndbc.geom, 100000)
WHERE ais.gap_duration_min > 30
ORDER BY dark_vessel_likelihood DESC;
```

### Workflow 2 — GNSS Spoofing Confirmation

```sql
-- Query: AIS anomaly + SMAPS/NOTAM correlation
SELECT
  ais.vessel_name,
  ais.position_jump_nm,
  CASE
    WHEN smaps_exists AND notam_exists THEN 'CONFIRMED_GNSS_DISRUPTION'
    WHEN smaps_exists THEN 'UNCONFIRMED_JAMMING'
    ELSE 'INVESTIGATE'
  END AS gnss_integrity
FROM ais_anomalies ais
LEFT JOIN maritime_advisories smaps ON smaps.type = 'GPS_JAMMING'
  AND ST_Contains(smaps.geom, ais.geom)
  AND NOW() BETWEEN smaps.valid_from AND smaps.valid_to
LEFT JOIN notams notam ON (notam.type ILIKE '%GPS%' OR notam.type ILIKE '%GNSS%')
  AND ST_DWithin(notam.geom, ais.geom, 185000) -- 100 NM in meters
  AND NOW() BETWEEN notam.valid_from AND notam.valid_to
ORDER BY ais.time DESC;
```

### Workflow 3 — Multi-Domain Incident Correlation

```sql
-- Query: Asset near multiple concurrent warnings/threats
SELECT
  ent.entity_id,
  ent.entity_type,
  array_agg(DISTINCT SMAPS.attack_type) FILTER (WHERE SMAPS.id IS NOT NULL) AS piracy_threats,
  array_agg(DISTINCT nav.title) FILTER (WHERE nav.id IS NOT NULL) AS nav_warnings,
  array_agg(DISTINCT notam.type) FILTER (WHERE notam.id IS NOT NULL) AS active_notams,
  CASE
    WHEN array_length(array_agg(DISTINCT SMAPS.id), 1) > 0
      AND array_length(array_agg(DISTINCT notam.id), 1) > 0
    THEN 'MULTI_DOMAIN_THREAT'
    ELSE 'NORMAL'
  END AS threat_classification
FROM entities ent
LEFT JOIN smaps_incidents smaps ON ST_DWithin(ent.geom, SMAPS.geom, 50000)
LEFT JOIN nav_warnings nav ON ST_DWithin(ent.geom, nav.geom, 50000)
  AND NOW() BETWEEN nav.valid_from AND nav.valid_to
LEFT JOIN notams notam ON ST_DWithin(ent.geom, notam.geom, 185000)
  AND NOW() BETWEEN notam.valid_from AND notam.valid_to
WHERE ent.geom IS NOT NULL
GROUP BY ent.entity_id, ent.entity_type
HAVING COUNT(DISTINCT SMAPS.id) > 0 OR COUNT(DISTINCT notam.id) > 0;
```

---

## Database & Performance Considerations

### TimescaleDB Optimization for Jetson Nano

1. **Compression policy** (on 4-hour age, reduces I/O):
   ```sql
   SELECT add_compression_policy('ndbc_obs', INTERVAL '4 hours', if_not_exists => TRUE);
   SELECT add_compression_policy('notams', INTERVAL '4 hours', if_not_exists => TRUE);
   ```

2. **Retention policies** (prevent unbounded storage):
   ```sql
   -- NDBC: 30-day rolling window
   -- NOTAM: 14-day (most NOTAMs expire quickly, historical archive not critical)
   -- SMAPS: 90-day (piracy incidents valuable for trend analysis)
   ```

3. **Continuous aggregates** (pre-computed for fast queries):
   - `ndbc_anomaly_baseline`: 30-day rolling mean per buoy (1-hour buckets)
   - `smaps_threat_density`: 90-day incident density per H3 cell (daily buckets)

4. **Index strategy**:
   - GIST on all geographic columns (spatial searches)
   - B-tree on (type, valid_from, valid_to) for NOTAM/advisory range queries
   - Trigram GIN on vessel_name / description for text search

5. **Memory-conscious materialization**:
   - Continuous aggregates use `WITH DATA` at creation, then `REFRESH MATERIALIZED VIEW CONCURRENTLY` on 1-hour schedule
   - Avoid full table aggregations; always filter by time window

---

## Sidecar Container Architecture (Post-MVP)

Reference research Section 8.1. When scaled beyond Jetson Nano single-container:

```yaml
# docker-compose.yml (future)
services:
  # Existing
  sovereign-frontend: ...
  sovereign-backend: ...
  sovereign-timescaledb: ...
  sovereign-redpanda: ...

  # New data source sidecars
  ndbc-pulse:
    image: sovereign-watch/ndbc-poller:latest
    environment:
      KAFKA_BROKERS: redpanda:9092
      DB_URL: postgresql://timescaledb:5432/sw
      POLLING_INTERVAL_SECONDS: 900  # 15 min
    depends_on: [redpanda, timescaledb]
    mem_limit: 80m

  nga-msi-pulse:
    image: sovereign-watch/nga-msi-poller:latest
    environment:
      KAFKA_BROKERS: redpanda:9092
      DB_URL: postgresql://timescaledb:5432/sw
      SCHEDULE: "0 15 * * MON-FRI"  # 15:00 ET weekdays
    depends_on: [redpanda, timescaledb]
    mem_limit: 100m

  notam-poll:
    image: sovereign-watch/notam-poller:latest
    environment:
      KAFKA_BROKERS: redpanda:9092
      DB_URL: postgresql://timescaledb:5432/sw
      POLLING_INTERVAL_SECONDS: 300  # 5 min
    depends_on: [redpanda, timescaledb]
    mem_limit: 60m

  cmems-sst:
    image: sovereign-watch/copernicus-sst:latest  # Phase 2
    environment:
      COPERNICUS_USER: ${COPERNICUS_USER}
      COPERNICUS_PASS: ${COPERNICUS_PASS}
      SCHEDULE: "0 3 * * *"  # 03:00 UTC (low-traffic window)
    mem_limit: 150m
```

Total sidecar memory: ~390 MB (fits within Jetson Nano constraints)

---

## Verification Strategy

### Unit Tests (Targeted Verification per CLAUDE.md)

**Backend**:
```bash
cd backend/api && python -m pytest tests/test_ndbc_poller.py -v
cd backend/api && python -m pytest tests/test_nga_smaps_parser.py -v
cd backend/api && python -m pytest tests/test_notam_poller.py -v
```

**Frontend** (via pnpm):
```bash
cd frontend && pnpm run test -- --testPathPattern="buildNDBCLayer|buildSMAPSLayer|buildNOTAMLayer"
cd frontend && pnpm run lint
```

### Integration Tests

1. **NDBC ingestion**:
   - Poll latest_obs.txt → verify 10+ buoys parsed → check ndbc_obs table rowcount
   - Anomaly detection: Insert test observation +5σ above baseline → verify Z-score flag computed

2. **NGA SMAPS ingestion**:
   - Mock shapefile download → verify smaps_incidents table populated
   - Cross-reference with sample AIS track → verify ST_DWithin query returns piracy nearby

3. **NOTAM ingestion**:
   - Mock aviationweather.gov response → verify notams table populated
   - Verify radius_meters field correctly scaled (NM → meters: 1852 factor)

4. **Frontend layer rendering**:
   - Load TacticalMap with showBuoys=true → verify ScatterplotLayer appears
   - Hover buoy marker → tooltip displays WVHT, WTMP correctly
   - Zoom < 6 → SMAPS hexagon density layer appears; zoom >= 8 → IconLayer
   - NOTAM critical circle pulsing animation triggers on CRITICAL severity

### End-to-End Scenario

**Dark Vessel Workflow** (Phase 3, after VIIRS added):
1. Simulate AIS track gap (manually delete 3 AIS messages)
2. Inject synthetic VIIRS thermal point at last known position
3. Query dark_vessel_candidates view → verify result includes thermal match
4. Display on map → verify ghost ship icon appears, VIIRS cluster center shown
5. Click ghost ship → tooltip shows NDBC sea state context

---

## Implementation Sequence (Recommended)

| Week | Task | Deliverable |
|------|------|-------------|
| 1–2  | NDBC primary + layer | `ndbc_pulse.py`, `buildNDBCLayer.ts`, hypertable + continuous aggregate |
| 2–3  | NGA SMAPS primary + layer | `nga_msi_pulse.py`, `buildSMAPSLayer.ts`, incident + nav warning tables |
| 3–4  | NOTAM Phase 1 + layer | `notam_poll_pulse.py`, `buildNOTAMLayer.ts`, NOTAM table, WebSocket critical alert |
| 4–5  | Sidecar scaffolding | MARAD RSS poller, container definitions (docker-compose.yml) |
| 5–6+ | Fusion queries + Phase 2 data sources | Dark vessel, GNSS spoofing, incident correlation queries; VIIRS/FIRMS poller |

---

## Critical Files to Modify/Create

### Backend Additions
- `backend/ingestion/ndbc_pulse.py` (new)
- `backend/ingestion/sources/ndbc_api.py` (new)
- `backend/ingestion/nga_msi_pulse.py` (new)
- `backend/ingestion/sources/nga_SMAPS.py` (new)
- `backend/ingestion/notam_poll_pulse.py` (new)
- `backend/ingestion/sources/aviationweather.py` (new)
- `backend/db/init.sql` (additions for ndbc_obs, smaps_incidents, nav_warnings, notams tables)
- `backend/api/app.py` (add `/api/buoys/latest`, `/api/smaps/incidents` endpoints)

### Frontend Additions
- `frontend/src/layers/buildNDBCLayer.ts` (new)
- `frontend/src/layers/buildSMAPSLayer.ts` (new)
- `frontend/src/layers/buildNOTAMLayer.ts` (new)
- `frontend/src/components/map/composition.ts` (update z-order, add new layers)
- `frontend/src/components/map/TacticalMap.tsx` (add filters, API queries)
- `frontend/src/layers/index.ts` (export new layer builders)

### Configuration
- `.env` (optional COPERNICUS_USER/COPERNICUS_PASS for Phase 2)
- `docker-compose.yml` (future sidecar services)

---

## Assumptions & Constraints

1. **Jetson Nano memory budget**: ~1.2 GB available for services. NDBC + SMAPS + NOTAM combined ~300 MB footprint allows headroom for browser, future Phase 2 sources.

2. **API availability**: Research assumes all government APIs (NDBC, NGA, AviationWeather) remain accessible via HTTP without authentication. If API changes occur, fallbacks documented in each poller.

3. **Data sovereignty**: All recommended sources are open government APIs. No commercial dependencies (rejects CLS MAS, Risk Intelligence, Laminar Data per research Section 8).

4. **Deck.gl 9 capability**: `radiusUnits: 'meters'` is available in your version (confirmed in existing aurora, jamming layers). Geodetic accuracy guaranteed by Deck.gl WebGL shaders.

5. **Redpanda topic naming**: New topics follow existing pattern: `sw.<domain>.<data_type>` (e.g., `sw.ndbc.buoy`, `sw.nga.SMAPS`, `sw.faa.notam`).

6. **PostGIS availability**: TimescaleDB + PostGIS extensions assumed installed (verified in existing schema).

---

## Future Enhancements (Phase 2+)

1. **VIIRS/FIRMS satellite thermal**: ~40 hrs effort, includes dark vessel correlation engine
2. **FAA SWIM JMS**: ~50 hrs, requires SCDS approval (6–8 week lead time)
3. **Copernicus SST sidecar**: Replaces NDBC T&C for global fill (requires free Copernicus account)
4. **ICC-IMB piracy scraper**: Faster piracy reporting than NGA SMAPS (3–7 day lead), HTML parsing
5. **ReCAAP SE Asia piracy**: PDF parsing for Southeast Asian incident granularity
6. **Vector search fusion**: intel_reports pgvector embedding search + similarity correlation




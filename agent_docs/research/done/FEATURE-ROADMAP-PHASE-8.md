# Sovereign Watch — Phase 8 Feature Roadmap

## Satellite Tracking · Drone Layer · Undersea Cable Infrastructure Viz

**Date:** 2026-02-20
**Version Target:** v0.8.x — v0.10.x
**Status:** Planning / Agent-Ready

---

## ⚠️ Infrastructure Upgrade Required: MapLibre GL JS v3 → v5

> **Discovered:** 2026-02-21 during Globe View implementation

### Background

During implementation of the `Globe_View` orbital visualization feature, we discovered that **MapLibre GL JS v3.x does not expose `setProjection()` as a public API**. Globe projection is a feature that was implemented in Mapbox GL JS v3 but has not yet been backported to MapLibre GL JS v3.

**Current stack:**

- `maplibre-gl`: `3.6.2` (locked)
- `react-map-gl`: `7.1.x`

**What we need:** MapLibre GL JS v5+ or a Mapbox GL JS token

### Research Findings

| Approach                                   | Pros                        | Cons                                                | Decision             |
| ------------------------------------------ | --------------------------- | --------------------------------------------------- | -------------------- |
| **Mapbox GL JS** (add `VITE_MAPBOX_TOKEN`) | Zero-effort, instant globe  | Requires paid/free Mapbox account, vendor lock-in   | Optional user choice |
| **Upgrade `maplibre-gl` to v4**            | Open source, free           | v4 globe support unclear, moderate breaking changes | ❌ Insufficient      |
| **Upgrade `maplibre-gl` to v5`**           | Full globe API, open source | Breaking API changes vs v3, needs research          | ✅ **Recommended**   |

### Research Tasks Before Upgrading to v5

Before executing the upgrade, the following must be investigated:

- [ ] **API diff v3→v5**: Check breaking changes in MapLibre GL JS CHANGELOG for `Map` class, event signatures, `LngLat`, `Bounds`, layer types
- [ ] **react-map-gl compatibility**: Verify `react-map-gl` v7 supports `maplibre-gl` v5 as the `mapLib` argument (check react-map-gl peer deps)
- [ ] **deck.gl compatibility**: Confirm `@deck.gl/mapbox` v8.x works with MapLibre GL JS v5's WebGL context
- [ ] **Globe projection API**: Confirm the exact v5 API for globe mode (`map.setProjection()`, style spec `"projection": {"name": "globe"}`, or other)
- [ ] **CartoBasemaps compatibility**: Verify Carto dark-matter style still renders correctly with v5
- [ ] **Terrain/3D mode**: Ensure existing `enable3d` / pitch / bearing controls still function

### Implementation Plan (when ready)

```bash
# Step 1: Update dependency (in container)
docker compose run --rm frontend npm install maplibre-gl@5

# Step 2: Rebuild
docker compose up -d --build frontend

# Step 3: Verify — check console for renderer errors then test:
#   - Standard map renders correctly
#   - 2D/3D toggle works
#   - Globe_View toggle switches projection
#   - Satellite orbital layer renders at globe scale
```

### Current State

The `Globe_View` button is **wired and ready** in `TopBar.tsx`, `App.tsx`, and `TacticalMap.tsx`. The dual-path logic (`setProjection()` → style injection fallback) is in place. The upgrade is **purely a dependency bump** — no frontend code changes are needed for globe to work once v5 is confirmed compatible.

---

## Current State Summary (v0.7.3)

The following INT domains are **complete and operational**:

| Domain             | Status  | Notes                                                                                          |
| :----------------- | :------ | :--------------------------------------------------------------------------------------------- |
| Aviation (ADS-B)   | ✅ Done | Multi-source, arbitration, classification (Military/Govt/Commercial/Private/Helo/Drone labels) |
| Maritime (AIS)     | ✅ Done | Real-time WebSocket, 11 ship categories, static/dynamic metadata enrichment                    |
| Replay / Historian | ✅ Done | TimescaleDB, time-slider, track search                                                         |
| Kinematic Engine   | ✅ Done | PVB dead-reckoning, rotation interp, trail smoothing                                           |
| Tactical UI        | ✅ Done | Neon Noir HUD, Chevron-First, TopBar, Intel Feed, Layer Filters                                |

---

## Proposed Phase 8 Features

### Priority Assessment

| Feature                | Value                                                   | Complexity                    | Recommended Order                                                          |
| :--------------------- | :------------------------------------------------------ | :---------------------------- | :------------------------------------------------------------------------- |
| **Satellite Tracking** | High — completes the air picture from ground to LEO/MEO | Medium                        | **1st** — backend already architecturally planned (Ingest-03)              |
| **Undersea Cable Viz** | High — unique strategic infrastructure intel layer      | Low-Medium                    | **2nd** — purely frontend/static, no new ingestion service needed          |
| **Drone Tracking**     | Medium-High — fills gap in low-altitude RF picture      | High — depends on data access | **3rd** — most complex data sourcing, build after orbital layer proves out |

---

## Feature 1: Orbital Intelligence — Satellite Tracking

### Strategic Value

Completes the vertical picture from the ground up to LEO/MEO/GEO. Enables operators to correlate overhead satellite passes with surface events, identify surveillance satellite windows, and track GPS/comms constellation health.

### Architecture

```
Celestrak TLE Feed (HTTP Pulse, 6h interval)
    └─> sovereign-orbital-pulse (Python cron service)
        └─> SGP4 propagation (sgp4 Python lib)
            └─> Position update every 30s -> Kafka topic: orbital_raw
                └─> sovereign-backend (WebSocket /api/tracks/live)
                    └─> Frontend: OrbitalLayer (Deck.gl ScatterplotLayer + PathLayer)
```

**Data Sources:**

- **Celestrak** (public, no auth): `https://celestrak.org/SOCRATES/query.php` and category TLE files (GPS, weather, military, debris). Preferred for open access.
- **Space-Track.org** (free, requires registration): Full official SATCAT including classified designations.

**TAK Type:** `a-s-K` (already defined in `tak.proto`)

**Kafka Topic:** `orbital_raw` (new topic, add to docker-compose init)

**Satellite Categories to Ingest:**

- `GPS` — GPS constellation (US, GLONASS, Galileo, BeiDou)
- `WEATHER` — NOAA, Meteosat, FengYun
- `SURVEILLANCE` — Known ISR satellites (from public SATCAT)
- `COMMS` — Starlink, OneWeb, Iridium, Intelsat
- `DEBRIS` — High-risk tracked debris (optional, filter by RCS > threshold)

**Visualization Features:**

- Satellite icons (distinct from aircraft chevrons) — use a 4-point star/diamond shape
- Color-coded by category (GPS=green, Weather=blue, Comms=purple, Surveillance=orange/red)
- Ground track projection line (next 90 minutes of propagated orbit)
- Footprint circle — the satellite's sensor/comms coverage radius at altitude
- Pass prediction over current AOR — highlight when satellite is overhead
- Sidebar telemetry: NORAD ID, name, altitude (km), velocity (km/s), inclination, period, category
- Filter toggles in LayerFilters.tsx (per category)
- 3D rendering: extrude satellite position to actual altitude using Deck.gl with altitude in meters

### New Files Required

- `backend/ingestion/orbital_pulse/` — new service directory
  - `main.py` — cron loop, Celestrak fetch, SGP4 propagation, Kafka producer
  - `requirements.txt` — `sgp4`, `aiokafka`, `redis`, `aiohttp`
  - `Dockerfile`
- `frontend/src/layers/OrbitalLayer.tsx` — Deck.gl layer component
- `frontend/src/components/SatelliteDetail.tsx` — sidebar telemetry panel

### ROADMAP Update

- Add `Ingest-03` as **P0 active** (was P3 Future)
- Add `FE-20: Orbital Visualization` as **P0 active**

---

## Feature 2: Undersea Data Cable Infrastructure Layer

### Strategic Value

Submarine cables carry ~99% of international internet traffic. Visualizing their routes, landing stations, and operator metadata on the tactical map creates a unique GEOINT layer revealing strategic communication chokepoints, infrastructure at risk, and geopolitical dependencies. This is a signature capability with no analog in commercial tools.

### Architecture

```
Static GeoJSON bundle (cable routes + landing points)
    └─> Frontend asset: public/data/submarine-cables.geojson
        └─> CableLayer.tsx (Deck.gl PathLayer + ScatterplotLayer)
            └─> LayerFilters toggle: "INFRA"
                └─> Sidebar: CableDetail.tsx (name, operator, capacity, year, landing points)
```

**Data Sources (all public):**

- **TeleGeography Submarine Cable Map GeoJSON** — `https://github.com/telegeography/www.submarinecablemap.com` provides a public JSON export of cable routes and landing points used by their interactive map.
- **Infrapedia** — Free API tier available for cable geometry.
- **ITU/ICPC** — International Cable Protection Committee publishes cable lists.
- Cables can be bundled as a static asset (refreshed quarterly) since cable routes change infrequently.

**No new backend service required.** The GeoJSON is fetched at frontend load or bundled as a static asset.

### Visualization Features

- **Cable Routes**: Animated `PathLayer` with a "data pulse" effect — a glowing point that traverses the cable path to indicate live traffic (purely aesthetic, not real traffic data)
- **Color Coding by Status:**
  - Active (operational) — cyan `#00f5ff`
  - Under Construction — amber `#f59e0b`
  - Under Repair / Disruption Alert — red `#ef4444`
- **Landing Stations**: `ScatterplotLayer` markers at cable landing points — distinct icon from vessel/aircraft
- **Cable Metadata Popup** (hover/click):
  - Cable name, owner/operator consortium
  - Total capacity (Tbps)
  - Year laid / RFS date
  - Landing points list (countries)
  - Length (km)
- **Toggle**: New "INFRA" section in `LayerFilters.tsx` with "Submarine Cables" toggle
- **Opacity slider** for cable route visibility (can be noisy at global zoom)
- **Zoom-dependent rendering**: Hide at zoom < 3, show landing stations at zoom < 6, show full routes at zoom ≥ 6

### New Files Required

- `frontend/public/data/submarine-cables.geojson` — bundled static cable route data
- `frontend/public/data/cable-landing-points.geojson` — landing station points
- `frontend/src/layers/CableLayer.tsx` — Deck.gl PathLayer + ScatterplotLayer
- `frontend/src/components/CableDetail.tsx` — sidebar/popup metadata panel

### ROADMAP Update

- Add `FE-21: Undersea Cable Infrastructure Layer` as **P1 active** (new item)

---

## Feature 3: Drone Tracking Layer

### Strategic Value

Fills the low-altitude gap between ground level and the ADS-B floor (~500ft). Remote ID (FAA mandate since 2024) broadcasts drone identity, position, altitude, operator position, and flight purpose over Bluetooth 4/5 and Wi-Fi NaN. Combined with ADS-L (aviation light) for registered drones, this creates a comprehensive sub-500ft air picture.

### Architecture (Two-Track Approach)

**Track A — Immediate (Software Only, No New Hardware):**

```
Existing ADS-B feed (adsb.fi / airplanes.live)
    └─> Enhanced classification in sovereign-adsb-poller
        └─> Filter ICAO type codes: "~GRND", "~ULAC", drone operator strings
            └─> Tag as subtype: "drone" in TAK event
                └─> Frontend: enhanced drone filter (already partially done in v0.7.3)
```

**Track B — Full Implementation (Remote ID SDR):**

```
OpenDroneID receiver (RTL-SDR + software)
    └─> sovereign-drone-poller (Python async, new service)
        └─> Parse Remote ID messages (ASTM F3411, MAVLink, ASD-STAN)
            └─> Extract: drone ID, position, altitude AGL, operator position, speed
                └─> TAK Protobuf (a-f-A-C-F-q) -> Kafka topic: drone_raw
                    └─> Frontend: DroneLayer.tsx
```

**Data Sources:**

- **FAA Remote ID** (broadcast over BT/WiFi — requires SDR hardware for ground truth)
- **OpenDroneID** network/aggregators — `https://opendroneid.org`
- **ADS-L** — European aviation light standard, some aggregators exist
- **airplanes.live** — includes some drone/UAV tracks in ADS-B data
- **Manufacturer APIs**: DJI FlightHub, Skydio Cloud (requires commercial agreements)

**TAK Type:** `a-f-A-C-F-q` (Friendly Air UAS) for cooperative; `a-h-A-C-F-q` for hostile/uncooperative

**Kafka Topic:** `drone_raw` (new topic)

### Visualization Features

- Distinct drone icon — hexagonal rotor silhouette (different from fixed-wing chevron/helicopter)
- Color: altitude gradient (same as aviation, but lower range: 0–1500ft AGL)
- Operator position marker (if available from Remote ID) — linked to drone with dashed line
- Drone ID, model, operator, altitude AGL, speed in sidebar
- Filter: existing `showDrone` toggle in LayerFilters already exists — wire to new layer
- Alert: new drone entering AOR — Intel Feed entry with `a-h` (hostile/unknown) classification

### New Files Required (Track B)

- `backend/ingestion/drone_poller/` — new service directory
  - `main.py` — OpenDroneID/Remote ID parser, Kafka producer
  - `requirements.txt`
  - `Dockerfile`
- `frontend/src/layers/DroneLayer.tsx` — dedicated drone Deck.gl layer
- `frontend/src/components/DroneDetail.tsx` — sidebar panel

### Recommended Sequencing

Start with **Track A** (enhance existing ADS-B classifier to better surface drone tracks using ICAO type codes and operator strings). Deliver Track B once hardware setup is confirmed.

### ROADMAP Update

- Add `Ingest-07: Drone Remote ID Poller` as **P2** (Track B), `Ingest-07a: ADS-B Drone Enhancement` as **P1** (Track A)
- Add `FE-22: Drone Tactical Layer` as **P1 active** (new item)

---

## Master Task List — Phase 8

### New Tasks

| ID             | Task Name               | Component | Priority | Description                                                                        |
| :------------- | :---------------------- | :-------- | :------- | :--------------------------------------------------------------------------------- |
| **Ingest-03**  | Orbital Pulse           | Data Eng  | **P0**   | Space-Track / Celestrak TLE → SGP4 propagation → `orbital_raw` Kafka topic         |
| **FE-20**      | Orbital Visualization   | Frontend  | **P0**   | `OrbitalLayer.tsx`: satellite icons, ground tracks, footprint circles, pass alerts |
| **FE-21**      | Undersea Cable Layer    | Frontend  | **P1**   | `CableLayer.tsx`: animated route paths, landing station markers, cable metadata    |
| **Ingest-07a** | ADS-B Drone Enhancement | Data Eng  | **P1**   | Improve ICAO type-code drone detection in existing adsb-poller classifier          |
| **FE-22**      | Drone Tactical Layer    | Frontend  | **P1**   | Dedicated drone chevron/icon layer, operator position link, altitude display       |
| **Ingest-07**  | Drone Remote ID Poller  | Data Eng  | **P2**   | OpenDroneID/Remote ID SDR pipeline → `drone_raw` Kafka topic                       |

### Existing Backlog (Carry Forward)

| ID             | Task Name                   | Priority |
| :------------- | :-------------------------- | :------- |
| **Audit-01**   | Code Review / Security Scan | P1       |
| **Fix-01**     | CoT Tracking Restore        | P1       |
| **FE-09**      | Coverage Viz (H3)           | P2       |
| **FE-12**      | Settings UI                 | P2       |
| **Backend-04** | Auth / RBAC                 | P2       |

---

## Agent Implementation Prompts

The following prompts are ready to hand to a coding agent for sequential execution.

---

### PROMPT 1 — Orbital Pulse Backend Service (Ingest-03)

```
You are implementing the `sovereign-orbital-pulse` backend ingestion service for Sovereign Watch.

## Context

Sovereign Watch is a multi-INT tactical intelligence platform. It uses:

- Python async services for ingestion
- Redpanda (Kafka-compatible) for streaming, broker: `sovereign-redpanda:9092`
- Redis for pub/sub area updates, host: `sovereign-redis`
- TAK Protocol (Protobuf) for all track messages
- Docker Compose for orchestration

The existing `backend/ingestion/poller/` (ADS-B) and `backend/ingestion/maritime_poller/` (AIS)
are reference implementations you MUST study before writing a single line of code.

The TAK proto is at `backend/tak.proto`. The type code for satellites is `a-s-K`.

---

## Task

Create a new service at `backend/ingestion/orbital_pulse/` that:

### 1. Fetches TLE/GP Data

Fetch from Celestrak's public GP endpoint — no auth required.

**Endpoint format:**

    GET https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT={format}

`FORMAT` options: `TLE` (3-line text, default), `2LE`, `JSON`, `CSV`, `XML`, `KVN`

> **Recommended:** Use `FORMAT=JSON` for new implementations. The JSON format is based on the OMM
> standard, supports 9-digit catalog numbers, eliminates TLE epoch-year ambiguity, and is easier
> to parse. TLE format cannot represent catalog numbers above 69999.

**Categories and URLs:**

| Category           | GROUP value  | Full URL (JSON)                                                                 |
|--------------------|--------------|---------------------------------------------------------------------------------|
| GPS Operational    | `gps-ops`    | `https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=JSON`        |
| GLONASS Operational| `glonass-ops`| `https://celestrak.org/NORAD/elements/gp.php?GROUP=glonass-ops&FORMAT=JSON`    |
| Galileo            | `galileo`    | `https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=JSON`        |
| BeiDou             | `beidou`     | `https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=JSON`         |
| Weather            | `weather`    | `https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=JSON`        |
| NOAA               | `noaa`       | `https://celestrak.org/NORAD/elements/gp.php?GROUP=noaa&FORMAT=JSON`           |
| Active Satellites  | `active`     | `https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON`         |

#### Optional: Supplemental GP Data (Higher Accuracy GNSS)

For GPS and GLONASS, CelesTrak provides **Supplemental GP data** derived from operator-supplied
ephemerides (SEM almanac for GPS, Rapid Precise Ephemerides for GLONASS) rather than SSN radar
tracking. This yields approximately **10x better positional accuracy** (~0.87 km vs ~7.5 km
average error for GPS).

> **Note:** The supplemental endpoint is `sup-gp.php` and uses the `FILE` parameter.

    GET https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE={file}&FORMAT={format}

| Category                    | FILE value   |
|-----------------------------|--------------|
| GPS Operational (SupGP)     | `gps-ops`    |
| GLONASS Operational (SupGP) | `glonass-ops`|

#### Rate Limiting & Caching Requirements

> ⚠️ **Critical:** Celestrak only updates GP data every 2 hours. Polling more frequently triggers
> IP-level firewall blocks after 100 HTTP errors (403/301/404) within a 2-hour window.

- Cache downloaded data locally with a timestamp
- Before each fetch, check if cached data is less than 2 hours old — if so, use the cache
- Always validate the HTTP response (check for `200 OK`) before using data
- Handle `403` and `404` responses gracefully; do not retry in a loop
- Use `https://celestrak.org` (`.org`) — `.com` redirects with HTTP 301 and may cause your process to loop

#### Parsing

- **JSON format** (recommended): Each response is a JSON array of OMM objects. Key fields:
  `OBJECT_NAME`, `NORAD_CAT_ID`, `EPOCH`, `MEAN_MOTION`, `ECCENTRICITY`, `INCLINATION`,
  `RA_OF_ASC_NODE`, `ARG_OF_PERICENTER`, `MEAN_ANOMALY`, `BSTAR`
- **TLE format** (legacy, `FORMAT=TLE`): Parse 3-line blocks — line 0 is the satellite name,
  line 1 and line 2 are the standard TLE fields. Does not support catalog numbers above 69999.

---

### 2. Propagates Positions

Use the `sgp4` Python library (`from sgp4.api import Satrec, jday`):

- Compute current ECI position → convert to geodetic (lat/lon/alt_km) using standard
  ECI-to-ECEF-to-LLA transform
- Update positions every **30 seconds** for all loaded satellites
- For the `active` group (~9,000+ objects), ensure efficient vectorization
  (e.g., `sgp4.api.SatrecArray`) or multiprocessing to maintain the 30s loop

---

### 3. Publishes TAK Protobuf

Publish messages to Kafka topic `orbital_raw`:

| Field      | Value                                                                                          |
|------------|-----------------------------------------------------------------------------------------------|
| TAK type   | `a-s-K`                                                                                        |
| uid        | `SAT-{NORAD_ID}`                                                                               |
| callsign   | Satellite name from TLE/OMM                                                                    |
| lat/lon    | Propagated position                                                                            |
| hae        | Altitude in meters (`alt_km * 1000`)                                                           |
| speed      | Orbital velocity magnitude in m/s                                                              |
| course     | Ground track bearing (bearing from previous position)                                          |
| detail     | `{"norad_id": int, "category": str, "period_min": float, "inclination_deg": float}`           |

---

### 4. Refreshes TLE Data

Refresh TLE/GP data every **6 hours** (Celestrak updates TLEs twice daily).

---

### 5. Follows Patterns from Existing Pollers

- Use `asyncio` with `AIOKafkaProducer`
- Use `aiohttp.ClientSession` for HTTP
- Include proper logging, error handling, exponential backoff on fetch failures
- Read config from ENV: `KAFKA_BROKERS`, `REDIS_HOST`
- Include a `requirements.txt` with: `sgp4`, `aiokafka`, `redis`, `aiohttp`, `numpy`
- Include a `Dockerfile` modelled on the existing pollers

---

### 6. Add to docker-compose.yml

- Service name: `sovereign-orbital-pulse`
- Container name: `sovereign-orbital-pulse`
- Same network configuration as other pollers (`sovereign-backend-net`)
- Depends on: `sovereign-redpanda` (healthy)

---

### 7. Add `orbital_raw` Kafka Topic

Add to the Redpanda init script / docker-compose topic creation if one exists, or document
the manual command:

    rpk topic create orbital_raw --partitions 4

---

## Acceptance Criteria

- Service starts cleanly with `docker compose up sovereign-orbital-pulse`
- Satellites publish to `orbital_raw` within 60s of startup
- No unhandled exceptions on Celestrak fetch failure (retry with backoff)
- Memory-stable: position propagation does not grow unbounded

---

### PROMPT 2 — Frontend Orbital Visualization Layer (FE-20)

```

You are implementing the Orbital Visualization layer for Sovereign Watch's tactical frontend.

## Context

Sovereign Watch is a React 18 + TypeScript frontend using:

- Deck.gl (via `@deck.gl/react` and `@deck.gl/layers`) for all tactical overlays
- Mapbox GL JS as the base map (interleaved rendering with `MapboxOverlay`)
- Zustand for global state management
- The backend WebSocket at `ws://localhost:8000/api/tracks/live` streams TAK Protobuf messages
- TAK Protobuf is decoded in a Web Worker (`takWorker.ts`)
- `TacticalMap.tsx` is the main map component — study it thoroughly before editing
- `LayerFilters.tsx` handles visibility toggles — add new toggles here
- `IntelFeed.tsx` handles the intelligence event stream — add satellite events here
- All entity state lives in a Map keyed by `uid` (e.g., `SAT-25544` for ISS)

Satellite tracks come in on the same WebSocket as air/sea tracks, distinguished by
TAK type `a-s-K` (type string contains "K" at position 4).

## Task

Implement the complete satellite tracking visualization:

### 1. Entity Detection

In the TAK decoder / entity processing logic, detect entities with type matching `a-s-K`
and route them to a new `satellites` Map in state, separate from `entities` (air/sea).
Extract `detail` JSON to get `norad_id`, `category`, `period_min`, `inclination_deg`.

### 2. OrbitalLayer Component (`frontend/src/layers/OrbitalLayer.tsx`)

Create a new Deck.gl layer component that renders:

**a) Satellite Position Markers** — `ScatterplotLayer` or custom `IconLayer`:

- Icon: a 4-point diamond/star shape (draw on canvas like existing chevrons in the icon atlas)
- Size: 12px, slightly smaller than aircraft chevrons
- Color by category:
  - GPS/GNSS: `[0, 245, 160]` (mint green)
  - Weather: `[96, 165, 250]` (blue)
  - Communications: `[167, 139, 250]` (purple)
  - Surveillance: `[251, 146, 60]` (orange)
  - Unknown/Other: `[156, 163, 175]` (grey)

**b) Ground Track** — `PathLayer` for each satellite:

- Project forward 90 minutes using pre-computed trail points (sent from backend or computed client-side using a simplified circular orbit approximation)
- Dashed line style if Deck.gl supports it, otherwise semi-transparent (opacity 0.3)
- Same color as the satellite marker, width 1px

**c) Orbital Footprint Circle** — `ScatterplotLayer` with large radius:

- Display when satellite is selected or hovered
- Radius computed from altitude: `footprint_km = 2 * R_earth * acos(R_earth / (R_earth + alt_km))`
- Convert km to meters for Deck.gl radius
- Semi-transparent fill (opacity 0.08), colored outline

### 3. Sidebar Telemetry

When a satellite is selected (click), display in the existing right sidebar:

- Name, NORAD ID, Category
- Altitude (km), Velocity (km/s, derived from speed field in m/s)
- Orbital Period (min), Inclination (°)
- Current lat/lon
- "Pass Alert" badge if satellite footprint overlaps current mission AOR center

### 4. Layer Filters

In `LayerFilters.tsx`, add a new "ORBITAL" section with:

- Master "Satellites" toggle (default: OFF — don't overwhelm on first load)
- Sub-toggles: GPS, Weather, Communications, Surveillance, Other

### 5. Intel Feed Events

When a new satellite enters or leaves the AOR footprint, emit an Intel Feed event:

- Type: "ORBITAL"
- Icon color: category color
- Message: `"{satellite_name} overhead — Alt: {alt}km, Period: {period}min"`

### 6. Performance

- Cap rendered satellites at 500 by default (LEO debris can be enormous in count)
- Use `React.memo` and `useMemo` for layer data transforms
- Do NOT propagate orbits client-side in real-time — rely on backend 30s position updates

## Acceptance Criteria

- Satellite toggle in LayerFilters shows/hides the orbital layer
- Clicking a satellite opens its telemetry in the sidebar
- Ground track renders without performance degradation
- Footprint circle appears on selection
- No TypeScript errors, no console errors

```

---

### PROMPT 3 — Undersea Cable Infrastructure Layer (FE-21)

```

You are implementing the Undersea Cable Infrastructure visualization layer for Sovereign Watch.

## Context

Sovereign Watch is a React 18 + TypeScript frontend (see PROMPT 2 context for full stack details).
This feature is PURELY FRONTEND — no new backend service is required.
The cable data is static GeoJSON bundled as a public asset.

## Task

### 1. Cable Data Asset

Download and save the TeleGeography submarine cable map GeoJSON data to:

- `frontend/public/data/submarine-cables.geojson`
- `frontend/public/data/cable-landing-points.geojson`

The source data is available from the TeleGeography GitHub repository:
`https://raw.githubusercontent.com/telegeography/www.submarinecablemap.com/master/web/public/api/v3/cable/all.json`
`https://raw.githubusercontent.com/telegeography/www.submarinecablemap.com/master/web/public/api/v3/landing-point/all.json`

Fetch these at build time or on component mount with `fetch('/data/submarine-cables.geojson')`.

If the above URLs are not accessible, provide a minimal representative GeoJSON with 3-5
real major cables (e.g., "TAT-14", "FLAG/FALCON", "SEA-ME-WE 4") for demonstration,
with accurate approximate route geometry.

### 2. CableLayer Component (`frontend/src/layers/CableLayer.tsx`)

Create a Deck.gl layer component with:

**a) Cable Routes** — `PathLayer`:

- Data: GeoJSON LineString features (cable routes)
- Color: `[0, 245, 255, 180]` (cyan, semi-transparent) for active cables
- Width: 2px at zoom < 8, 3px at zoom ≥ 8 (use `widthMinPixels: 2`)
- Animated "pulse" effect: Use `currentTime` (from `Date.now()`) to animate a brighter
  segment traveling along each cable. Achieve this with a custom shader via `PathLayer`
  extension OR by rendering an additional fast-moving `ScatterplotLayer` point per cable
  offset by `(currentTime / cableLength) % 1.0` along the path. The simpler point-traveling
  approach is preferred for maintainability.
- On hover: highlight to `[255, 255, 255, 220]` (white), show tooltip
- Color variants: under construction `[251, 191, 36, 180]` (amber), disrupted `[239, 68, 68, 180]` (red)

**b) Landing Stations** — `ScatterplotLayer` or `IconLayer`:

- Icon: small square/anchor symbol distinct from vessel/aircraft icons
- Color: `[0, 245, 255]` (matching cable color)
- Size: 8px
- On hover/click: show station name, country, cables served

**c) Zoom-Dependent Visibility**:

- Zoom < 2: hide everything
- Zoom 2-5: show landing stations only
- Zoom ≥ 5: show full cable routes + landing stations

### 3. Cable Metadata Popup

Implement a hover tooltip (use the existing tooltip/popup pattern in the codebase, or a
simple absolutely-positioned div) showing:

- Cable Name (e.g., "SEA-ME-WE 4")
- Owner/Operator Consortium (e.g., "Orange, Tata, Telecom Egypt...")
- Capacity (Tbps if available in data, else "N/A")
- Year Ready For Service (RFS)
- Landing Points (comma-separated country list)
- Length (km)
- Status badge: ACTIVE / CONSTRUCTION / DISRUPTED

When a cable is clicked (not just hovered), open the detail in the right sidebar panel.

### 4. CableDetail Sidebar Panel (`frontend/src/components/CableDetail.tsx`)

Sidebar panel for selected cable showing all metadata fields above, plus:

- Estimated data capacity bar visualization (relative to max in dataset)
- A list of landing point countries with flag emojis
- "Strategic Importance" badge (computed from: number of countries served × capacity tier)

### 5. Layer Filters

In `LayerFilters.tsx`, add a new "INFRA" section (below ORBITAL):

- "Submarine Cables" toggle (default: OFF)
- "Landing Stations" sub-toggle (default: ON when cables are ON)
- Opacity slider for cable routes (range 20%–100%, default 60%)

### 6. Intel Feed Integration

No automatic Intel Feed events for static cables. However:

- When the user first enables the cable layer, emit one Intel Feed entry:
  `"INFRA: {N} submarine cables loaded — {M} landing stations active"`

### 7. Tactical Aesthetic

Ensure the cable layer matches the "Neon Noir / Sovereign Glass" aesthetic:

- Use cyan/teal tones consistent with the existing palette
- The traveling pulse animation should feel like data flowing through fiber
- Avoid overly bright or cluttered rendering at global zoom levels

## Acceptance Criteria

- Cable layer toggles on/off cleanly in LayerFilters
- Hovering a cable shows cable name and key metadata
- Clicking a cable opens CableDetail in sidebar
- Landing stations are visible and interactive
- Animation is smooth at 60fps (use `requestAnimationFrame` pattern already in TacticalMap)
- No TypeScript errors
- Graceful fallback if GeoJSON fetch fails (log warning, show empty layer)

```

---

### PROMPT 4 — ADS-B Drone Classification Enhancement (Ingest-07a)

```

You are enhancing the ADS-B drone classification in Sovereign Watch's existing poller.

## Context

The `backend/ingestion/poller/` service already classifies aircraft into types including
a basic drone/UAV detection. The existing code is in:

- `backend/ingestion/poller/main.py` (or the equivalent classification file)
- The classification produces TAK subtypes that feed `LayerFilters.tsx` drone toggle

The v0.7.3 changelog confirms drone sub-classification exists but may be incomplete.
Read `main.py` and `multi_source_poller.py` fully before making changes.

## Task

Improve drone detection and classification accuracy in the ADS-B poller:

### 1. ICAO Type Code Expansion

The current classifier likely checks for some ICAO aircraft type codes. Expand to include
the full set of known drone/UAS type codes:

- `GRND` (generic ground vehicle — sometimes used by drones)
- Any type code beginning with `~` (drone registration codes)
- Specific known UAS codes: `Q` prefix codes are used in some systems
- ICAO doc 8643 codes for UAV: check for trailing `Q` in wake turbulence category or
  `UNM` (Unmanned) in category descriptions

### 2. Operator / Registration String Detection

Add the following operator strings to the drone detection list (in addition to any existing ones):

- "USAF RQ-", "RQ-4", "MQ-9", "MQ-1", "RQ-170", "RQ-180" (military USAF)
- "General Atomics", "Northrop Grumman" (common UAS manufacturers)
- "DRONE", "UAV", "UAS", "RPV", "RPAS" (string matches in callsign/operator)
- "SKYDIO", "WINGCOPTER", "ZIPLINE", "WINGTRA" (commercial delivery drones with ADS-B)
- "MAVIC", "PHANTOM", "DJI" (consumer drones sometimes tracked)

### 3. Sub-Classification Output

When a drone is detected, tag the TAK event with a more granular sub-type in the `detail`
JSON field:

- `drone_class`: one of `"MILITARY_UAS"`, `"COMMERCIAL_UAS"`, `"CIVIL_UAS"`, `"UNKNOWN_UAS"`
- Military: matches military operator strings above, squawk 7400 (lost link) or military squawk
- Commercial: known delivery/survey operators
- Civil: consumer drones / unknown registration

### 4. Squawk Code Intelligence

- Squawk `7400` = UAS/drone lost comms link — always classify as drone, emit alert
- Add a check: if squawk == "7400", force drone classification regardless of type code

### 5. Update TAK `detail` field

Ensure the drone `detail` JSON includes:

```json
{
  "aircraft_class": "drone",
  "drone_class": "MILITARY_UAS",
  "squawk": "7400",
  "operator": "USAF",
  "type_code": "RQ4"
}
```

### 6. No Breaking Changes

- Do NOT change the Kafka message schema in a way that breaks the existing frontend decoder
- The `detail` field is a JSON string — safe to add new keys
- Keep all existing classification logic intact

## Acceptance Criteria

- Known drone callsigns (e.g., "RQ4 GLOBAL HAWK") classified as drone in the Intel Feed
- Squawk 7400 always triggers drone classification
- `drone_class` sub-field present in TAK detail for all drone entities
- No regression in existing aircraft classification
- Unit test (optional but recommended): provide a sample ADS-B JSON fixture for a known
  drone and verify output classification

```

---

### PROMPT 5 — ROADMAP.md Update

```

You are updating the Sovereign Watch ROADMAP.md to reflect the Phase 8 feature additions.

Read the current `ROADMAP.md` file fully before making changes.

Add the following new tasks to the appropriate sections:

## To "Next Priority (P0-P1)" section, add:

| **Ingest-03** | Orbital Pulse | Data Eng | **(P0)**. Celestrak TLE fetch → SGP4 propagation → `orbital_raw` Kafka topic. 6h refresh cycle. |
| **FE-20** | Orbital Visualization | Frontend | **(P0)**. `OrbitalLayer.tsx`: satellite icons (GPS/Weather/Comms/Surveillance), ground track lines, footprint circles, sidebar telemetry, pass alerts. |
| **FE-21** | Undersea Cable Layer | Frontend | **(P1)**. `CableLayer.tsx`: animated fiber routes (TeleGeography GeoJSON), landing station markers, cable metadata popup, INFRA toggle in LayerFilters. |
| **Ingest-07a** | ADS-B Drone Enhancement | Data Eng | **(P1)**. Expand drone ICAO type-code detection, squawk 7400 classification, drone sub-type tagging in TAK detail field. |
| **FE-22** | Drone Tactical Layer | Frontend | **(P1)**. Dedicated drone icon/chevron layer, operator position link line (if Remote ID), DroneDetail sidebar panel. |

## To "Backlog (P2)" section, add:

| **Ingest-07** | Drone Remote ID Poller | Data Eng | OpenDroneID / FAA Remote ID SDR pipeline → `drone_raw` Kafka topic. Requires RTL-SDR hardware. |

## Update the version/date line at the bottom:

Change to: `Updated 2026-02-20. Phase 8 feature plan added (Orbital, Undersea Cable, Drone).`

```

---

## Recommended Execution Order

```

1. PROMPT 5 — Update ROADMAP.md (< 10 min, sets context for all other work)
2. PROMPT 1 — Orbital Pulse backend (1–2 hours)
3. PROMPT 4 — ADS-B Drone enhancement (30–45 min, low risk, existing service)
4. PROMPT 2 — Orbital frontend layer (2–3 hours, depends on PROMPT 1)
5. PROMPT 3 — Undersea Cable layer (2–3 hours, fully independent)

```

Prompts 4 and 3 are **fully independent** of each other and can be run in parallel by separate agents.

---

_Document authored 2026-02-20. Approved for Phase 8 implementation._
```

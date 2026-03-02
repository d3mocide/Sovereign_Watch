# Sovereign Watch — Phase 9 Feature Roadmap

## RF Communications & Emergency Services Infrastructure Intelligence

**Date:** 2026-03-02
**Version Target:** v0.14.x — v0.17.x
**Status:** Planning / Agent-Ready
**Prerequisite:** `docs/INFRASTRUCTURE_MAPPING_REPORT_2026-03-02.md`

---

## Current State Summary (v0.13.0)

The following INT domains are **complete and operational**:

| Domain | Status | Notes |
| :--- | :--- | :--- |
| Aviation (ADS-B) | ✅ Done | Multi-source, arbitration, drone classification (v0.12.1) |
| Maritime (AIS) | ✅ Done | Real-time WebSocket, 11 ship categories |
| Orbital (Satellites) | ✅ Done | Celestrak TLE + SGP4, OrbitalLayer.tsx |
| Submarine Cables | ✅ Done | TeleGeography GeoJSON, animated cable routes (v0.12.0) |
| RF Repeaters | ✅ Done | RepeaterBook proxy, mode detection (FM/DMR/P25/D-Star/Fusion) |
| JS8Call HF Radio | ✅ Done | RadioTerminal.tsx, KiwiSDR TCP bridge |
| Replay / Historian | ✅ Done | TimescaleDB, time-slider |
| Code Audit | ✅ Done | 20 bugs resolved (v0.13.0) |

**Remaining P1 carry-forward:**

| ID | Task | Status |
| :--- | :--- | :--- |
| **FE-22** | Drone Tactical Layer | Pending — `DroneLayer.tsx` not yet created |
| **Fix-01** | CoT Tracking Restore | Pending |

---

## Phase 9 Scope

Eight new features across two sprints:

### Sprint A — Frontend Quick Wins (no new backend)

| ID | Feature | Complexity |
| :--- | :--- | :--- |
| **FE-22** | Drone Tactical Layer | Low — classifier done, layer missing |
| **FE-27** | Repeater Mode Sub-Filters | Very Low — data already in API |
| **FE-25a** | NOAA Weather Radio Layer | Very Low — static JSON asset |
| **FE-25c** | PSAP / 911 Centers Layer | Very Low — static GeoJSON asset |

### Sprint B — New Backend + Frontend Pairs

| ID | Feature | Complexity |
| :--- | :--- | :--- |
| **Ingest-09 + FE-23** | P25 Trunked System Layer | Medium — RadioReference API |
| **Ingest-10 + FE-24** | APRS Infrastructure Layer | Medium — APRS-IS TCP stream |
| **Ingest-11 + FE-25b** | FCC ASR Tower Layer | Medium — FCC public DB |
| **Ingest-12 + FE-26** | DMR Brandmeister Layer | Low — Brandmeister REST API |

---

## Reference: Key Architecture Patterns

Before writing any code, read these files in full:

**Backend patterns:**
- `backend/ingestion/orbital_pulse/service.py` — canonical async Kafka producer service
- `backend/ingestion/orbital_pulse/main.py` — entrypoint pattern
- `backend/api/routers/repeaters.py` — canonical API proxy router
- `backend/ingestion/orbital_pulse/Dockerfile` — container template

**Frontend patterns:**
- `frontend/src/hooks/useRepeaters.ts` — localStorage cache + fetch hook pattern
- `frontend/src/hooks/useInfraData.ts` — static asset fetch with fallback pattern
- `frontend/src/layers/buildRepeaterLayers.ts` — Deck.gl layer builder pattern
- `frontend/src/layers/OrbitalLayer.tsx` — full component pattern with icon atlas
- `frontend/src/components/widgets/LayerFilters.tsx` — filter toggle UI pattern
- `frontend/src/types.ts` — all shared TypeScript interfaces
- `frontend/src/components/map/TacticalMap.tsx` — layer integration point

**TAK event format** (from `orbital_pulse/service.py`):
```json
{
  "uid": "PREFIX-ID",
  "type": "a-s-K",
  "how": "m-g",
  "time": 1234567890000,
  "start": "2026-03-02T00:00:00Z",
  "stale": "2026-03-02T00:01:00Z",
  "point": { "lat": 0.0, "lon": 0.0, "hae": 0.0, "ce": 9999, "le": 9999 },
  "detail": { ... }
}
```

**Docker Compose service template** (from `docker-compose.yml`):
```yaml
service-name:
  build:
    context: ./backend/ingestion/service_dir
    dockerfile: Dockerfile
  container_name: sovereign-service-name
  environment:
    - KAFKA_BROKERS=sovereign-redpanda:9092
    - REDIS_HOST=sovereign-redis
    - REDIS_PORT=6379
    - CENTER_LAT=${CENTER_LAT:-45.5152}
    - CENTER_LON=${CENTER_LON:--122.6784}
  networks:
    - backend-net
  depends_on:
    redpanda:
      condition: service_healthy
    redis:
      condition: service_started
  restart: unless-stopped
```

---

## SPRINT A — Agent Prompts

---

### PROMPT A1 — Drone Tactical Layer (FE-22)

```
You are implementing the Drone Tactical Layer for Sovereign Watch.

## Context

Sovereign Watch is a React 18 + TypeScript + Deck.gl tactical map frontend.

Key files to READ FULLY before coding:
- frontend/src/layers/OrbitalLayer.tsx (full component structure with icon atlas)
- frontend/src/layers/buildRepeaterLayers.ts (simpler layer builder pattern)
- frontend/src/components/widgets/LayerFilters.tsx (how sub-filters are added)
- frontend/src/components/map/TacticalMap.tsx (where layers are integrated)
- frontend/src/types.ts (CoTEntity, RepeaterStation, etc.)
- frontend/src/App.tsx (filter state management)

Drone entities already flow from the ADS-B poller. The TAK worker routes
entities to the `entities` Map. Drone classification is in:
  entity.classification.category === 'drone'
  entity.detail.drone_class: "MILITARY_UAS" | "COMMERCIAL_UAS" | "CIVIL_UAS" | "UNKNOWN_UAS"

The `showDrone` filter toggle already exists in LayerFilters.tsx but is
currently wired to the main AIR layer with no dedicated visual distinction.

## Task

### 1. DroneLayer component — `frontend/src/layers/DroneLayer.tsx`

Create a new Deck.gl layer builder (same pattern as `buildRepeaterLayers.ts`)
that takes `(drones: CoTEntity[], globeMode, filters, onEntitySelect, setHoveredEntity, setHoverPosition)`.

**a) Drone icon** — draw on canvas like OrbitalLayer's satellite icon:
- Shape: hexagonal rotor (6-sided with inner circle) — clearly distinct from
  the 4-point aircraft chevron and the satellite diamond
- Canvas: 64x64, draw 6 outer blades radiating from center hub

**b) Color by drone_class** (read from `entity.detail.drone_class`):
- `MILITARY_UAS`: Amber `[251, 146, 60, 255]`
- `COMMERCIAL_UAS`: Sky blue `[56, 189, 248, 255]`
- `CIVIL_UAS`: Rose `[251, 113, 133, 255]`
- `UNKNOWN_UAS` / fallback: Gray `[156, 163, 175, 255]`

**c) Layers to build:**
- `IconLayer` for drone icons (size: 20px, pickable, hover + click handlers)
- `ScatterplotLayer` for glow halo (non-pickable, radius 14px, alpha 40)
- Callsign label at zoom >= 9 (`TextLayer`, same pattern as repeater labels)

**d) Hover/click handlers** — identical pattern to `buildRepeaterLayers.ts`:
- `onHover`: call `setHoveredEntity` + `setHoverPosition`
- `onClick`: call `onEntitySelect` with the entity

### 2. Filter sub-filters — `frontend/src/components/widgets/LayerFilters.tsx`

Expand the existing `showDrone` toggle to be expandable (like AIR/SEA/ORBITAL)
with sub-filters for drone class. Add state: `const [droneExpanded, setDroneExpanded] = useState(false)`

Sub-filters:
- MIL (showDroneMilitary) — amber accent `border-amber-500/20`
- COM (showDroneCommercial) — sky accent `border-sky-400/20`
- CIV (showDroneCivil) — rose accent `border-rose-400/20`
- UNK (showDroneUnknown) — gray accent `border-gray-400/20`

Follow the exact same expand pattern as the AIR section (chevron rotate, grid layout).

### 3. TacticalMap integration — `frontend/src/components/map/TacticalMap.tsx`

- Import and call `buildDroneLayers` (from DroneLayer.tsx) inside the
  animation loop's layer array builder
- Pass `showDrone`, `showDroneMilitary`, `showDroneCommercial`, `showDroneCivil`,
  `showDroneUnknown` from `filters` prop
- Filter `entities` map: `[...entities.values()].filter(e => e.classification?.category === 'drone' || (e.detail?.aircraft_class === 'drone'))`
- Add prop types for the new filter keys to the `TacticalMapProps` interface

### 4. App.tsx

Add `showDroneMilitary`, `showDroneCommercial`, `showDroneCivil`, `showDroneUnknown`
(all default `true`) to the filters state object.

Pass all four through to `LayerFilters` and `TacticalMap`.

## Acceptance Criteria

- Drone entities render with rotor icon, distinct from aircraft chevrons
- Color reflects military/commercial/civil/unknown class
- Sub-filter toggles show/hide by class
- Hover tooltip and click-to-select work
- No TypeScript errors
```

---

### PROMPT A2 — Repeater Mode Sub-Filters (FE-27)

```
You are adding mode-based sub-filters to the Repeater layer in Sovereign Watch.

## Context

Read these files FULLY before coding:
- frontend/src/components/widgets/LayerFilters.tsx (current REPEATERS section at bottom)
- frontend/src/layers/buildRepeaterLayers.ts (repeaterColor function uses modes array)
- frontend/src/hooks/useRepeaters.ts
- frontend/src/types.ts (RepeaterStation.modes is string[])
- frontend/src/App.tsx (current filter state)

The `RepeaterStation.modes` array already contains strings from:
  ["FM Analog", "D-Star", "Fusion", "DMR", "P25", "NXDN", "TETRA"]

The current REPEATERS filter block has a toggle but NO expand/sub-filters.
All mode data is already present in the API response — this is a PURE FRONTEND change.

## Task

### 1. LayerFilters.tsx — expand REPEATERS section

Make the REPEATERS section expandable (same pattern as AIR/SEA/ORBITAL sections).

Add state: `const [repeaterExpanded, setRepeaterExpanded] = useState(false)`

Change the current simple row into a layout with:
- Left: `<Radio>` icon + "REPEATERS" label (click to expand)
- Right: master toggle switch (click to toggle showRepeaters)
- Chevron rotate indicator (same as AIR section)

Sub-filter grid (shown when `repeaterExpanded && filters.showRepeaters`):

| Label | Filter key | Accent color | Icon |
|---|---|---|---|
| FM | showRepFM | emerald `#34d399` | 📻 |
| P25 | showRepP25 | violet `#8b5cf6` | 🔷 |
| DMR | showRepDMR | purple `#a855f7` | 🔵 |
| D-STAR | showRepDStar | blue `#60a5fa` | ⬡ |
| FUSION | showRepFusion | teal `#2dd4bf` | 🔷 |
| OPEN | showRepOpen | green (shows use=="OPEN" only) | 🔓 |

Sub-filter logic: a repeater passes a sub-filter if:
- `showRepFM`: modes includes "FM Analog" OR modes is empty (implicit FM)
- `showRepP25`: modes includes "P25"
- `showRepDMR`: modes includes "DMR"
- `showRepDStar`: modes includes "D-Star"
- `showRepFusion`: modes includes "Fusion"
- `showRepOpen`: use === "OPEN"

A repeater is shown if it matches AT LEAST ONE enabled sub-filter.
If ALL sub-filters are disabled, show nothing (consistent with AIR behavior).

### 2. buildRepeaterLayers.ts — apply filter

Add a `filters` parameter to `buildRepeaterLayers`:
```ts
filters?: {
  showRepFM?: boolean;
  showRepP25?: boolean;
  showRepDMR?: boolean;
  showRepDStar?: boolean;
  showRepFusion?: boolean;
  showRepOpen?: boolean;
}
```

At the top of the function, filter the `repeaters` array before clustering:
```ts
const filtered = filters ? repeaters.filter(r => {
  const modes = r.modes.map(m => m.toLowerCase());
  if (filters.showRepFM !== false && (modes.includes('fm analog') || modes.length === 0)) return true;
  if (filters.showRepP25 !== false && modes.some(m => m.includes('p25'))) return true;
  if (filters.showRepDMR !== false && modes.some(m => m.includes('dmr'))) return true;
  if (filters.showRepDStar !== false && modes.some(m => m.includes('d-star'))) return true;
  if (filters.showRepFusion !== false && modes.some(m => m.includes('fusion'))) return true;
  if (filters.showRepOpen !== false && r.use === 'OPEN') return true;
  return false;
}) : repeaters;
```
Use `filtered` instead of `repeaters` throughout.

### 3. TacticalMap.tsx — pass filters to layer builder

Pass the new filter keys when calling `buildRepeaterLayers`. Read TacticalMap.tsx
to find the existing call site and add the filters parameter.

### 4. App.tsx

Add to filters state (all default `true`):
`showRepFM, showRepP25, showRepDMR, showRepDStar, showRepFusion, showRepOpen`

## Acceptance Criteria

- REPEATERS section in LayerFilters is now expandable
- Each mode sub-filter shows/hides only repeaters of that type on the map
- FM-only repeaters hidden when showRepFM is off
- P25 sites (violet dots) hidden when showRepP25 is off
- No TypeScript errors
```

---

### PROMPT A3 — NOAA Weather Radio Layer (FE-25a)

```
You are implementing the NOAA Weather Radio transmitter layer for Sovereign Watch.

## Context

Read these files FULLY before coding:
- frontend/src/hooks/useInfraData.ts (static asset fetch + localStorage cache pattern)
- frontend/src/layers/buildRepeaterLayers.ts (simple ScatterplotLayer + TextLayer builder)
- frontend/src/components/widgets/LayerFilters.tsx (INFRA section — add a new toggle here)
- frontend/src/components/map/TacticalMap.tsx (how cablesData is used — follow same pattern)
- frontend/src/types.ts

This is a PURELY FRONTEND feature. No new backend service is needed.
NOAA Weather Radio (NWR) broadcasts on 7 frequencies (162.400–162.550 MHz)
from ~1,000+ transmitters across the US.

## Task

### 1. Fetch NOAA transmitter data

NOAA publishes a public station list. Fetch at runtime from:
  https://www.weather.gov/source/nwr/station.json

This may require a CORS proxy. Use the same pattern as `useInfraData.ts`
(try `api.codetabs.com/v1/proxy` + `encodeURIComponent(url)` as fallback).

If the real API is unreachable, use this hardcoded fallback with 5 representative
stations (accurate coordinates and frequencies):

```json
[
  { "id": "KEC83", "name": "New York City, NY", "state": "NY", "lat": 40.7128, "lon": -74.0060, "freq": "162.550", "power_watts": 1000, "range_miles": 40 },
  { "id": "KHB36", "name": "Los Angeles, CA", "state": "CA", "lat": 34.0522, "lon": -118.2437, "freq": "162.400", "power_watts": 1000, "range_miles": 40 },
  { "id": "KZZ74", "name": "Chicago, IL", "state": "IL", "lat": 41.8781, "lon": -87.6298, "freq": "162.475", "power_watts": 1000, "range_miles": 40 },
  { "id": "WXK48", "name": "Houston, TX", "state": "TX", "lat": 29.7604, "lon": -95.3698, "freq": "162.525", "power_watts": 1000, "range_miles": 40 },
  { "id": "KZZ73", "name": "Seattle, WA", "state": "WA", "lat": 47.6062, "lon": -122.3321, "freq": "162.400", "power_watts": 1000, "range_miles": 40 }
]
```

### 2. Hook — `frontend/src/hooks/useNoaaRadio.ts`

Create a hook following the `useInfraData.ts` pattern:
- Fetch on mount, localStorage cache 7 days (`noaa_wx_data`, `noaa_wx_ts`)
- Return `{ noaaStations, noaaLoading }`
- TypeScript interface:
```ts
export interface NoaaStation {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  freq: string;       // "162.400" through "162.550"
  power_watts?: number;
  range_miles?: number;
}
```
Add `NoaaStation` to `frontend/src/types.ts`.

### 3. Layer — `frontend/src/layers/buildNoaaLayers.ts`

Create a layer builder `buildNoaaLayers(stations, globeMode, onEntitySelect, setHoveredEntity, setHoverPosition, zoom)`.

**Layers to build:**
- **Coverage circle** (`ScatterplotLayer`, non-pickable):
  - Radius: `(station.range_miles || 40) * 1609` meters
  - Fill: `[245, 158, 11, 12]` (amber-500, very faint)
  - Stroke: `[245, 158, 11, 60]`, width 1px
  - Only render at zoom >= 6 (noisy at national scale)

- **Station dot** (`ScatterplotLayer`, pickable):
  - Radius 6px
  - Fill: `[245, 158, 11, 220]` (amber)
  - Glow halo: 10px, alpha 40, non-pickable
  - Hover/click handlers — convert to CoTEntity for existing tooltip/sidebar pipeline:
    ```ts
    uid: `noaa-${station.id}`,
    type: "noaa-wx",
    callsign: station.id,
    detail: { name: station.name, freq: station.freq, state: station.state, power_watts: station.power_watts }
    ```

- **Label** (`TextLayer` at zoom >= 9):
  - Text: `${station.id}\n${station.freq}`
  - Amber color, 10px, monospace, offset `[0, -14]`

### 4. LayerFilters.tsx — INFRA section

Add a new "INFRA" section below ORBITAL (or expand the existing submarine cable controls
into a named INFRA group). Add toggle:
- `showNoaaWx` — amber accent, icon: ⛈️, label: "NOAA WX"

### 5. TacticalMap.tsx

- Call `useNoaaRadio()` hook (or receive stations via prop from App.tsx — follow existing repeater pattern)
- Call `buildNoaaLayers(...)` inside the layer array
- Conditionally render based on `filters.showNoaaWx`

### 6. App.tsx

Add `showNoaaWx: false` (default OFF) to filters state.

## Acceptance Criteria

- NOAA WX toggle in LayerFilters shows/hides transmitter dots
- Coverage circles visible at zoom >= 6
- Hover tooltip shows ID, frequency, city, state
- 7-day localStorage cache works
- Graceful fallback to hardcoded 5 stations if fetch fails
- No TypeScript errors
```

---

### PROMPT A4 — PSAP / 911 Centers Layer (FE-25c)

```
You are implementing the PSAP (Public Safety Answering Point / 911 Dispatch Center)
infrastructure layer for Sovereign Watch.

## Context

Read these files FULLY before coding:
- frontend/src/hooks/useInfraData.ts (static asset pattern)
- frontend/src/layers/buildRepeaterLayers.ts (ScatterplotLayer + TextLayer)
- frontend/src/components/widgets/LayerFilters.tsx (add to INFRA section)
- frontend/src/components/map/TacticalMap.tsx
- frontend/src/types.ts

This is a PURELY FRONTEND feature using a bundled static GeoJSON asset.
PSAPs are the physical 911 dispatch centers — strategic nodes in emergency response.

## Task

### 1. TypeScript interface

Add to `frontend/src/types.ts`:
```ts
export interface PsapCenter {
  id: string;
  name: string;
  state: string;
  county: string;
  type: string;   // "PRIMARY" | "BACKUP" | "SECONDARY"
  lat: number;
  lon: number;
  address?: string;
  agency?: string;
}
```

### 2. Static data asset — `frontend/public/data/psap-centers.geojson`

The FCC maintains a public PSAP registry. Attempt to fetch at runtime from:
  https://geo.fcc.gov/api/census/block/find (note: this is per-point)

Better source: Use the NENA (National Emergency Number Association) public data.
In practice, bundle a representative static GeoJSON of ~50 well-known US PSAPs.

Create `frontend/public/data/psap-centers.geojson` as a GeoJSON FeatureCollection
with at minimum these representative centers (accurate coordinates):

```json
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "properties": { "id": "PSAP-NYC-1", "name": "NYC Emergency Communications", "state": "NY", "county": "New York", "type": "PRIMARY", "agency": "NYPD" }, "geometry": { "type": "Point", "coordinates": [-73.9857, 40.7484] } },
    { "type": "Feature", "properties": { "id": "PSAP-LA-1", "name": "LAPD Communications Division", "state": "CA", "county": "Los Angeles", "type": "PRIMARY", "agency": "LAPD" }, "geometry": { "type": "Point", "coordinates": [-118.2437, 34.0522] } },
    { "type": "Feature", "properties": { "id": "PSAP-CHI-1", "name": "Chicago OEMC", "state": "IL", "county": "Cook", "type": "PRIMARY", "agency": "City of Chicago" }, "geometry": { "type": "Point", "coordinates": [-87.6233, 41.8839] } },
    { "type": "Feature", "properties": { "id": "PSAP-HOU-1", "name": "Houston Emergency Center", "state": "TX", "county": "Harris", "type": "PRIMARY", "agency": "City of Houston" }, "geometry": { "type": "Point", "coordinates": [-95.3677, 29.7499] } },
    { "type": "Feature", "properties": { "id": "PSAP-PHX-1", "name": "Phoenix 911 Communications Center", "state": "AZ", "county": "Maricopa", "type": "PRIMARY", "agency": "Phoenix PD" }, "geometry": { "type": "Point", "coordinates": [-112.0740, 33.4484] } },
    { "type": "Feature", "properties": { "id": "PSAP-SEA-1", "name": "Seattle Police Communications", "state": "WA", "county": "King", "type": "PRIMARY", "agency": "SPD" }, "geometry": { "type": "Point", "coordinates": [-122.3321, 47.6062] } },
    { "type": "Feature", "properties": { "id": "PSAP-DEN-1", "name": "Denver 911", "state": "CO", "county": "Denver", "type": "PRIMARY", "agency": "Denver Sheriff" }, "geometry": { "type": "Point", "coordinates": [-104.9903, 39.7392] } },
    { "type": "Feature", "properties": { "id": "PSAP-ATL-1", "name": "Atlanta 911 Center", "state": "GA", "county": "Fulton", "type": "PRIMARY", "agency": "Atlanta PD" }, "geometry": { "type": "Point", "coordinates": [-84.3880, 33.7490] } },
    { "type": "Feature", "properties": { "id": "PSAP-MIA-1", "name": "Miami-Dade Emergency Dispatch", "state": "FL", "county": "Miami-Dade", "type": "PRIMARY", "agency": "MDPD" }, "geometry": { "type": "Point", "coordinates": [-80.1918, 25.7617] } },
    { "type": "Feature", "properties": { "id": "PSAP-DC-1", "name": "DC Office of Unified Communications", "state": "DC", "county": "DC", "type": "PRIMARY", "agency": "OUC" }, "geometry": { "type": "Point", "coordinates": [-77.0369, 38.9072] } }
  ]
}
```

### 3. Hook — `frontend/src/hooks/usePsapCenters.ts`

Simple hook that fetches `/data/psap-centers.geojson` on mount (no external API):
```ts
export function usePsapCenters(): { psapCenters: PsapCenter[]; psapLoading: boolean }
```
Parse features → PsapCenter objects. localStorage cache 30 days (data is static).
Graceful error handling: return empty array if fetch fails, log warning.

### 4. Layer — `frontend/src/layers/buildPsapLayers.ts`

Builder: `buildPsapLayers(centers, globeMode, onEntitySelect, setHoveredEntity, setHoverPosition, zoom)`

**Layers:**
- **Outer ring** (`ScatterplotLayer`, non-pickable):
  - Radius 10px, fill `[239, 68, 68, 30]` (red-500, faint)
  - Stroke `[239, 68, 68, 100]`, width 1.5px
  - Only render at zoom >= 7

- **Core marker** (`ScatterplotLayer`, pickable):
  - Radius 6px
  - Fill by type: PRIMARY `[239, 68, 68, 230]` (red), BACKUP `[251, 146, 60, 200]` (amber), SECONDARY `[156, 163, 175, 200]` (gray)
  - Hover/click → CoTEntity:
    ```ts
    uid: `psap-${center.id}`,
    type: "psap",
    callsign: center.name,
    detail: { county: center.county, state: center.state, type: center.type, agency: center.agency }
    ```

- **Label** (`TextLayer`, zoom >= 9):
  - Text: center name (truncate to 20 chars)
  - Red, 9px, offset `[0, -14]`

### 5. LayerFilters.tsx

Add to INFRA section (alongside NOAA WX from FE-25a):
- `showPsap` — red accent `border-red-500/20`, icon: 🚨, label: "911 PSAP"

### 6. TacticalMap.tsx + App.tsx

- Call `usePsapCenters()` in TacticalMap (or pass via prop)
- Call `buildPsapLayers(...)` inside layer array
- Add `showPsap: false` (default OFF) to App.tsx filters

## Acceptance Criteria

- 911 PSAP toggle shows/hides dispatch center markers
- PRIMARY (red), BACKUP (amber), SECONDARY (gray) color distinction
- Hover tooltip shows center name, county, state, type, agency
- No TypeScript errors
```

---

## SPRINT B — Agent Prompts

---

### PROMPT B1 — P25 Trunked System Backend Service (Ingest-09)

```
You are implementing the P25 trunked radio system backend service for Sovereign Watch.

## Context

Sovereign Watch uses Python async ingestion services that produce to Redpanda (Kafka-compatible).
Read these files FULLY before coding:
- backend/ingestion/orbital_pulse/service.py (canonical service pattern — setup/shutdown, Kafka, HTTP)
- backend/ingestion/orbital_pulse/main.py (entrypoint pattern)
- backend/ingestion/orbital_pulse/Dockerfile (container template)
- backend/api/routers/repeaters.py (API proxy router pattern)
- backend/ingestion/orbital_pulse/requirements.txt (dependency format)
- docker-compose.yml (service declaration pattern)

## About P25 Trunked Systems

P25 (Project 25 / APCO-25) is the digital radio standard for North American public safety.
A "trunked system" is a multi-site coordinated network — each system has multiple tower sites,
each site has multiple RF channels. RadioReference.com maintains the authoritative public database.

## Data Source: RadioReference.com API

RadioReference provides a REST API at `https://www.radioreference.com/apps/api/`.
It requires registration for a Premium key (store in ENV as `RADIOREFERENCE_API_KEY`).

**Relevant endpoints:**

Get trunked systems near coordinates:
  GET https://www.radioreference.com/apps/api/?action=getSitesByCoords&lat={lat}&lng={lon}&radius={radius}&authKey={key}&fmt=json

Get sites for a system:
  GET https://www.radioreference.com/apps/api/?action=getSitesForTrunkedSystem&sid={system_id}&authKey={key}&fmt=json

Get talkgroups for a system:
  GET https://www.radioreference.com/apps/api/?action=getTalkgroupsForSystem&sid={system_id}&authKey={key}&fmt=json

**If RADIOREFERENCE_API_KEY is not set**, generate synthetic representative data for 3 fictional
P25 systems with accurate-format data (for demo/testing). Log a warning.

**Response fields (per site):**
- `sid`: system ID
- `siteId`: site ID within system
- `sName`: system name
- `stateId`: state
- `lat`, `lon`: site coordinates
- `freq`: control channel frequency list
- `agency`: affiliated agencies
- `systemType`: "P25" | "P25 Phase II" | "Motorola SmartNet"

## Task

### 1. Service — `backend/ingestion/p25_pulse/`

Create a new service directory with:

**`service.py`** — `P25PulseService` class:

```python
class P25PulseService:
    def __init__(self):
        self.running = True
        self.kafka_producer = None
        self.fetch_interval_hours = 24  # P25 site data changes infrequently
        self.radius_miles = int(os.getenv("COVERAGE_RADIUS_NM", "150"))
        self.center_lat = float(os.getenv("CENTER_LAT", "45.5152"))
        self.center_lon = float(os.getenv("CENTER_LON", "-122.6784"))
        self.api_key = os.getenv("RADIOREFERENCE_API_KEY", "")
```

Methods:
- `setup()`: start AIOKafkaProducer, `KAFKA_BROKERS`, topic `p25_sites`
- `shutdown()`: stop producer
- `fetch_p25_sites()`: fetch from RadioReference API or generate synthetic data
  - Implement filesystem cache (same pattern as orbital_pulse) — 24h TTL
  - Cache path: `/app/cache/p25_sites_{lat}_{lon}.json`
- `publish_loop()`: calls `fetch_p25_sites()` every 24h, publishes each site

**TAK event format for P25 sites** (TAK type `a-f-G-E-R` — friendly ground electronic radio):
```python
{
    "uid": f"P25-{system_id}-{site_id}",
    "type": "a-f-G-E-R",
    "how": "h-g-i-g-o",  # human entered, geo, input, geo, origin
    "time": int(now.timestamp() * 1000),
    "start": now_iso,
    "stale": stale_iso,   # 25 hours from now
    "point": {
        "lat": site_lat,
        "lon": site_lon,
        "hae": 0.0,
        "ce": 9999.0,
        "le": 9999.0
    },
    "detail": {
        "contact": { "callsign": system_name },
        "system_id": system_id,
        "site_id": site_id,
        "system_name": system_name,
        "system_type": system_type,  # "P25" | "P25 Phase II"
        "state": state_abbr,
        "control_channels": freq_list,  # ["851.0125", "851.5125"]
        "agencies": agency_list,        # ["County Sheriff", "City Fire"]
        "agency_type": agency_type      # "LAW" | "FIRE" | "EMS" | "MIXED" | "FEDERAL"
    }
}
```

`agency_type` logic: scan agency names for keywords:
- "sheriff" / "police" / "pd" / "law" → `LAW`
- "fire" → `FIRE`
- "ems" / "medical" / "ambulance" → `EMS`
- "federal" / "dhs" / "fbi" / "fema" → `FEDERAL`
- Multiple matches → `MIXED`

**`main.py`** — identical pattern to orbital_pulse/main.py

**`requirements.txt`**:
```
asyncio
aiohttp
aiokafka
redis
```

**`Dockerfile`** — copy from orbital_pulse/Dockerfile (no special system deps needed).

### 2. Backend API router — `backend/api/routers/p25.py`

Create a FastAPI router following `repeaters.py` pattern:

```python
@router.get("/api/p25/sites")
async def get_p25_sites(
    lat: float = Query(...),
    lon: float = Query(...),
    radius: float = Query(default=100.0),
)
```

This endpoint reads from **Redis** cache (populated by the p25_pulse service)
rather than hitting RadioReference directly on every request:
```python
redis_client = aioredis.from_url(f"redis://{REDIS_HOST}:{REDIS_PORT}")
cached = await redis_client.get("p25_sites_cache")
if cached:
    return json.loads(cached)
```

If Redis cache is empty, return 503 with message "P25 data not yet available".

Update `p25_pulse/service.py` to also write to Redis after successful fetch:
```python
await redis_client.set("p25_sites_cache", json.dumps(sites_list), ex=86400)
```

Register the router in `backend/api/main.py`:
```python
from routers import p25
app.include_router(p25.router)
```

### 3. docker-compose.yml

Add service `sovereign-p25-pulse` using the template pattern in the reference architecture.
ENV variables: `KAFKA_BROKERS`, `REDIS_HOST`, `REDIS_PORT`, `CENTER_LAT`, `CENTER_LON`,
`COVERAGE_RADIUS_NM`, `RADIOREFERENCE_API_KEY=${RADIOREFERENCE_API_KEY:-}`.

Add topic `p25_sites` to Redpanda init if a topic init script exists; otherwise document:
  `rpk topic create p25_sites --partitions 2`

## Acceptance Criteria

- Service starts cleanly without RADIOREFERENCE_API_KEY (synthetic data mode)
- With valid API key, P25 sites publish to `p25_sites` topic within 60s
- Sites written to Redis cache with 24h TTL
- `/api/p25/sites` returns cached data or 503
- No unhandled exceptions on fetch failure
```

---

### PROMPT B2 — P25 Frontend Layer (FE-23)

```
You are implementing the P25 Trunked Radio System visualization layer for Sovereign Watch.

## Context

Read these files FULLY before coding:
- frontend/src/hooks/useRepeaters.ts (hook with localStorage cache + fetch pattern)
- frontend/src/layers/buildRepeaterLayers.ts (full Deck.gl layer builder pattern)
- frontend/src/layers/OrbitalLayer.tsx (icon atlas creation, footprint circles)
- frontend/src/components/widgets/LayerFilters.tsx (add P25 section)
- frontend/src/components/map/TacticalMap.tsx (layer integration)
- frontend/src/types.ts

The backend `/api/p25/sites` endpoint (from Ingest-09) returns:
```json
{
  "count": N,
  "results": [{
    "uid": "P25-1234-1",
    "system_name": "County P25 System",
    "system_type": "P25 Phase II",
    "state": "OR",
    "lat": 45.5,
    "lon": -122.6,
    "agency_type": "LAW",
    "agencies": ["Multnomah County Sheriff"],
    "control_channels": ["851.0125", "856.0125"]
  }]
}
```

## Task

### 1. TypeScript interface — `frontend/src/types.ts`

```ts
export interface P25Site {
  uid: string;
  system_name: string;
  system_type: string;
  state: string;
  lat: number;
  lon: number;
  agency_type: string;  // "LAW" | "FIRE" | "EMS" | "MIXED" | "FEDERAL"
  agencies: string[];
  control_channels: string[];
}
```

### 2. Hook — `frontend/src/hooks/useP25Sites.ts`

Follow `useRepeaters.ts` pattern exactly:
- Enabled/disabled by `enabled` prop
- Fetch `/api/p25/sites?lat=...&lon=...&radius=...`
- localStorage cache 24h (`p25_cache_${lat}_${lon}`, `p25_cache_ts`)
- Refetch when mission center moves > 0.5°
- Return `{ p25SitesRef, p25Sites, p25Loading, p25Error }`

### 3. Layer — `frontend/src/layers/buildP25Layers.ts`

Builder: `buildP25Layers(sites, globeMode, selectedSite, onSiteSelect, setHoveredEntity, setHoverPosition, zoom, filters)`

**Color by agency_type:**
```ts
function p25Color(agencyType: string, alpha: number): [number,number,number,number] {
  switch (agencyType.toUpperCase()) {
    case 'LAW':     return [59, 130, 246, alpha];  // blue-500
    case 'FIRE':    return [239, 68, 68, alpha];   // red-500
    case 'EMS':     return [52, 211, 153, alpha];  // emerald-400
    case 'FEDERAL': return [251, 146, 60, alpha];  // amber-400
    default:        return [167, 139, 250, alpha]; // violet-400 (mixed/unknown)
  }
}
```

**Layers to build:**

a) **Coverage estimate circle** (`ScatterplotLayer`, non-pickable, zoom >= 7):
   - Radius: 25,000 meters (typical P25 site range ~15-20mi)
   - Fill: color at alpha 8, stroke: color at alpha 50, width 1px

b) **Site marker** (`ScatterplotLayer`, pickable):
   - Radius 7px, fill color at alpha 220
   - Square outline: `stroked: true, getLineColor: [255,255,255,180], getLineWidth: 1.5`
   - The square/diamond marker visually distinguishes from round repeater dots
   - Hover: `setHoveredEntity` + `setHoverPosition` with CoTEntity wrapper:
     ```ts
     uid: site.uid, type: "p25-site", callsign: site.system_name,
     detail: { system_type: site.system_type, agency_type: site.agency_type,
               agencies: site.agencies.join(", "), control_channels: site.control_channels.join(", "),
               state: site.state }
     ```
   - Click: `onSiteSelect(site)`

c) **Label** (`TextLayer`, zoom >= 9):
   - Text: `${site.system_name}\n${site.agency_type}`
   - Color matches agency type, 10px, offset `[0, -16]`

**Sub-filter support** — filter sites before rendering based on:
- `filters.showP25Law`: agency_type === 'LAW'
- `filters.showP25Fire`: agency_type === 'FIRE'
- `filters.showP25Ems`: agency_type === 'EMS'
- `filters.showP25Federal`: agency_type === 'FEDERAL'
- `filters.showP25Mixed`: all others

### 4. LayerFilters.tsx — new "COMMS" section

Add a new expandable section between ORBITAL and REPEATERS:

Master toggle: "COMMS" with `Radio` icon (or use `Wifi` from lucide-react)
Accent: violet `border-violet-400/30`

Sub-filters:
- P25 (master P25 toggle), then expandable:
  - LAW (showP25Law) — blue
  - FIRE (showP25Fire) — red
  - EMS (showP25Ems) — emerald
  - FED (showP25Federal) — amber
  - MIX (showP25Mixed) — violet

### 5. TacticalMap.tsx + App.tsx

- Call `useP25Sites(enabled, missionLat, missionLon)` in TacticalMap
  (or pass via prop from App — follow the repeater pattern)
- Call `buildP25Layers(...)` inside the animation loop's layer array
- Add filter keys to App.tsx state (all default `false` for P25 — these are specialized)
- Pass via filters prop

## Acceptance Criteria

- P25 toggle in new COMMS section of LayerFilters
- Sites color-coded by agency type (blue=law, red=fire, green=ems, amber=federal)
- Coverage circles at zoom >= 7
- Labels at zoom >= 9
- Hover tooltip shows system name, type, agencies, control channels
- Sub-filters hide/show by agency type
- No TypeScript errors
```

---

### PROMPT B3 — APRS Backend Poller (Ingest-10)

```
You are implementing the APRS (Automatic Packet Reporting System) ingestion service for Sovereign Watch.

## Context

Read these files FULLY before coding:
- backend/ingestion/orbital_pulse/service.py (async service pattern)
- backend/ingestion/orbital_pulse/main.py (entrypoint)
- backend/ingestion/orbital_pulse/Dockerfile
- backend/api/routers/repeaters.py (API router pattern)
- docker-compose.yml

## About APRS

APRS is a real-time digital packet radio protocol on 144.390 MHz (North America).
APRS-IS is the internet backbone — stations connect via TCP to report/relay packets.

The APRS-IS network exposes a TCP filter server:
  Host: rotate.aprs2.net  Port: 14580

After connecting, send a login line:
  `user NOCALL pass -1 vers SovereignWatch 1.0 filter r/45.5/-122.6/200\r\n`
  (NOCALL / pass -1 = receive-only connection, no transmit)

Filter syntax: `r/lat/lon/range_km` — spatial circle filter
Then read incoming APRS packets (one per line).

## APRS Packet Format

APRS packets are ASCII text following AX.25 / APRS spec:
  `CALLSIGN-SSID>DEST,PATH:PAYLOAD`

Position reports (the most common) have payload starting with `!`, `=`, `/`, `@`:
  `W6ABC-9>APRS,WIDE1-1,WIDE2-1:!3401.00N/11800.00W>` (compressed or uncompressed)

Use the `aprslib` Python library to parse:
```python
import aprslib
packet = aprslib.parse(raw_line)
# packet['from'] = callsign
# packet['lat'], packet['lng'] = float
# packet['symbol_table'], packet['symbol'] = char (determines entity type)
# packet['comment'] = str
# packet['speed'], packet['course'] = optional
```

APRS symbol codes determine entity type:
- `/>` : Car/vehicle
- `/k` : Truck
- `/>` : Jeep
- `/[` : Jogger/walker
- `/-` : House/Home
- `/\#` : Digipeater
- `/&` : iGate
- `/_` : Weather station
- `/^` : Aircraft (small)
- `/'` : Small aircraft

## Task

### 1. Service — `backend/ingestion/aprs_poller/`

**`service.py`** — `APRSPollerService` class:

```python
class APRSPollerService:
    def __init__(self):
        self.running = True
        self.kafka_producer = None
        self.center_lat = float(os.getenv("CENTER_LAT", "45.5152"))
        self.center_lon = float(os.getenv("CENTER_LON", "-122.6784"))
        self.radius_km = int(os.getenv("APRS_RADIUS_KM", "300"))
        self.aprs_host = "rotate.aprs2.net"
        self.aprs_port = 14580
```

Methods:
- `setup()`: start AIOKafkaProducer, topic `aprs_raw`
- `shutdown()`: stop producer, close TCP connection
- `connect_aprs()`: open asyncio TCP connection, send login/filter line
- `read_loop()`: read lines from TCP, parse with aprslib, publish to Kafka
  - Skip non-position packets (no lat/lng in parsed result)
  - Reconnect with 15s backoff on disconnect
- `run()`: `asyncio.gather(read_loop())`

**TAK type mapping from APRS symbol:**
```python
def aprs_symbol_to_tak_type(symbol_table: str, symbol: str) -> str:
    sym = symbol_table + symbol
    if sym in ('/&', '\\I'):  return "a-f-G-I-U-T"  # iGate
    if sym in ('/\\#', '\\#'): return "a-f-G-I-U-D" # Digipeater
    if sym == '/_':           return "a-f-G-E-S-W"  # Weather station
    if sym in ('/^', "/'"):   return "a-f-A"         # Aircraft
    if sym == '/-':           return "a-f-G-I-U-H"  # Home station
    return "a-f-G"                                   # Generic ground
```

**TAK event format:**
```python
{
    "uid": f"APRS-{callsign.replace('-', '_')}",
    "type": tak_type,
    "how": "m-g",
    "time": int(now.timestamp() * 1000),
    "start": now_iso,
    "stale": stale_iso,   # 15 minutes from now
    "point": { "lat": lat, "lon": lon, "hae": 0.0, "ce": 100.0, "le": 9999.0 },
    "detail": {
        "contact": { "callsign": callsign },
        "aprs_symbol": symbol_table + symbol,
        "aprs_type": classify_aprs_entity(symbol_table, symbol),
        "comment": packet.get("comment", ""),
        "ssid": ssid
    }
}
```

`classify_aprs_entity` returns: `"igate"` | `"digipeater"` | `"weather"` | `"vehicle"` | `"aircraft"` | `"home"` | `"tracker"`

**`requirements.txt`**:
```
asyncio
aprslib
aiokafka
redis
```

**`Dockerfile`** — from orbital_pulse template; no extra system deps needed.

**`main.py`** — from orbital_pulse template.

### 2. Backend consumer in `backend/api/routers/tracks.py`

The APRS entities flow through Kafka `aprs_raw` and should be consumed by the existing
multi-topic consumer that feeds the WebSocket `/api/tracks/live`.

Read `backend/api/routers/tracks.py` carefully. Add `aprs_raw` to the list of
consumed Kafka topics (alongside `adsb_raw`, `ais_raw`, `orbital_raw`).

The TAK JSON format is the same — the existing WebSocket consumer should forward
APRS entities to the frontend without any other changes.

### 3. docker-compose.yml

Add service `sovereign-aprs-poller` following the template.
ENV: `KAFKA_BROKERS`, `REDIS_HOST`, `REDIS_PORT`, `CENTER_LAT`, `CENTER_LON`, `APRS_RADIUS_KM`.
No external API key needed — APRS-IS is open to receive-only connections.

Add Kafka topic: `rpk topic create aprs_raw --partitions 4`

## Acceptance Criteria

- Service starts, connects to rotate.aprs2.net, and begins receiving packets
- Position packets publish to `aprs_raw` within 60s of startup in an area with APRS activity
- Reconnects automatically after disconnect (15s backoff)
- Non-position packets silently discarded (no error log)
- `aprs_raw` topic consumed by tracks router and forwarded to WebSocket
```

---

### PROMPT B4 — APRS Frontend Layer (FE-24)

```
You are implementing the APRS station visualization layer for Sovereign Watch.

## Context

Read these files FULLY before coding:
- frontend/src/layers/buildRepeaterLayers.ts (Deck.gl builder pattern)
- frontend/src/layers/OrbitalLayer.tsx (icon atlas with canvas drawing)
- frontend/src/components/widgets/LayerFilters.tsx (COMMS section from FE-23)
- frontend/src/components/map/TacticalMap.tsx
- frontend/src/types.ts (CoTEntity, how APRS entities arrive via WebSocket)

APRS entities arrive on the existing WebSocket as CoTEntity objects with:
- `type` beginning with `a-f-G` (ground) or `a-f-A` (aircraft)
- `detail.aprs_type`: `"igate"` | `"digipeater"` | `"weather"` | `"vehicle"` | `"tracker"` | `"home"` | `"aircraft"`
- `detail.aprs_symbol`: 2-char symbol code
- `detail.comment`: APRS comment string
- `uid` starts with `APRS-`

Currently these entities would fall into the main entity Map. We need to:
1. Route them to a separate APRS collection in the entity worker
2. Render them with APRS-specific icons

## Task

### 1. Entity routing — `frontend/src/workers/takWorker.ts`

Read this file carefully. Add logic to route entities with `uid.startsWith('APRS-')`
to a new message type `aprs_update` in addition to (or instead of) the normal
entity update. This keeps APRS entities in a separate Map for the APRS layer.

### 2. TacticalMap state — add `aprsEntities: Map<string, CoTEntity>`

In TacticalMap.tsx, add state for APRS entities. Wire to worker messages of type `aprs_update`.
Apply staleness cleanup (same 5-minute timeout as regular entities).

### 3. Layer — `frontend/src/layers/buildAprsLayers.ts`

Builder: `buildAprsLayers(entities, globeMode, filters, onEntitySelect, setHoveredEntity, setHoverPosition, zoom)`

**Color + icon by aprs_type:**

| type | Color | Description |
|---|---|---|
| `igate` | Cyan `[0, 245, 255, 220]` | Internet gateway — shows internet connectivity |
| `digipeater` | Emerald `[52, 211, 153, 220]` | RF relay node |
| `weather` | Amber `[251, 191, 36, 220]` | Weather station |
| `vehicle` / `tracker` | Blue `[96, 165, 250, 200]` | Mobile station |
| `aircraft` | Orange `[251, 146, 60, 200]` | APRS-equipped aircraft |
| `home` | Gray `[156, 163, 175, 180]` | Fixed home station |

**Layers:**

a) Infrastructure markers (igate, digipeater) — larger, more prominent:
   - `ScatterplotLayer`, radius 8px, square-ish (use `stroked: true`)
   - Outer halo: radius 12px, alpha 30 (non-pickable)
   - Only show when `filters.showAprsInfra !== false`

b) Mobile/vehicle stations:
   - `ScatterplotLayer`, radius 5px, filled
   - Only show when `filters.showAprsVehicles !== false`

c) Weather stations:
   - `ScatterplotLayer`, radius 6px + coverage circle (10km radius, alpha 10)
   - Only show when `filters.showAprsWeather !== false`

d) Labels (`TextLayer`, zoom >= 10):
   - Callsign only, 9px, offset `[0, -12]`, same color as entity

e) All pickable layers → CoTEntity hover/click pipeline (same pattern as repeaters)

### 4. LayerFilters.tsx — extend COMMS section (from FE-23)

Add "APRS" sub-group to the COMMS section:

Master toggle: `showAprs` (default: OFF)
Sub-filters (shown when APRS expanded):
- INFRA (showAprsInfra) — cyan accent — iGates + digipeaters
- MOBILE (showAprsVehicles) — blue accent — vehicles/trackers
- WX (showAprsWeather) — amber accent — weather stations

### 5. App.tsx

Add `showAprs`, `showAprsInfra`, `showAprsVehicles`, `showAprsWeather` to filters state.
All default `false`.

## Acceptance Criteria

- APRS toggle in COMMS section of LayerFilters
- iGates (cyan) and digipeaters (emerald) prominently rendered
- Vehicle trackers rendered as smaller blue dots
- Weather stations with coverage circles
- Sub-filters work independently
- Hover tooltip shows callsign, type, comment
- No TypeScript errors, no regression in existing entity rendering
```

---

### PROMPT B5 — DMR Brandmeister Activity Layer (Ingest-12 + FE-26)

```
You are implementing the DMR Brandmeister network layer for Sovereign Watch.
This is a combined backend + frontend task (smaller scope than B1-B4).

## Context

Read these files:
- backend/api/routers/repeaters.py (backend proxy pattern)
- frontend/src/hooks/useRepeaters.ts (hook pattern)
- frontend/src/layers/buildRepeaterLayers.ts (layer builder)
- frontend/src/components/widgets/LayerFilters.tsx (COMMS section)
- frontend/src/types.ts

## About Brandmeister

Brandmeister is the largest DMR (Digital Mobile Radio) network.
Their public API lists connected repeaters globally with live activity.

**Public endpoints (no API key needed for read-only):**

Get all repeaters:
  GET https://api.brandmeister.network/v2/device/?api_secret=None
  (Returns JSON array)

Relevant fields per repeater:
  `id`, `callsign`, `lat`, `lng`, `city`, `state`, `country`
  `lastSeen` (Unix timestamp), `tx` (transmit freq MHz), `rx` (receive freq)
  `colorCode` (DMR color code 1-15)
  `linkedtalkgroups` (array of active talkgroup IDs)
  `online` (boolean)

## Task

### Backend — `backend/api/routers/dmr.py`

Server-side proxy following the `repeaters.py` pattern:

```python
@router.get("/api/dmr/repeaters")
async def get_dmr_repeaters(
    lat: float = Query(...),
    lon: float = Query(...),
    radius: float = Query(default=100.0)
)
```

- Fetch from Brandmeister API (with 1h server-side cache using a module-level dict + timestamp)
- Filter results to within `radius` miles of `lat/lon` using Haversine
- Return normalized array:
  ```json
  [{
    "id": "310123",
    "callsign": "W6ABC",
    "lat": 45.5,
    "lon": -122.6,
    "city": "Portland",
    "state": "OR",
    "online": true,
    "last_seen": 1234567890,
    "tx_freq": "441.000",
    "rx_freq": "441.600",
    "color_code": 1,
    "active_talkgroups": [3100, 31308]
  }]
  ```
- Register router in `backend/api/main.py`

### Frontend

**Type** — add to `frontend/src/types.ts`:
```ts
export interface DmrRepeater {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  city: string;
  state: string;
  online: boolean;
  last_seen: number;
  tx_freq: string;
  color_code: number;
  active_talkgroups: number[];
}
```

**Hook** — `frontend/src/hooks/useDmrRepeaters.ts`
Follow `useRepeaters.ts` exactly. Endpoint `/api/dmr/repeaters`. Cache 1h (shorter — live data).
Return `{ dmrRepeatersRef, dmrRepeaters, dmrLoading }`.

**Layer** — `frontend/src/layers/buildDmrLayers.ts`
Simple builder following `buildRepeaterLayers.ts`:

- Online repeaters: Purple `[167, 139, 250, 220]` dot, radius 5px
  - If `active_talkgroups.length > 0`: Bright violet `[196, 181, 253, 255]` + pulsing halo
    (render a larger non-pickable halo at radius 10px, alpha 60)
- Offline repeaters: Gray `[100, 116, 139, 120]`, radius 4px
- Label at zoom >= 9: `${callsign}\n${tx_freq}`, purple, 9px

**LayerFilters.tsx** — add to COMMS section:
- `showDmr` toggle — purple accent, icon: 📡, label: "DMR"
- Sub-toggle: `showDmrActive` — "ACTIVE ONLY" (hide offline repeaters)

**App.tsx**: Add `showDmr: false`, `showDmrActive: false` to filters.

## Acceptance Criteria

- DMR toggle shows/hides Brandmeister-connected repeaters
- Active (transmitting) repeaters visually distinct from idle
- Offline repeaters dimmed
- Hover: callsign, freq, color code, active talkgroups
- Server-side 1h cache prevents Brandmeister rate limiting
- No TypeScript errors
```

---

### PROMPT B6 — ROADMAP.md Update

```
You are updating ROADMAP.md to reflect Phase 9 additions and mark completed items.

Read ROADMAP.md fully before making changes.

## 1. Move from "Next Priority" to "Completed" section:

Add these rows to the Completed table:

| **FE-21**      | Undersea Cable Layer    | Frontend  | **DONE** (v0.12.0). `CableLayer.tsx`: animated cable routes, landing stations, INFRA toggle. |
| **Ingest-07a** | ADS-B Drone Enhancement | Data Eng  | **DONE** (v0.12.1). Drone ICAO type-code expansion, squawk 7400, drone_class sub-type. |
| **Audit-01**   | Code Review             | Security  | **DONE** (v0.13.0). 20 bugs resolved across frontend and backend. |

## 2. Remove from "Next Priority" those three rows (FE-21, Ingest-07a, Audit-01).

## 3. Add to "Next Priority (P0–P1)" section:

| **FE-22**   | Drone Tactical Layer       | Frontend | **(P1)**. `DroneLayer.tsx` with rotor icon, drone_class color coding, military/commercial/civil sub-filters, `DroneDetail` sidebar. |
| **FE-27**   | Repeater Mode Sub-Filters  | Frontend | **(P1)**. Expandable REPEATERS section with FM/P25/DMR/D-Star/Fusion/Open sub-toggles. Data already available in RepeaterBook API. |
| **FE-25a**  | NOAA Weather Radio Layer   | Frontend | **(P1)**. Static NOAA transmitter JSON, amber coverage circles, `useNoaaRadio` hook. |
| **FE-25c**  | PSAP / 911 Centers Layer   | Frontend | **(P1)**. Bundled static GeoJSON, red/amber markers by PSAP type. |

## 4. Add to "Backlog (P2)" section:

| **Ingest-09** | P25 System Pulse        | Data Eng  | RadioReference API → P25 trunked system sites, agency type tagging, Redis cache, `/api/p25/sites`. |
| **FE-23**     | P25 System Layer        | Frontend  | `buildP25Layers.ts`: agency-colored site markers, coverage circles, COMMS section in LayerFilters. |
| **Ingest-10** | APRS Stream Poller      | Data Eng  | APRS-IS TCP connection → `aprs_raw` Kafka topic. iGate/digipeater/vehicle/weather classification. |
| **FE-24**     | APRS Layer              | Frontend  | APRS entity routing in takWorker, `buildAprsLayers.ts` with infrastructure vs. mobile vs. weather sub-filters. |
| **Ingest-12** | DMR Brandmeister Pulse  | Data Eng  | Brandmeister API proxy (1h cache), `/api/dmr/repeaters` endpoint. |
| **FE-26**     | DMR Activity Layer      | Frontend  | `buildDmrLayers.ts`: online/offline coloring, active-talkgroup glow. |
| **Ingest-11** | FCC ASR Tower Service   | Data Eng  | FCC public antenna structure DB → `/api/towers` by bounding box. |
| **FE-25b**    | FCC Tower Layer         | Frontend  | `buildTowerLayers.ts`: tower markers by height/type. |

## 5. Update the footer line to:

`Updated 2026-03-02. Phase 9 feature plan added (RF Infrastructure: P25, APRS, DMR, NOAA WX, PSAP). See docs/FEATURE-ROADMAP-PHASE-9.md.`
```

---

## Recommended Execution Order

```
Sprint A (all independent, can run in parallel):
  PROMPT A1 — Drone Tactical Layer (FE-22)        ~2h
  PROMPT A2 — Repeater Sub-Filters (FE-27)        ~1h
  PROMPT A3 — NOAA Weather Radio (FE-25a)         ~1.5h
  PROMPT A4 — PSAP Centers (FE-25c)               ~1.5h

Sprint B (B1 must precede B2; B3 must precede B4; B5 is independent):
  PROMPT B1 — P25 Backend (Ingest-09)             ~2h
  PROMPT B2 — P25 Frontend (FE-23, after B1)      ~2h
  PROMPT B3 — APRS Backend (Ingest-10)            ~2h
  PROMPT B4 — APRS Frontend (FE-24, after B3)     ~1.5h
  PROMPT B5 — DMR Layer (Ingest-12 + FE-26)       ~2h  [fully independent]

Bookend (run last):
  PROMPT B6 — ROADMAP.md update                   ~15min
```

**Parallelism:**
- All 4 Sprint A prompts can run simultaneously
- B1 and B3 can run in parallel with each other
- B5 can run alongside B1/B3
- B2 depends on B1 completing; B4 depends on B3 completing
- B6 can run any time after Sprint A is done

---

## Version Targets

| Version | Features |
| :--- | :--- |
| **v0.14.0** | FE-22 (Drone Layer) + FE-27 (Repeater Sub-Filters) |
| **v0.15.0** | FE-25a (NOAA WX) + FE-25c (PSAP) |
| **v0.16.0** | Ingest-09 + FE-23 (P25) + Ingest-12 + FE-26 (DMR) |
| **v0.17.0** | Ingest-10 + FE-24 (APRS) + Ingest-11 + FE-25b (FCC Towers) |

---

_Document authored 2026-03-02. Based on `INFRASTRUCTURE_MAPPING_REPORT_2026-03-02.md`._

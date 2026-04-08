# Frontend UI User Guide

> **Access:** `http://localhost` (or your server IP on port 80)
> **Stack:** React + Vite + Deck.gl + MapLibre/Mapbox GL JS

---

## Overview

The Sovereign Watch interface is a **full-screen tactical operations center** (TOC) built around two primary map modes:

| Mode | Purpose |
| :--- | :--- |
| **Tactical Map** | Aviation, Maritime, Infrastructure — all surface and airborne domain entities |
| **Orbital Map** | Space domain — satellite positions, ground tracks, and pass predictions |
| **Intel Globe** | Global intelligence and risk-centric view for GDELT-driven context and fused geographic overlays |
| **Dashboard** | High-level operational summary, health, and metrics panels |
| **Radio** | JS8Call and SDR-oriented radio operations view |

Switch between modes using the **mode toggle** in the TopBar.

---

## Interface Layout

```text
┌────────────────────────── TopBar ──────────────────────────────┐
│  [Mode Toggle]  [UTC Clock]  [Entity Count]  [System Controls] │
├──────────────┬──────────────────────────────┬──────────────────┤
│              │                              │                  │
│  Sidebar     │        3D Map Canvas         │  Sidebar Right   │
│  Left        │    (Deck.gl / MapLibre)      │  (Entity Detail  │
│  (Entity     │                              │   / Intelligence │
│   List &     │                              │   Feed)          │
│   Filters)   │                              │                  │
│              │                              │                  │
└──────────────┴──────────────────────────────┴──────────────────┘
```

---

## TopBar

The TopBar spans the full width and provides:

| Element | Description |
| :--- | :--- |
| **Sovereign Watch Logo** | Click to reset map to home position |
| **Mode Toggle** | Switch between Tactical, Orbital, Intel, Dashboard, and Radio workspaces |
| **Extended View Tabs** | Switch between Tactical, Orbital, Intel, Dashboard, and Radio workspaces |
| **Kp Index Widget** | Real-time space weather monitor embedded in the center of the bar |
| **UTC Clock** | Live synchronized UTC time reference |
| **Entity / Status Readouts** | Real-time count, latency, and health-oriented status indicators |
| **Settings Button** | Opens the System Settings HUD panel |
| **System Health Button** | Opens live service and poller health details |
| **Raw Data Terminal Button** | Opens the low-level terminal / stream view |
| **Replay Button** | Toggles historian replay mode |
| **Terminator Button** | Toggles the day/night terminator overlay |
| **Risk Grid Button** | Quick toggle for the regional H3 risk overlay |
| **History Trails Button** | Quick toggle for entity trail rendering |
| **Velocity Projections Button** | Quick toggle for forward motion vectors |
| **Alerts Pill** | Opens the active alerts drawer and shows current alert count |
| **User Menu** | Account and user-session actions |

### TopBar Quick Controls

The icon cluster on the right side of the TopBar is meant for high-frequency tactical toggles:

- **Replay** enables historian playback for reconstructing a prior situation.
- **Terminator** overlays the day/night boundary for space-weather, orbital, and regional visibility context.
- **Risk Grid** toggles the same regional H3 risk layer available in the map layers panel.
- **History Trails** shows or hides recent track movement tails.
- **Velocity Projections** shows or hides forward movement indicators for live tracks.
- **System Health** opens a compact live view of poller health and clausalizer activity.
- **Raw Data Terminal** exposes lower-level runtime output for operator debugging and situational validation.

### Alerts Drawer

The alert pill in the TopBar opens a dedicated **Active Alerts** drawer.

- It shows the current alert count at a glance.
- Each alert entry includes the alert domain, timestamp, and message text.
- When there are no active alerts, the drawer remains available as a status confirmation surface.

---

## Tactical Map Mode

### Map Engine

The Tactical Map supports two rendering backends:

| Backend | Best For |
| :--- | :--- |
| **Mapbox GL JS** (3D Terrain + Satellite) | High-fidelity 3D terrain with satellite imagery |
| **MapLibre GL JS** (CARTO Dark Matter) | Offline-capable dark vector basemap (no Mapbox token required) |

The active backend is determined by whether `VITE_MAPBOX_TOKEN` is configured. MapLibre is the fallback.

### Navigation

| Action | Result |
| :--- | :--- |
| **Drag** | Pan the map |
| **Scroll** | Zoom in/out |
| **Right-drag / Two-finger tilt** | 3D tilt (Mapbox mode only) |
| **Double-click** | Zoom to point |
| **Click entity** | Select / lock target (opens detail panel) |
| **Hover entity** | Shows callsign tooltip |

### Hover Tooltips

Hovering does more than show a plain label. The map tooltip adapts to the object type you are inspecting.

- **Aircraft and vessels** emphasize callsign plus fast telemetry context.
- **Clusters** show that the object is a convergence / ST-DBSCAN grouping rather than a single track.
- **Clausal events** emphasize the state-change reason, such as emergency, loitering, altitude change, or zone entry.
- **Infrastructure and hazard objects** shift to context-specific labeling such as outage, weather alert, repeater, buoy, or jamming event.

The tooltip is intended as a fast-look surface. Clicking promotes the object into the full inspector in the right sidebar.

---

## Entity Symbology

### Aviation (ADS-B)

Chevron markers with heading direction:

| Color | Altitude Range |
| :--- | :--- |
| Green | < 5,000 ft (ground / low approach) |
| Yellow | ~10,000 ft (approach / pattern) |
| Orange | ~20,000 ft (mid-altitude) |
| Red | ~30,000 ft (cruise) |
| Magenta | > 40,000 ft (very high altitude) |

**Tactical Orange aura** highlights: military aircraft, drones, helicopters

**Pulsating ring** = active telemetry (refreshing in real time)

**Circling indicators** = aircraft is currently flying a sustained holding pattern (identified by Ingest-05).

**Emergency squawk alerts** (7700, 7600, 7500) trigger cross-domain HUD notifications.

### Maritime (AIS)

Chevron markers with heading direction:

| Color | Speed Range |
| :--- | :--- |
| Dark Blue | 0 kts (stationary / anchored) |
| Medium Blue | < 10 kts (harbor / patrol) |
| Light Blue | ~15 kts (cruising) |
| Cyan / White | 25+ kts (high-speed transit) |

**Tactical Orange aura** highlights: military vessels, SAR, law enforcement

### Infrastructure

| Marker Color | Layer |
| :--- | :--- |
| Emerald Green | RF sites (repeaters, NOAA stations) |
| Cyan | Submarine cables and landing stations |
| Red / Amber | Internet outage zones |

---

## Left Sidebar

The left sidebar provides the **entity list** and **domain filters**.

### Domain Filter Tabs

| Tab | Content |
| :--- | :--- |
| **Air** | All aviation tracks from ADS-B |
| **Sea** | All maritime tracks from AIS |
| **Infra** | Infrastructure layers toggle |

### Sub-filters (Air)

Filter the aviation display by sub-classification:

- **All** — Show every aircraft
- **Military** — Military-affiliated aircraft only
- **Helicopters** — Rotary wing aircraft
- **Drones** — RPV/UAV assets
- **Emergency** — Active squawk 7700/7600/7500

### Sub-filters (Sea)

- **All** — All vessels
- **Military** — Naval vessels
- **Cargo** — Cargo ships
- **Tankers** — Tanker vessels
- **SAR** — Search and rescue vessels
- **Passenger** — Passenger/cruise ships
- **Fishing** — Fishing vessels

### Entity List

Below the filter tabs, a scrollable list shows all visible entities in the current view:

- Click any entity row to **lock target** and open the detail panel
- Entities are sorted by last-seen time (most recent first)
- Emergency-flagged entities are pinned to the top

### Map Layers Panel

The left-side layer panel is organized into grouped operational stacks rather than a flat list:

- **RF Infrastructure** for repeaters and radio-specific overlays
- **Global Network** for cables, landing stations, outages, data centers, IXPs, ISS tracker, and related infrastructure context
- **Environmental** for aurora, buoys, and weather-alert overlays
- **Analysis** for risk, clusters, and clausal-chain overlays
- **Hazards** for holding-pattern and jamming-related overlays

The compact icon row at the top of the panel is a quick-toggle strip for these grouped layer families.

---

## Right Sidebar — Entity Detail Panel

Clicking an entity on the map or in the entity list opens the **detail panel** in the right sidebar.

The right sidebar is not limited to aircraft and vessels. It also routes selection into type-specific detail views for clusters, clausal chains, GDELT events, jamming events, RF repeaters, towers, buoys, infrastructure objects, JS8 traffic, SatNOGS results, and satellites.

### Aviation Detail

| Section | Data Shown |
| :--- | :--- |
| **Header** | Callsign, ICAO hex, aircraft type |
| **Telemetry** | Altitude, speed, vertical rate, heading |
| **Classification** | Affiliation, platform, operator, registration |
| **Track Trail** | Historical breadcrumb trail on the map |
| **AI Analyze** | Button to trigger AI fusion analysis (SSE stream) |

### Maritime Detail

| Section | Data Shown |
| :--- | :--- |
| **Header** | Vessel name, MMSI, flag |
| **Telemetry** | Speed, course, heading, navigational status |
| **Vessel Info** | Ship type, dimensions (length/beam/draught), destination |
| **Track Trail** | Historical breadcrumb trail |
| **AI Analyze** | Button to trigger AI fusion analysis |

### Satellite Detail

Satellite selections use a space-specific inspector rather than the standard aircraft/vessel layout.

- Orbital parameters such as inclination, eccentricity, azimuth, elevation, and range
- Polar pass visualization and next-pass timing
- Optional SatNOGS spectrum verification when verification data exists
- Payload inspector access for deeper satellite metadata

Unlike aircraft and vessels, satellites do not use the same standard `CENTER_VIEW` / track-log action pattern.

### Cluster Detail

Cluster selections open a dedicated convergence view showing:

- Entity count
- Cluster centroid
- First observation, last observation, and duration
- Member UID list for the cluster
- A direct action to center the map on the cluster

Clusters refresh on a timed polling cycle, so they can appear or disappear as the underlying grouping changes.

### Clausal Chain Detail

Clausal selections open a narrative-style analysis panel showing:

- State-change reason and severity styling
- Confidence score
- Event-time telemetry such as speed, altitude, and course when available
- Narrative text for the detected behavior change
- Quick actions to center the view or open follow-on analysis

### Infrastructure / Hazard Detail

Infrastructure and hazard objects share a broader contextual inspector family that adapts based on what was clicked:

- **Outages** focus on severity, affected region, and source context
- **Buoys** focus on local environmental readings and maritime conditions
- **NWS alerts** focus on weather urgency, headline, and affected area
- **ISS / orbital infrastructure objects** focus on orbital or platform context
- **RF / network infrastructure** focuses on site, exchange, facility, or cable metadata

### AI Analysis Panel

Clicking **AI Analyze** streams a tactical assessment of the selected entity:

1. The API fetches the entity's track history (configurable lookback window)
2. The active AI model (Claude, Gemini, or LLaMA3) generates a tactical summary
3. The assessment streams token-by-token into the panel in real time

Switch the active AI model in **System Settings → AI Engine**.

### Selection Behavior

- Clicking a moving track, overlay marker, cluster, or narrative node locks that object as the active selection.
- Hovering provides a lightweight tooltip, while clicking promotes the object into the full sidebar detail view.
- Different object types open different right-sidebar layouts, so the sidebar behaves more like a dynamic inspector than a single static panel.
- Many detail views provide a **CENTER VIEW** action so the operator can immediately recenter on the selected object.
- Some object types also expose deeper follow-on actions such as AI analysis, payload inspection, source opening, or pass rendering depending on the selected domain.

---

## Intelligence Stream

The **Intelligence Stream** (Right Sidebar) is a real-time fusion feed that combines decoded telemetry alerts with global OSINT events.

### Domain Filtering

Use the icons at the top of the stream to toggle visibility for:

- **Air** (Aviation alerts)
- **Sea** (Maritime alerts)
- **Orbital** (Space alerts / flyovers)

### GEODENT (GDELT OSINT)

At the bottom of the Intelligence Stream is the **GEODENT** footer widget. This toggle enables/disables real-time global event tracking from the **GDELT Project**.

- **Interaction**: Clicking an OSINT event headline will fly the map to the event location and automatically search for any nearby tactical entities (aircraft/vessels).
- **Data**: Events include a "Goldstein Scale" (stability impact) and "Average Tone" (coverage sentiment).

### Special Event Objects

The Intelligence Stream and map can surface more than track alerts:

- **GDELT / GEODENT events** for geopolitical context
- **Jamming events** for RF/GNSS interference awareness
- **Clausal chains** for state-change narratives
- **Clusters** for emergent group behavior

---

## Trail Visualization (Historical Tracks)

When an entity is selected, its **historical trail** is rendered as a breadcrumb path on the map:

- Trail points are fetched from TimescaleDB via `GET /api/tracks/history/{entity_id}`
- Default lookback: 24 hours, max 100 points
- Trail fades from bright (recent) to dim (older)
- Trail is cleared when the entity is deselected

---

## Time-Travel (Historian Replay)

The **Historian Replay** tool allows operators to replay historical tactical situations.

**How to use:**

1. Open the **Time-Travel** panel from the TopBar.
2. Select a start time and end time (ISO 8601 or date-picker).
3. Click **Play** — the map animates through all track points in the selected window.
4. Use **Pause / Step Forward / Step Back** to inspect specific moments.
5. Speed control: 1×, 5×, 10×, 30× playback speed.

> Replay data is fetched from `GET /api/tracks/replay`. Maximum window is `MAX_REPLAY_HOURS` hours.

---

## H3 Coverage Visualization

The ADS-B poller uses H3 hexagonal cells to manage polling density. Enable the **H3 Coverage Layer** in Settings to visualize:

- Active polling cells (hex grid over the AOR)
- Cell priority intensity (brighter = higher traffic density = more frequently polled)
- Cell boundaries update in real time as priorities shift

This layer is useful for understanding poller coverage and identifying dead zones.

---

## System Settings HUD

Open via the **Settings button** in the TopBar. Organized into tabs:

### Map Settings

- Toggle between Mapbox 3D and MapLibre vector basemaps
- Toggle terrain/satellite imagery (Mapbox mode)
- Tactical grid overlay on/off
- Noise texture overlay on/off

The **System Settings** dropdown also includes:

- **Filter presets** for quickly applying saved or curated display states
- **H3 Poller Mesh (Debug)** for low-level poller-cell visualization
- **Watchlist management** for operator-managed tracking lists

### Layer Controls

- **Aviation layer** — Toggle ADS-B aircraft on/off
- **Maritime layer** — Toggle AIS vessels on/off
- **Orbital layer** — Toggle satellite overlay on/off
- **RISK GRID** — Toggle the composite H3 risk overlay on/off
- **TRAJECTORY CLUSTERS** — Toggle ST-DBSCAN co-location / movement clusters on/off; when enabled, choose a `1h`, `4h`, or `24h` lookback window
- **CLAUSAL CHAINS** — Toggle AI-generated state-change narratives on/off; when enabled, choose a `1h`, `6h`, or `24h` lookback window for the narrative fetch
- **RF Infrastructure** — Toggle repeater and radio-site overlays on/off
- **Submarine Cables** — Toggle cable routes on/off
- **Landing Stations** — Toggle cable landing-point markers on/off
- **Internet Outages** — Toggle outage visualization on/off
- **FCC TOWERS** — Toggle FCC tower infrastructure markers on/off
- **H3 Coverage** — Toggle poller cell visualization on/off

### Risk Grid

The **RISK GRID** overlay renders a server-generated H3 hex map of fused operational risk across the current area of interest.

- Use it to identify which regions are currently assessed as low, medium, high, or critical risk without selecting a specific entity.
- Severity colors are fixed rather than relative: green = low, amber = medium, orange = high, red = critical.
- The grid refreshes automatically, so it is best treated as a live regional heat map rather than a static planning product.
- This layer is useful when you want geographic risk context first and individual tracks second.

### Trajectory Clusters

The **TRAJECTORY CLUSTERS** layer highlights groups of tracks that are moving or co-locating in a way that forms a meaningful cluster.

- Clusters are rendered as cyan octagonal rings labeled `CLSTR·N`, where `N` is the number of entities in the cluster.
- A cluster of one is intentionally ignored; the overlay is meant to surface multi-entity behavior, not single tracks.
- Click a cluster to inspect it through the same sidebar / selection flow used for other map objects.
- With an active mission AOT, clustering uses the mission center and radius. Without one, it falls back to a viewport-centered regional query.
- Use the `1h`, `4h`, and `24h` controls to choose whether you want short-lived tactical grouping or a broader movement history.

### Clausal Chains Layer

The **CLAUSAL CHAINS** layer is part of the analysis stack. It renders AI-enriched state-change narratives generated from recent telemetry transitions rather than raw track positions.

- Use it to surface behavior changes such as altitude shifts, speed transitions, loitering, airspace or zone entry, and emergency-driven changes.
- Click a clausal marker to open the right sidebar narrative view with the chain reason and supporting context.
- Data can be sparse during quiet periods because clausal chains are created only when an entity actually changes state.

### Infrastructure and Hazard Layers

Several operational overlays in the Settings HUD are infrastructure- or hazard-oriented rather than track-oriented:

- **RF Infrastructure** shows repeater and radio-site markers relevant to local communications coverage.
- **Submarine Cables** shows long-haul cable routes for maritime and network context.
- **Landing Stations** shows the cable termination points where submarine routes come ashore.
- **Internet Outages** highlights outage zones and degraded regions from the infra data pipeline.
- **FCC TOWERS** shows registered tower infrastructure useful for RF and coverage context.

These layers are best used as environmental context for aviation, maritime, orbital, and RF analysis rather than as primary moving-target overlays.

### Environmental Layers

The **Environmental** group adds non-entity overlays that help explain conditions around the operational picture.

- **AURORA FORECAST** adds space-weather context relevant to orbital and RF interpretation.
- **OCEAN BUOYS** adds maritime environmental points for sea-state and local marine conditions.
- **NWS ALERTS** adds active weather-alert polygons or markers for U.S. weather hazards.

### Hazards Layers

The **Hazards** group highlights patterns and interference that are operationally significant even when no single vehicle is in distress.

- **Holding patterns** surface aircraft loitering / circling behavior.
- **Jamming** surfaces RF or GNSS interference assessments and related hazard events.

These are better thought of as anomaly overlays than simple domain layers.

### Global Network Layers

The **Global Network** group contains more than cables and outages:

- **UNDERSEA CABLES** for long-haul subsea links
- **LANDING STATIONS** for shore termination points
- **INTERNET OUTAGES** for degraded or failed service regions
- **FCC TOWERS** for terrestrial comms infrastructure
- **INTERNET EXCHANGES** for peering and exchange hubs
- **DATA CENTERS** for major facility locations
- **ISS TRACKER** for the dedicated ISS context overlay

### Mission Area

- Current AOR center coordinates and radius
- **Update** — Change the AOR center and radius (propagates to all pollers via API)
- **Presets** — Quick-select predefined areas of interest

### AI Engine

- View available AI models (Claude, Gemini, LLaMA3)
- Switch the active model for track analysis

---

## Orbital Map Mode

Switch to Orbital mode via the TopBar mode toggle to view the space domain.

### Satellite Display

All satellites are rendered as **star markers** at their current ground-track position:

| Color | Category |
| :--- | :--- |
| Sky Blue | GPS / Navigation (GPS, GLONASS, Galileo, BeiDou) |
| Amber | Weather (NOAA, GOES, environmental) |
| Emerald | Communications (Starlink, OneWeb, Iridium, amateur) |
| Rose/Red | Intelligence / ISR (military, RADARSAT, Spire, Planet) |
| Gray | LEO / Other (ISS, cubesats, brightest objects) |

### Category Pills

The top of the Orbital sidebar shows **category pills** with real-time satellite counts per category and constellation. Click a pill to filter the display to that category.

### Satellite Detail Panel

Clicking a satellite opens the detail panel showing:

- NORAD ID and official name
- Constellation and category
- Orbital parameters: period, inclination, eccentricity, altitude
- Current lat/lon/altitude
- Speed (m/s)

When a satellite is selected or hovered in the standard map projection, the map also renders a **coverage footprint circle** around the satellite. This is an approximate line-of-sight visibility footprint derived from altitude, useful for quickly judging how wide the satellite's current ground visibility is.

### Ground Track

Click **Show Ground Track** in the satellite detail panel to render the **predicted orbital ground track** for the next 90 minutes (one full orbit for LEO satellites).

- The brighter track shows the selected satellite's projected path across the Earth's surface.
- The shorter trail behind satellites represents recent historical movement already seen by the UI.
- The coverage footprint circle and the predicted ground track describe different things: the footprint is the satellite's current visibility area, while the ground track is where the satellite is expected to travel next.

### Pass Predictor

Open the **Pass Predictor** panel (Orbital sidebar):

1. Select a satellite, category, or constellation.
2. Set minimum elevation angle (default 10°).
3. Set prediction window (1–48 hours).
4. Click **Predict** — the system calculates and lists upcoming passes.
5. Click any pass to render the pass arc on the globe with AOS/TCA/LOS markers.

---

## Intel Globe Mode

Switch to Intel mode via the **INTEL** tab to move from track-centric monitoring into a global OSINT and geographic-risk view.

### Globe Workflow

The Intel Globe combines several global analytic layers into a single operator view:

- **GDELT event points** for geolocated OSINT reporting
- **Conflict arcs** for high-intensity event relationships
- **Country heat tinting** based on actor threat posture
- **Optional H3 risk cells** when the Risk Grid toggle is enabled

The INTEL workspace keeps the globe as the main canvas while shifting the left sidebar and right sidebar toward intelligence triage rather than track management.

### Intel Sidebar

The left Intel sidebar is the main control and triage surface for this mode.

- **Refresh** pulls a fresh actor snapshot from the GDELT actor API.
- **Window** switches the actor ranking window between 24, 48, and 72 hours.
- **Active Conflict Zones** ranks the highest-threat actor geographies; clicking a row flies the globe to the actor centroid.
- **Active Actors** lists the broader actor set with event-volume badges and the same fly-to behavior.
- **SITREP Summary** aggregates hot zones, monitoring actors, and total indexed reports.
- **Generate AI SITREP** is available to operator-role users and opens the AI Analyst panel with a prebuilt Intel context package.

### Globe Controls And Selection

The bottom-center map HUD in Intel mode exposes the globe-specific controls used most often during analyst workflows.

- **GLOBE** switches between globe and mercator projection.
- **Spin** enables or disables the idle globe auto-rotation.
- **DARK / SAT** swaps the basemap style for threat scanning versus imagery context.
- **Zoom** adjusts the global framing without leaving the Intel workspace.
- When mercator projection is active, the shared 2D/3D camera controls appear for pitch and bearing adjustments.

Selection behavior is different from the Tactical map:

- With no active selection, the right sidebar defaults to the live **News Widget**.
- Clicking a GDELT event promotes it into the same right-sidebar inspector family used elsewhere in the app.
- Intel article links opened from the inspector route into the in-app article viewer rather than forcing an external context switch.

---

## Dashboard Mode

Switch to Dashboard mode via the **DASHBOARD** tab for a compact cross-domain operations summary rather than a single full-screen map.

### Operational Layout

The Dashboard is organized as a mission watch floor with stacked summary surfaces.

- The **top status strip** shows mission, stream, RF, weather, and alert-state cues.
- The **left column** combines active alerts with the live intel event feed.
- The **center column** splits into a mission-focused tactical mini map and a global situation globe.
- The **right column** focuses on GDELT stability context, selected global event detail, and the active-conflict summary widget.
- The **bottom row** rotates supporting context through orbital pass predictions, outage status, and OSINT news.

### Dashboard Widgets

Dashboard mode is meant for scanning the whole operating picture quickly.

- **Tactical Overview** mini map shows the mission area, live domain counts, RF sites, and local weather-alert context.
- **Situation Globe** keeps global GDELT and infrastructure context visible without leaving the dashboard.
- **Alerts** surfaces immediate local or fused warnings from the event bus.
- **Intel Feed** shows recent fused domain events with timestamps and entity-type icons.
- **Global Stability / Live Event** switches between the GDELT breakdown widget and a selected-event drill-down card.
- **Orbital Passes** groups upcoming passes into intelligence, weather, and GPS tabs.
- **Internet Outages** surfaces active outage conditions in a dedicated panel.
- **OSINT News** keeps the global news stream visible alongside the map surfaces.

The Dashboard is intended as a supervisory view: use it to spot changes across domains, then jump back into Tactical, Orbital, or Intel mode for deeper interaction.

---

## JS8Call Terminal (HF Radio)

The **JS8Call Terminal** is an integrated HF digital mode radio interface accessed via the JS8 icon in the TopBar. It supports three operating modes:

| Mode | Description |
| :--- | :--- |
| **JS8** | Real-time JS8Call message decodes and station map (requires connected KiwiSDR). |
| **KiwiSDR** | Focused live audio + waterfall view for the connected KiwiSDR node (formerly "Listen"). |
| **WebSDR** | **NEW:** Global node discovery map. Browse and connect to hundreds of WebSDR servers worldwide via integrated iframe. |

### SDR Node Discovery

- **KiwiSDR Browser**: Floating widget to search and connect to KiwiSDR.com nodes.
- **WebSDR Discovery**: Integrated full-page map to browse the global WebSDR network without coverage restrictions.

---

## Alert System

Sovereign Watch monitors all incoming data for tactically significant events and triggers HUD notifications:

| Alert Type | Trigger | Priority |
| :--- | :--- | :--- |
| **Emergency Squawk 7700** | Aircraft broadcasting general emergency | High |
| **Emergency Squawk 7600** | Aircraft broadcasting radio failure | High |
| **Emergency Squawk 7500** | Aircraft broadcasting hijacking | Critical |
| **AIS-SART Distress** | Maritime EPIRB/SART signal detected | High |
| **ISR Satellite Flyover** | `intel` category satellite approaching AOR | Medium |

Alerts appear as banner notifications at the top of the screen and are logged in the right sidebar Intelligence Feed.

---

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Esc` | Deselect entity / close panel |
| `Space` | Pause / resume Historian replay |
| `[` / `]` | Step backward / forward in replay |
| `Tab` | Cycle through entity tabs in left sidebar |

---

## Performance Tips

- **Reduce radius** — A smaller AOR reduces the number of entities rendered. Use the Settings HUD to shrink the coverage radius for high-density areas.
- **Filter aggressively** — Use domain sub-filters to hide irrelevant entity classes when the display is crowded.
- **Disable unused layers** — Turn off submarine cables, H3 grid, or RF markers when not needed for analysis.
- **Use CARTO basemap** — If terrain rendering is slow on your hardware, switch to the MapLibre vector basemap.

---

## Related

- [Configuration Reference](./Configuration.md)
- [API Reference](./API_Reference.md)
- [TAK Protocol Reference](./TAK_Protocol.md)

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
| **Mode Toggle** | Switch between Tactical and Orbital map modes |
| **UTC Clock** | Live synchronized UTC time reference |
| **Entity Counters** | Real-time count of visible aircraft / vessels / satellites |
| **Settings Button** | Opens the System Settings HUD panel |
| **AI Analysis Button** | Opens the Intelligence Analysis panel |

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

---

## Right Sidebar — Entity Detail Panel

Clicking an entity on the map or in the entity list opens the **detail panel** in the right sidebar.

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

### AI Analysis Panel

Clicking **AI Analyze** streams a tactical assessment of the selected entity:

1. The API fetches the entity's track history (configurable lookback window)
2. The active AI model (Claude, Gemini, or LLaMA3) generates a tactical summary
3. The assessment streams token-by-token into the panel in real time

Switch the active AI model in **System Settings → AI Engine**.

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

### Layer Controls

- **Aviation layer** — Toggle ADS-B aircraft on/off
- **Maritime layer** — Toggle AIS vessels on/off
- **Orbital layer** — Toggle satellite overlay on/off
- **RF Infrastructure** — Toggle repeater markers on/off
- **Submarine Cables** — Toggle cable routes on/off
- **Internet Outages** — Toggle outage visualization on/off
- **H3 Coverage** — Toggle poller cell visualization on/off

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

### Ground Track

Click **Show Ground Track** in the satellite detail panel to render the **predicted orbital ground track** for the next 90 minutes (one full orbit for LEO satellites).

### Pass Predictor

Open the **Pass Predictor** panel (Orbital sidebar):

1. Select a satellite, category, or constellation.
2. Set minimum elevation angle (default 10°).
3. Set prediction window (1–48 hours).
4. Click **Predict** — the system calculates and lists upcoming passes.
5. Click any pass to render the pass arc on the globe with AOS/TCA/LOS markers.

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

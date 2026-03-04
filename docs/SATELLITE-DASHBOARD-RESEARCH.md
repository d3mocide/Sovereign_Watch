# Satellite Dashboard Research Analysis
## TLEscope Integration — Sovereign Watch v0.14

**Date**: 2026-03-03
**Branch**: `claude/satellite-dashboard-research-dKXIl`
**Reference**: [TLEscope](https://github.com/aweeri/TLEscope) — @aweeri, @juliasatt

---

## 1. Executive Summary

TLEscope is a native C/Raylib desktop application for visualizing satellite orbits using TLE data, SGP4 propagation, and real-time 3D/2D rendering. While its tech stack (C + Raylib) is incompatible with our React/Deck.gl frontend, its **feature design, data pipeline concepts, and UX patterns** are directly applicable to building a dedicated `ORBITAL` view mode in Sovereign Watch.

The proposal is a new third pill in the TopBar (`TACTICAL` / `RADIO` / **`ORBITAL`**), which activates a dedicated satellite dashboard. The dashboard reuses all existing design system patterns — purple accent color, the LayerFilters pill selector, and the Deck.gl rendering engine — and extends them with pass prediction, Doppler analysis, coverage footprints, and polar plots.

---

## 2. TLEscope Capabilities Assessment

### What We Can Directly Adopt

| TLEscope Feature | How We Adapt It | Sovereign Watch Implementation |
|---|---|---|
| SGP4 propagation | Already in `orbital_pulse` ingestion poller | Extend update cadence from 6hr → 30s real-time |
| Dual-view (3D/2D) | Already have Deck.gl + Mapbox | Add 3D globe mode using `Globe` layer |
| Terminator line | Day/night shadow | Add terminator GeoJSON polygon to TacticalMap |
| Coverage footprint circles | Already have `CoverageCircle.tsx` | Satellite-specific footprint radius from altitude |
| Pass prediction | New feature | REST endpoint `/api/orbital/passes` |
| Doppler graph | New widget | `DopplerWidget.tsx` frequency shift over time |
| Polar plot | New widget | `PolarPlotWidget.tsx` azimuth/elevation arc |
| Category filters | `LayerFilters.tsx` already has GPS/WEATHER/COMMS/INTEL | Expand with more sub-categories |
| TLE auto-pull | `orbital_pulse` already uses Celestrak | Add more Celestrak groups |
| Themeable colors | Design system already purple for orbital | Consistent `purple-400` accent throughout |

### What TLEscope Does That We Don't (Gap Analysis)

| Gap | Priority | Notes |
|---|---|---|
| Pass prediction (AOS/LOS times) | **HIGH** | Core use-case for ops planning |
| Azimuth/elevation data | **HIGH** | Needed for antenna pointing |
| Polar coordinate pass plot | **MEDIUM** | Good for observing stations |
| Doppler shift calculation | **MEDIUM** | Useful for RF operators with JS8Call integration |
| Slant range display | **MEDIUM** | LOS distance to satellite |
| Satellite search / filter by NORAD ID | **HIGH** | Currently no per-satellite selection |
| Ground station marker management | **LOW** | Currently hardcoded home location |
| Sub-satellite point (SSP) trail | **HIGH** | Ground track prediction lines |
| Satellite count overlay | **LOW** | How many visible per category |

---

## 3. Mock GUI — ORBITAL Dashboard View

### 3a. TopBar — Third Pill Addition

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ◈ SOVEREIGN·WATCH  COLLECTION_DOMAIN: OREGON.PORTLAND.01 ──────────────────────    │
│                                                                                     │
│   [◉ TACTICAL ]    [ ⏻ RADIO ]    [ ◈ ORBITAL ]          LATENCY ████░░  23ms     │
│        ↑                                ↑                                           │
│   hud-green pill              NEW — purple-400 pill                                 │
│   (existing)                  shadow-[0_0_15px_rgba(168,85,247,0.3)]               │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 3b. Full ORBITAL View Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ TOPBAR — ORBITAL mode active (purple pill selected)                                 │
├──────────┬──────────────────────────────────────────────┬────────────────────────── ┤
│ LEFT     │                                              │ RIGHT PANEL               │
│ SIDEBAR  │           MAIN MAP CANVAS                   │                           │
│          │           (Deck.gl / Globe mode)            │  ┌─────────────────────┐  │
│ ┌──────┐ │                                              │  │ SATELLITE INSPECTOR │  │
│ │CATEG.│ │   🌍  ← 3D Globe or 2D Mercator            │  │─────────────────────│  │
│ │ PILL │ │                                              │  │ NAME: STARLINK-1234 │  │
│ │ SEL. │ │   ⭐ ⭐  ← satellite icons w/ trails        │  │ NORAD: 45301        │  │
│ └──────┘ │                                              │  │ ALT:   550.2 km     │  │
│          │   ──── ← ground track prediction line       │  │ INC:   53.0°        │  │
│ ┌──────┐ │                                              │  │ SPD:   7.6 km/s     │  │
│ │PASS  │ │   ○    ← footprint coverage circle          │  │ AZ/EL: 127° / 42°   │  │
│ │PRED. │ │                                              │  │─────────────────────│  │
│ └──────┘ │   ☀️  ↕ terminator day/night line           │  │ NEXT PASS           │  │
│          │                                              │  │ AOS: 14:23:07 UTC   │  │
│ ┌──────┐ │                                              │  │ MAX: 14:29:41 UTC   │  │
│ │VIEW  │ │                                              │  │ LOS: 14:36:18 UTC   │  │
│ │MODE  │ │                                              │  │ MAX EL: 67°         │  │
│ └──────┘ │                                              │  └─────────────────────┘  │
│          │                                              │                           │
│ ┌──────┐ │                                              │  ┌─────────────────────┐  │
│ │DOPPL.│ │                                              │  │     POLAR PLOT      │  │
│ │GRAPH │ │                                              │  │         N           │  │
│ └──────┘ │                                              │  │       ╱  ╲          │  │
│          │                                              │  │  W  ──  ·  ── E    │  │
└──────────┴──────────────────────────────────────────────┤  │       ╲  ╱          │  │
                                                          │  │         S           │  │
                                                          │  └─────────────────────┘  │
                                                          └───────────────────────────┘
```

### 3c. Left Sidebar — Category Pill Selector Detail

```
┌────────────────────────────────────┐
│ ORBITAL LAYER CONTROLS             │
│ ────────────────────────────────── │
│                                    │
│  CATEGORY SELECTOR                 │
│  ┌──────────────────────────────┐  │
│  │  [ALL]  [GPS] [SAT] [COMMS] │  │  ← horizontal pill row (TopBar style)
│  │  [◈ WEATHER] [◈ INTEL]      │  │    purple active state
│  └──────────────────────────────┘  │
│                                    │
│  VIEW MODE                         │
│  ┌──────────────────────────────┐  │
│  │  [◉ 3D GLOBE] [ 2D FLAT ]   │  │  ← 3D/2D toggle pills
│  └──────────────────────────────┘  │
│                                    │
│  OVERLAY TOGGLES                   │
│  ┌──────────────────────────────┐  │
│  │ 🌒 TERMINATOR    ○──● ON    │  │
│  │ 🛤️  GROUND TRACK  ○──● ON    │  │
│  │ 📡 FOOTPRINTS    ●──○ OFF   │  │
│  │ 📊 DOPPLER VIEW  ●──○ OFF   │  │
│  └──────────────────────────────┘  │
│                                    │
│  PASS PREDICTOR                    │
│  ┌──────────────────────────────┐  │
│  │ HOME: 45.52° N, 122.68° W   │  │
│  │ ─────────────────────────── │  │
│  │ MIN EL: [ 10° ▾ ]           │  │
│  │                              │  │
│  │ UPCOMING PASSES              │  │
│  │ ─────────────────────────── │  │
│  │ 14:23  STARLINK-1234  67°   │  │
│  │ 14:51  ISS            82°   │  │
│  │ 15:07  NOAA-19        34°   │  │
│  │ 15:22  GOES-16        91°   │  │
│  │ [────────── MORE ──────────] │  │
│  └──────────────────────────────┘  │
│                                    │
│  DOPPLER GRAPH (selected sat)      │
│  ┌──────────────────────────────┐  │
│  │ +3kHz ┤        ╭────        │  │
│  │       ┤    ╭───╯            │  │
│  │  0Hz  ┤────┤                │  │
│  │       ┤    ╰───╮            │  │
│  │ -3kHz ┤        ╰────        │  │
│  │       └──────────────────   │  │
│  │       AOS     MAX     LOS   │  │
│  └──────────────────────────────┘  │
└────────────────────────────────────┘
```

### 3d. Category Pill Selector — Active State Breakdown

```
INACTIVE pill:    text-white/30 hover:text-white/60         (no bg, ghost text)
ACTIVE pill:      bg-purple-500/20 text-purple-300          (purple tint)
                  border border-purple-400/30
                  shadow-[0_0_8px_rgba(168,85,247,0.25)]    (purple glow)

Color Map per Category:
  ALL      → purple-400    (master / unfiltered)
  GPS      → sky-400       (navigation — matches existing LayerFilters)
  WEATHER  → amber-400     (atmospheric — matches existing)
  COMMS    → emerald-400   (communication — matches existing)
  INTEL    → rose-400      (surveillance — matches existing)
  LEO      → violet-400    (low-earth orbit filter)
  GEO      → cyan-400      (geostationary filter)
  MEO      → indigo-400    (medium earth orbit)
```

---

## 4. Proposed Feature Set

### Phase 1 — Foundation (TopBar pill + dedicated view)

| Feature | Component | Status |
|---|---|---|
| `ORBITAL` pill in TopBar | `TopBar.tsx` | new |
| `viewMode === 'ORBITAL'` routing in App | `App.tsx` | extend |
| Show `OrbitalDashboard` layout when active | new `OrbitalDashboard.tsx` | new |
| Category pill selector (ALL/GPS/WEATHER/COMMS/INTEL) | `OrbitalCategoryPills.tsx` | new |
| 2D/3D view mode toggle pills | embedded in `OrbitalDashboard` | new |
| Wire pills to existing orbital filter state | `LayerFilters` state passthrough | extend |

### Phase 2 — Map Enhancements

| Feature | Component | Status |
|---|---|---|
| Terminator (day/night line) GeoJSON layer | `TerminatorLayer.tsx` | new |
| Ground track prediction lines (SGP4 ±90min) | `orbital_pulse` + Deck.gl `PathLayer` | extend |
| Per-satellite footprint circles at actual altitude | `SatelliteFootprintLayer.tsx` | new |
| 3D Globe view using Deck.gl `GlobeView` | `TacticalMap.tsx` | extend |
| Satellite click → select + highlight | existing entity click pattern | extend |

### Phase 3 — Pass Prediction & Telemetry Panel

| Feature | Component | Status |
|---|---|---|
| Pass prediction REST endpoint | `backend/api/routes/orbital.py` | new |
| `GET /api/orbital/passes?norad=X&lat=Y&lon=Z&hours=24` | FastAPI route | new |
| Satellite inspector right-panel | `SatelliteInspector.tsx` | new |
| Upcoming passes list in left sidebar | `PassPredictorWidget.tsx` | new |
| AOS/MAX/LOS display with countdown | embedded in inspector | new |
| Polar plot widget (pass arc visualization) | `PolarPlotWidget.tsx` | new |

### Phase 4 — RF Integration

| Feature | Component | Status |
|---|---|---|
| Doppler shift calculation (f0, velocity, range rate) | backend route or frontend math | new |
| Doppler graph widget | `DopplerWidget.tsx` | new |
| JS8Call frequency offset suggestion | link to existing `JS8Widget.tsx` | extend |
| CSV export of pass prediction data | download button in `PassPredictorWidget` | new |

### Phase 5 — Enhanced Ingestion

| Feature | Component | Status |
|---|---|---|
| Expand Celestrak TLE groups (from 4 → 10+ categories) | `orbital_pulse` config | done |
| Real-time SGP4 position update (30s cadence) | `orbital_pulse` main loop | done |
| NORAD ID → name resolution cache | `backend/api` layer | new |
| SpaceTrack API integration (authenticated TLE pull) | `orbital_pulse` config option | new |

---

## 5. Implementation Plan

### Step 1 — TopBar Pill Addition
**Files**: `frontend/src/components/layouts/TopBar.tsx`, `frontend/src/App.tsx`

1. Add `'ORBITAL'` to the `ViewMode` type union
2. Add third pill button alongside TACTICAL/RADIO using purple accent:
   ```tsx
   <button
     onClick={() => onViewChange?.('ORBITAL')}
     className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black tracking-widest transition-all duration-300 ${
       viewMode === 'ORBITAL'
         ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
         : 'text-white/30 hover:text-white/60'
     }`}
   >
     <Satellite size={12} strokeWidth={3} />
     <span className={viewMode === 'ORBITAL' ? 'block' : 'hidden'}>ORBITAL</span>
   </button>
   ```
3. In `App.tsx`, conditionally render `OrbitalDashboard` instead of `TacticalMap` + radio panels when `viewMode === 'ORBITAL'`

### Step 2 — OrbitalDashboard Shell
**File**: `frontend/src/components/layouts/OrbitalDashboard.tsx`

Layout structure:
- Left sidebar: `OrbitalCategoryPills` + `OverlayToggles` + `PassPredictorWidget`
- Center: `TacticalMap` (reused, pre-filtered to orbital only, globe mode optional)
- Right sidebar: `SatelliteInspector` (selected entity) + `PolarPlotWidget`
- Bottom: `DopplerWidget` (collapsible)

### Step 3 — Category Pill Selector Component
**File**: `frontend/src/components/widgets/OrbitalCategoryPills.tsx`

Pattern mirrors `TimeControls` speed pills — a horizontal pill row inside a dark container:
```tsx
const CATEGORIES = [
  { key: 'ALL',     label: 'ALL',     icon: Satellite,  color: 'purple' },
  { key: 'GPS',     label: 'GPS',     icon: Navigation, color: 'sky'    },
  { key: 'WEATHER', label: 'WEATHER', icon: Cloud,      color: 'amber'  },
  { key: 'COMMS',   label: 'COMMS',   icon: Wifi,       color: 'emerald'},
  { key: 'INTEL',   label: 'INTEL',   icon: Eye,        color: 'rose'   },
  { key: 'LEO',     label: 'LEO',     icon: Globe,      color: 'violet' },
  { key: 'GEO',     label: 'GEO',     icon: Globe,      color: 'cyan'   },
] as const
```

### Step 4 — Pass Prediction Backend Endpoint
**File**: `backend/api/routes/orbital.py`

```python
@router.get("/passes")
async def get_passes(
    norad: int,
    lat: float,
    lon: float,
    min_elevation: float = 10.0,
    hours: int = 24,
) -> list[PassPrediction]:
    """
    Uses python-sgp4 + skyfield to predict AOS/MAX/LOS for a given
    NORAD satellite ID from the observer ground station location.
    Returns sorted list of upcoming passes with az/el data.
    """
```

Dependencies needed: `skyfield` or `pyorbital` (already may be in `orbital_pulse`)

### Step 5 — Satellite Inspector Panel
**File**: `frontend/src/components/widgets/SatelliteInspector.tsx`

Reuse `PayloadInspector.tsx` layout pattern. Fields:
- Name, NORAD ID, International Designator
- Current altitude (km), inclination (°), eccentricity
- Current velocity (km/s), slant range (km)
- Azimuth / elevation from home location
- Next pass countdown + AOS/MAX/LOS times
- Category badge (GPS / WEATHER / COMMS / INTEL) with color

### Step 6 — Polar Plot Widget
**File**: `frontend/src/components/widgets/PolarPlotWidget.tsx`

SVG-based render (no external library needed):
- Concentric elevation rings: 0°, 30°, 60°, 90°
- Cardinal directions: N/E/S/W
- Pass arc line plotted from AOS to LOS points
- AOS/MAX/LOS labeled dots
- Direction labels for antenna aiming

### Step 7 — Terminator Layer
**File**: `frontend/src/components/map/TerminatorLayer.tsx`

Use `suncalc` npm package (lightweight, no dep) to calculate sun position, then derive terminator GeoJSON polygon. Render as a `GeoJsonLayer` in Deck.gl with:
- `opacity: 0.25`
- `getFillColor: [0, 0, 0, 64]`
- Updates every 60 seconds

---

## 6. Data Architecture Extension

### New API Endpoints

```
GET  /api/orbital/satellites          → paginated satellite list with current positions
GET  /api/orbital/satellites/:norad   → single satellite TLE + current position
GET  /api/orbital/passes              → pass prediction (query: norad, lat, lon, hours)
GET  /api/orbital/groundtrack/:norad  → ±90min ground track polyline
WS   /api/orbital/live               → real-time position stream (30s updates)
```

### Existing Endpoint Extension

`orbital_pulse` already feeds `/api/tracks/live` WebSocket. The satellite records in the stream should be enriched with:
- `altitude_km` (derived from TLE epoch + SGP4)
- `inclination_deg`
- `eccentricity`
- `velocity_kms`
- `norad_id`
- `celestrak_category` (the TLE group name: gps-ops, weather, starlink, etc.)

### Frontend State Extension (App.tsx filters)

```typescript
// Extend existing filters interface
interface Filters {
  // ... existing fields ...

  // Orbital Dashboard
  orbitalCategory: 'ALL' | 'GPS' | 'WEATHER' | 'COMMS' | 'INTEL' | 'LEO' | 'GEO'
  orbitalViewMode: '2D' | '3D'
  showTerminator: boolean
  showGroundTracks: boolean
  showFootprints: boolean
  showDopplerWidget: boolean
  selectedSatNorad: number | null
  homeLocation: { lat: number; lon: number }
  minPassElevation: number  // degrees, default 10
}
```

---

## 7. Design System Tokens

All new components use the existing Tailwind config, extended with orbital-specific mappings:

```javascript
// tailwind.config.js additions
colors: {
  "orbital-accent": "#a855f7",       // purple-500 — primary orbital color
  "orbital-bg":     "#1a1025",       // deep purple-tinted panel bg
  "orbital-border": "#4c1d95",       // purple-900 border
}
```

CSS patterns for the orbital pill:
```css
/* Active orbital pill */
.pill-orbital-active {
  @apply bg-purple-500/20 text-purple-300 border border-purple-400/30;
  box-shadow: 0 0 12px rgba(168, 85, 247, 0.25);
}

/* Inactive (ghost) pill */
.pill-ghost {
  @apply text-white/30 hover:text-white/60 transition-all duration-300;
}
```

---

## 8. Agent Prompts

The following prompts are ready for handoff to implementation agents. Each is self-contained and references the correct files.

---

### Agent Prompt 1 — TopBar ORBITAL Pill

```
You are implementing a new "ORBITAL" view mode pill in the Sovereign Watch frontend.

Context:
- File: frontend/src/components/layouts/TopBar.tsx
- File: frontend/src/App.tsx
- The existing pills are TACTICAL (hud-green) and RADIO (indigo-600)
- The ORBITAL pill should use purple accent: text-purple-300, bg-purple-500/20, border-purple-400/30, shadow-[0_0_12px_rgba(168,85,247,0.3)]

Tasks:
1. In TopBar.tsx, find the view mode toggle section (around line 100-124)
2. Add a third pill button for 'ORBITAL' using the Satellite icon from lucide-react
3. Match the exact same pattern as the existing TACTICAL and RADIO pills
4. In App.tsx, find the ViewMode type and add 'ORBITAL' to the union
5. Find where viewMode controls which layout renders and add conditional rendering for 'ORBITAL' (render a placeholder div with className="flex-1 flex items-center justify-center text-purple-400/50 font-mono text-xs tracking-widest" with text "ORBITAL DASHBOARD — COMING SOON")

Constraints:
- Do not modify any existing TACTICAL or RADIO logic
- Keep all transitions using transition-all duration-300
- The Satellite icon should be size={12} strokeWidth={3}
- Run: cd frontend && npm run lint after changes
```

---

### Agent Prompt 2 — OrbitalCategoryPills Component

```
You are building a new pill selector component for the Sovereign Watch satellite dashboard.

Context:
- File to create: frontend/src/components/widgets/OrbitalCategoryPills.tsx
- Reference pattern: frontend/src/components/widgets/TimeControls.tsx lines 76-110
- The component displays horizontal pill buttons for satellite category filtering
- Design system: dark bg-black/40, border border-white/10, rounded, inner pills

Categories and their accent colors:
  ALL     → purple-400   (Satellite icon)
  GPS     → sky-400      (Navigation icon)
  WEATHER → amber-400    (Cloud icon)
  COMMS   → emerald-400  (Wifi icon)
  INTEL   → rose-400     (Eye icon)
  LEO     → violet-400   (Orbit icon or Globe)
  GEO     → cyan-400     (Globe icon)

Props interface:
  interface OrbitalCategoryPillsProps {
    selected: string
    onChange: (category: string) => void
  }

Active pill style:  bg-{color}-400/20 text-{color}-300 border border-{color}-400/30 shadow-[0_0_6px_rgba(color,0.2)]
Inactive pill style: text-white/40 hover:text-white/80 hover:bg-white/5

The component should render inside a container:
  <div className="flex flex-col gap-1.5">
    <span className="text-[8px] font-bold tracking-[0.2em] text-white/30 uppercase">Category</span>
    <div className="flex flex-wrap gap-1 bg-black/40 rounded border border-white/10 p-1">
      {/* pills here */}
    </div>
  </div>

Constraints:
- All text size: text-[9px] font-black tracking-widest
- Icon size: 10, strokeWidth: 2.5
- Use lucide-react for all icons
- Run: cd frontend && npm run lint after creation
```

---

### Agent Prompt 3 — Pass Prediction Backend Endpoint

```
You are adding a satellite pass prediction REST endpoint to the Sovereign Watch backend API.

Context:
- Backend: FastAPI (Python), located in backend/api/
- Existing orbital data is ingested by backend/ingestion/orbital_pulse/
- TLE data comes from Celestrak; satellites stored in TimescaleDB
- Reference: backend/api/routes/ — follow the pattern of existing route files

Task:
Create backend/api/routes/orbital.py with:

  GET /api/orbital/passes
  Query params: norad_id (int), lat (float), lon (float), min_elevation (float, default=10.0), hours (int, default=24)

  Response: JSON array of PassPrediction objects:
    {
      "norad_id": int,
      "name": str,
      "aos": "ISO8601 datetime",      # Acquisition of Signal
      "tca": "ISO8601 datetime",      # Time of Closest Approach (max elevation)
      "los": "ISO8601 datetime",      # Loss of Signal
      "max_elevation": float,         # degrees
      "aos_azimuth": float,           # degrees
      "los_azimuth": float,           # degrees
      "duration_seconds": int
    }

Implementation approach:
- Use the `sgp4` Python library (already in requirements) or `skyfield`
- Fetch the TLE for the requested NORAD ID from the database or orbital_pulse cache
- Propagate positions over the requested time window
- Apply observer location math to compute az/el at each time step (every 10s)
- Find AOS (el crosses above min_elevation), TCA (max el), LOS (el drops below min_elevation)
- Return sorted list of passes

Register the router in backend/api/main.py under /api/orbital prefix.

Constraints:
- Use async/await throughout
- Return 404 if NORAD ID not found
- Return 400 if invalid lat/lon
- Run: cd backend/api && ruff check . && python -m pytest after changes
```

---

### Agent Prompt 4 — Satellite Inspector Right Panel

```
You are building the SatelliteInspector widget for the Sovereign Watch ORBITAL dashboard.

Context:
- Reference component: frontend/src/components/widgets/PayloadInspector.tsx (follow its layout pattern)
- Design system: bg-tactical-panel, border-tactical-border, text-hud-green, monospace font
- The inspector appears in the right sidebar when a satellite is clicked on the map
- Accent color for orbital: purple-400

File to create: frontend/src/components/widgets/SatelliteInspector.tsx

Props interface:
  interface SatelliteInspectorProps {
    satellite: {
      norad_id: number
      name: string
      category: string            // 'GPS' | 'WEATHER' | 'COMMS' | 'INTEL' | etc.
      altitude_km: number
      inclination_deg: number
      eccentricity: number
      velocity_kms: number
      azimuth_deg: number         // from observer home location
      elevation_deg: number       // from observer home location
      slant_range_km: number
      next_pass?: {
        aos: string               // ISO datetime
        tca: string
        los: string
        max_elevation: number
        aos_azimuth: number
        los_azimuth: number
      }
    } | null
    onClose: () => void
  }

Layout sections (in order):
1. Header: satellite name + category badge + close button
2. Orbital parameters grid: ALT / INC / ECC / SPD (2×2 grid)
3. Observation data: AZ / EL / SLANT RANGE
4. Next Pass section (if next_pass is present):
   - AOS countdown timer
   - AOS / TCA / LOS times in UTC
   - MAX EL display
   - AOS AZ → LOS AZ

Styling conventions:
- Labels: text-[8px] text-white/40 tracking-[0.15em] uppercase
- Values: text-[11px] text-white/90 font-mono tabular-nums
- Section dividers: border-t border-white/5 my-2
- Container: rounded border border-white/10 bg-black/30 p-3

Constraints:
- Return null if satellite prop is null
- Show a purple-400 spinning loader if data is loading (pass isLoading prop)
- Run: cd frontend && npm run lint after creation
```

---

### Agent Prompt 5 — Polar Plot Widget

```
You are building an SVG-based polar plot widget for satellite pass visualization in Sovereign Watch.

Context:
- File to create: frontend/src/components/widgets/PolarPlotWidget.tsx
- This displays the path of a satellite pass in polar coordinates (elevation rings + azimuth)
- No external charting library — pure SVG rendering inside React
- Design system: dark background, purple accent for pass arc, white/30 for grid

Props interface:
  interface PolarPlotWidgetProps {
    pass?: {
      points: Array<{
        azimuth: number       // 0-360 degrees
        elevation: number     // 0-90 degrees
        time: string          // ISO datetime
        isAos?: boolean
        isTca?: boolean
        isLos?: boolean
      }>
    }
    width?: number   // default 160
    height?: number  // default 160
  }

SVG layout (centered coordinate system):
- Center point = 90° elevation (satellite directly overhead)
- Edge of circle = 0° elevation (horizon)
- Draw 3 concentric rings for 0°, 30°, 60° elevation
- Draw 4 radial lines for N (0°), E (90°), S (180°), W (270°)
- Label N/E/S/W at compass points in text-[7px] text-white/30
- Label elevation rings: "0°", "30°", "60°" in text-[6px] text-white/20

Coordinate transform function:
  // azimuth: 0=N, 90=E, 180=S, 270=W (clockwise from North)
  // elevation: 0=horizon, 90=zenith
  function toSvgPoint(az: number, el: number, cx: number, cy: number, r: number) {
    const radius = r * (1 - el / 90)   // full radius at el=0, 0 at el=90
    const angle = (az - 90) * Math.PI / 180  // rotate so N is up
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle)
    }
  }

Rendering:
- Grid: stroke="#ffffff" opacity=0.08 strokeWidth=0.5
- Pass arc: stroke="#a855f7" opacity=0.8 strokeWidth=1.5 fill="none" (polyline)
- AOS dot: fill="#22c55e" (green) r=3
- TCA dot: fill="#a855f7" (purple) r=4
- LOS dot: fill="#ef4444" (red) r=3

Wrap in container:
  <div className="rounded border border-white/10 bg-black/30 p-2">
    <span className="text-[8px] text-white/30 tracking-[0.2em] uppercase">Pass Geometry</span>
    <svg ...>
  </div>

Run: cd frontend && npm run lint after creation
```

---

### Agent Prompt 6 — Terminator Layer (Day/Night Line)

```
You are adding a day/night terminator layer to the Sovereign Watch tactical map.

Context:
- File: frontend/src/components/map/TacticalMap.tsx
- Deck.gl is used for all layers (already imported and configured)
- The terminator is a GeoJSON polygon representing the night-side shadow on Earth
- Update interval: every 60 seconds

Dependencies to add:
  cd frontend && npm install suncalc
  cd frontend && npm install @types/suncalc

Implementation:
1. Create a helper function that generates a GeoJSON polygon for Earth's shadow:
   - Use suncalc.getPosition(date, lat, lon) to find sun declination
   - The terminator follows a great circle perpendicular to the sun's sub-solar point
   - Sample at every 1° of longitude, compute the latitude of the terminator
   - Return as a GeoJSON Polygon (night hemisphere)

   Use this reference algorithm:
   - Sun sub-solar lat = sun declination
   - Sun sub-solar lon = sun hour angle converted to longitude
   - For each longitude, terminator lat = atan(-cos(lon - subsolarLon) / tan(subsolarLat))

2. In TacticalMap.tsx, add state:
   const [terminatorGeoJson, setTerminatorGeoJson] = useState(computeTerminator(new Date()))

   Update every 60s:
   useEffect(() => {
     const interval = setInterval(() => setTerminatorGeoJson(computeTerminator(new Date())), 60000)
     return () => clearInterval(interval)
   }, [])

3. Add a GeoJsonLayer:
   new GeoJsonLayer({
     id: 'terminator',
     data: terminatorGeoJson,
     visible: filters.showTerminator ?? true,
     getFillColor: [0, 0, 20, 80],
     getLineColor: [100, 100, 200, 60],
     getLineWidth: 1,
     lineWidthMinPixels: 1,
     stroked: true,
     filled: true,
   })

4. Add showTerminator: boolean to the filters prop type

Constraints:
- Only render when viewMode === 'ORBITAL' OR when showTerminator filter is explicitly true
- Use z-ordering: terminator layer should be below satellite icons but above the base map
- Run: cd frontend && npm run lint after changes
```

---

### Agent Prompt 7 — Doppler Widget

```
You are building a Doppler frequency shift graph widget for satellite passes in Sovereign Watch.

Context:
- File to create: frontend/src/components/widgets/DopplerWidget.tsx
- Renders an SVG line chart of Doppler shift (Hz) vs time during a satellite pass
- No external charting library — pure SVG
- Design system: dark bg, purple/green accent, monospace

Physics:
  Doppler shift = f0 * (v_radial / c)
  where:
    f0 = reference frequency (configurable, default 437.000 MHz)
    v_radial = radial velocity (rate of change of slant range)
    c = speed of light (299792458 m/s)

  Range rate approximation: derive from sequential slant_range values / time delta

Props interface:
  interface DopplerWidgetProps {
    referenceFreqMhz?: number   // default 437.0
    passPoints?: Array<{
      time: string              // ISO datetime
      slant_range_km: number    // to compute range rate
      elevation: number
    }>
  }

Rendering:
- SVG chart width: 100%, height: 80px
- Y axis: ±3 kHz range (or auto-scale to ±max_shift * 1.2)
- X axis: time from AOS to LOS
- Zero crossing line: stroke="#ffffff" opacity=0.15 dashed
- Doppler curve: stroke="#a855f7" strokeWidth=1.5 fill="none" (smooth polyline)
- AOS/LOS vertical markers: stroke="#22c55e" and stroke="#ef4444" opacity=0.4
- Y axis labels: "+3kHz", "0", "-3kHz" in text-[7px] text-white/30

Header shows: "DOPPLER  f0: 437.000 MHz" with a small editable input for f0.

Wrap in:
  <div className="rounded border border-white/10 bg-black/30 p-2">
    <div className="flex items-center justify-between mb-1">
      <span className="text-[8px] text-purple-400/70 tracking-[0.2em] uppercase">Doppler Shift</span>
      <span className="text-[8px] text-white/30 tabular-nums">{referenceFreqMhz} MHz</span>
    </div>
    <svg ...>
  </div>

Run: cd frontend && npm run lint after creation
```

---

### Agent Prompt 8 — OrbitalDashboard Layout Shell

```
You are creating the top-level layout component for the Sovereign Watch ORBITAL dashboard view.

Context:
- This layout replaces TacticalMap + sidebars when viewMode === 'ORBITAL'
- File to create: frontend/src/components/layouts/OrbitalDashboard.tsx
- Reference layouts: frontend/src/components/layouts/SidebarLeft.tsx and SidebarRight.tsx
- The main map in the center is the existing TacticalMap (reused with orbital filters preset)
- Design system: bg-tactical-bg, bg-tactical-panel, border-tactical-border, purple-400 accents

Props interface:
  interface OrbitalDashboardProps {
    filters: Filters
    onFilterChange: (key: string, value: unknown) => void
    trackCount: number
    health: SystemHealth | null
  }

Layout (CSS grid or flex):
  - Overall: flex flex-row h-full w-full
  - Left panel: w-64 flex-shrink-0 bg-tactical-panel border-r border-tactical-border flex flex-col gap-2 p-2 overflow-y-auto
  - Center: flex-1 relative (contains TacticalMap with showSatellites forced true, other layers hidden)
  - Right panel: w-64 flex-shrink-0 bg-tactical-panel border-l border-tactical-border flex flex-col gap-2 p-2

Left panel content (top to bottom):
  1. <OrbitalCategoryPills> — category selector
  2. View mode pills: 2D / 3D toggle (inline, using same pill pattern)
  3. Overlay toggles section: TERMINATOR, GROUND TRACKS, FOOTPRINTS toggles
  4. <PassPredictorWidget> — upcoming passes list
  5. <DopplerWidget> — shown when a satellite is selected

Right panel content:
  1. <SatelliteInspector> — selected satellite details
  2. <PolarPlotWidget> — pass geometry

Center map:
  Pass TacticalMap with:
  - filters={{ ...filters, showAir: false, showSea: false, showSatellites: true }}
  - Enforce orbital category filter from selectedCategory state
  - Handle satellite click → setSelectedSatNorad(norad_id)

State managed internally:
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [orbitalViewMode, setOrbitalViewMode] = useState<'2D' | '3D'>('2D')
  const [selectedSatNorad, setSelectedSatNorad] = useState<number | null>(null)

Constraints:
- Import and use only components that are being created in this sprint (use placeholder divs for components not yet built, with text-[9px] text-white/20 "WIDGET PLACEHOLDER")
- Run: cd frontend && npm run lint after creation
```

---

## 9. Implementation Order & Dependencies

```
Week 1 — Foundation
  ├── Agent Prompt 1  (TopBar pill)          → no deps
  ├── Agent Prompt 2  (CategoryPills)        → no deps
  └── Agent Prompt 8  (Dashboard shell)      → depends on 1 & 2

Week 2 — Map Features
  ├── Agent Prompt 6  (Terminator layer)     → no deps
  └── Map: ground track + footprint layers   → extend existing OrbitalLayer

Week 3 — Widgets
  ├── Agent Prompt 5  (Polar plot)           → no deps
  ├── Agent Prompt 7  (Doppler graph)        → no deps
  └── Agent Prompt 4  (Satellite inspector) → depends on 3 (backend)

Week 4 — Backend & Integration
  ├── Agent Prompt 3  (Pass prediction API)  → no deps
  └── Wire all widgets to live API data      → depends on 3 & 4
```

---

## 10. Key File Reference Map

| File | Action | Agent |
|---|---|---|
| `frontend/src/components/layouts/TopBar.tsx` | Add ORBITAL pill | Prompt 1 |
| `frontend/src/App.tsx` | Add ORBITAL to ViewMode, conditional render | Prompt 1 |
| `frontend/src/components/layouts/OrbitalDashboard.tsx` | **Create** | Prompt 8 |
| `frontend/src/components/widgets/OrbitalCategoryPills.tsx` | **Create** | Prompt 2 |
| `frontend/src/components/widgets/SatelliteInspector.tsx` | **Create** | Prompt 4 |
| `frontend/src/components/widgets/PolarPlotWidget.tsx` | **Create** | Prompt 5 |
| `frontend/src/components/widgets/DopplerWidget.tsx` | **Create** | Prompt 7 |
| `frontend/src/components/widgets/PassPredictorWidget.tsx` | **Create** | (extend prompt 3) |
| `frontend/src/components/map/TacticalMap.tsx` | Add terminator layer | Prompt 6 |
| `backend/api/routes/orbital.py` | **Create** pass prediction route | Prompt 3 |
| `backend/api/main.py` | Register orbital router | Prompt 3 |
| `frontend/tailwind.config.js` | Add orbital-accent color tokens | Prompt 8 |

---

*This document is a living research artifact. Update the "Status" columns in the feature set tables as implementation progresses.*

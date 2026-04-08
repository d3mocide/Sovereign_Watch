# INTEL Globe Mode

> OSINT-centric 3D globe view for situational awareness at global scale.
> Activated via the **INTEL** button in the TopBar.

## Operator Workflow

The INTEL workspace is the global analysis view used when the operator wants to pivot from individual tracks to broader geopolitical context.

- The **left Intel sidebar** ranks conflict zones and actors, lets the operator refresh actor state, and changes the ranking window between 24, 48, and 72 hours.
- Clicking a **conflict zone** or **actor** flies the globe to that centroid for fast regional focus.
- The globe renders **GDELT events**, **country heat**, **conflict arcs**, and the shared **H3 risk layer** when the Risk Grid overlay is enabled.
- The bottom HUD exposes **projection toggle**, **spin**, **style selection**, and **zoom** controls.
- With no active selection, the right side of the application shows the live news stream; clicking a GDELT event opens the normal right-sidebar detail inspector.
- Operators with the correct role can trigger **Generate AI SITREP**, which opens the AI Analyst panel with prebuilt Intel context from the current actor snapshot.

## Current Implementation (v1)

| Component | File | Purpose |
|---|---|---|
| Globe map | `frontend/src/components/map/IntelGlobe.tsx` | MapLibre globe or mercator Intel canvas with GDELT, country heat, conflict arcs, and optional H3 risk |
| Arc projections | `frontend/src/layers/buildGdeltArcLayer.ts` | ArcLayer beams from conflict-class GDELT events |
| Country heat | `frontend/src/layers/buildCountryHeatLayer.ts` | GeoJsonLayer tinting countries by threat level derived from actor1-country avg Goldstein |
| Left sidebar | `frontend/src/components/layouts/IntelSidebar.tsx` | Conflict zones, actor rankings, time-window control, refresh, fly-to, and AI SITREP trigger |
| Shared map HUD | `frontend/src/components/map/MapControls.tsx` | Projection toggle, auto-spin, basemap style, zoom, and mercator camera controls |
| Headline ticker | `frontend/src/components/widgets/OsintTicker.tsx` | CSS marquee from `/api/news/feed` |
| Right-sidebar detail routing | `frontend/src/App.tsx` / `frontend/src/components/layouts/SidebarRight.tsx` | Opens GDELT detail views and source actions from Intel selections |
| Actors API | `backend/api/routers/gdelt.py` | `GET /api/gdelt/actors` — top actors by event count |
| Map styles | `frontend/src/components/map/intelMapStyles.ts` | Dark Matter / Satellite / Light / Toner tile configs |

## Remaining Improvements (Priority Order)

### 1 — Real Actor-to-Actor Arc Geometry
**What:** Replace the current golden-angle fan arcs with true Actor1→Actor2 geographic connections using GDELT's `actor2_country` field mapped to country centroid coordinates.

**Why:** The current arcs are visually evocative but arbitrary. Real actor-to-actor arcs would make the projection beams analytically meaningful — you'd see Iran↔Israel, China↔Taiwan arcs etc.

**How:**
- Add a `country_centroids.json` static asset mapping ISO country codes to lat/lon (Natural Earth data, ~10KB)
- In `buildGdeltArcLayer.ts`, resolve `actor1_country` and `actor2_country` to centroid coords rather than the current angular offset
- Filter to events where both actors resolve (quad_class 3 or 4 only)
- No new dependencies, no backend changes

**Files:** `frontend/src/layers/buildGdeltArcLayer.ts`, `public/data/country_centroids.json`

---

### 2 — Country Click Drill-Down
**What:** Click a country polygon on the globe → zoom to that country + filter the sidebar actor list to that country's events + show a filtered news feed for that actor.

**Why:** Turns the heat map from decorative to navigational. Mirrors the GCMS country info panel pattern from the design reference.

**How:**
- Make `buildCountryHeatLayer.ts` pickable (`pickable: true`)
- Add an `onCountryClick` callback to `IntelGlobe` that receives the GeoJSON feature
- `IntelSidebar` accepts an active country filter and highlights/filters its lists
- Fly to the country's bounding box via `mapRef.fitBounds`

**Files:** `frontend/src/layers/buildCountryHeatLayer.ts`, `frontend/src/components/map/IntelGlobe.tsx`, `frontend/src/components/layouts/IntelSidebar.tsx`

---

### 3 — Time-Lapse Playback of GDELT Events
**What:** A slider that scrubs through the last 24h of GDELT events, showing how conflict dots and arcs evolve over time.

**Why:** The TACTICAL view already has a full replay system (`TimeControls.tsx`). A lighter version for GDELT would show event propagation patterns — useful for analyst briefings.

**How:**
- Backend: add `?start=ISO&end=ISO` params to `/api/gdelt/events`
- Frontend: reuse `TimeControls.tsx` (already exists) with a time-windowed fetch replacing the live `gdeltData`
- The arc and dot layers already have `updateTriggers` plumbing for time-based changes
- Scope to INTEL mode only; does not affect TACTICAL replay

**Files:** `backend/api/routers/gdelt.py`, `frontend/src/components/map/IntelGlobe.tsx`, `frontend/src/components/widgets/TimeControls.tsx`

---

### 4 — Satellite Overflight Alerts on Hot Zones
**What:** When an intel-category or government satellite crosses a country polygon currently classified CRITICAL, flash a connection line from the satellite's ground-track position to the country centroid.

**Why:** The ORBITAL view already tracks these satellites and fires alerts. The INTEL view has the country threat data. Joining them creates a "sensor-on-target" signal that is unique to this platform.

**How:**
- Share `satellitesRef` into `IntelGlobe` (already available in App.tsx)
- In the layer builder, filter satellites by `detail.category === "gov"` or similar
- Cross-reference their current lat/lon against the `actors` list (CRITICAL countries)
- Draw a brief `LineLayer` pulse when within ~500km of a hot zone centroid
- No new data sources required

**Files:** `frontend/src/components/map/IntelGlobe.tsx`, `frontend/src/layers/buildGdeltArcLayer.ts` (or a new `buildSatOverflightLayer.ts`)

---

### 5 — Maritime Chokepoint Overlay
**What:** Render named strategic chokepoints (Strait of Hormuz, Malacca, Bab-el-Mandeb, etc.) as labelled markers with real-time AIS density derived from the existing maritime feed.

**Why:** AIS data is already ingested. GDELT frequently references these locations. Overlaying them on the INTEL globe connects the news layer to the physical geography layer that security analysts care about.

**How:**
- Add a static `chokepoints.json` with ~15 named points and their lat/lon
- New `buildChokepointLayer.ts`: `IconLayer` or `ScatterplotLayer` for markers + `TextLayer` for labels
- Optionally size each marker by the count of AIS ships currently within a radius (reading from `entitiesRef`)
- No new data sources; no backend changes

**Files:** `frontend/src/layers/buildChokepointLayer.ts`, `public/data/chokepoints.json`, `frontend/src/components/map/IntelGlobe.tsx`

---

## Architecture Notes

- **No new npm packages** needed for any of the above — all deck.gl layers are already bundled.
- **State locality:** INTEL-specific state (map style, time window) should live in `IntelSidebar` or `IntelGlobe`, not `App.tsx`, unless it needs to survive a view-mode switch.
- **Performance:** The rAF loop in `IntelGlobe` drives both arc pulse and potential globe spin — keep all animation logic in that single loop rather than adding independent `setInterval` timers.
- **Globe vs flat:** The INTEL view is intentionally pinned to globe projection. If a 2D "flat intel" mode is ever wanted, it should be a separate toggle within the INTEL view (like ORBITAL's 2D/3D switch), not a reuse of the TACTICAL flat map.

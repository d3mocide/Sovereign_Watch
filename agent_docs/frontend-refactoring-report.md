# Frontend Refactoring Report

**Date:** 2026-03-23
**Scope:** `frontend/src/` — files over 500 lines with multiple decoupling opportunities

---

## Executive Summary

The frontend has **13 files exceeding 500 lines**, several exceeding 1,000. The dominant problem is a lack of separation of concerns: domain logic (aviation, maritime, orbital, radio, infrastructure) is collapsed into single components rather than split by responsibility. Two root causes drive most of the complexity:

1. **App.tsx as a God Component** — 1,073 lines, 35+ state hooks, props threaded 3+ levels deep, no centralized state layer.
2. **Entity-type switching via if-chains** — Components like `SidebarRight` (1,866 lines) handle 6+ entity types inline instead of delegating to focused inspector modules.

---

## File-by-File Findings

### 2. `ListeningPost.tsx` — 1,522 lines
**Path:** `frontend/src/components/js8call/ListeningPost.tsx`

**What it does:** HF radio waterfall with Kiwi SDR control and WebAudio integration.

**Problems:**
- Four completely different concerns in one file: canvas rendering, WebSocket protocol, audio processing, and UI controls
- 240-line `PALETTES` constant (RGB lookup tables) lives inline
- Canvas animation loop and React lifecycle are tightly entangled
- Kiwi SDR binary frame decoding is embedded in the component

**Extract candidates:**

| Extract to | Responsibility |
|---|---|
| `kiwi/WaterfallRenderer.ts` | Canvas animation, colormap application, frame-skipping logic |
| `kiwi/WaterfallColorMaps.ts` | `PALETTES`, `WF_CMAPS`, RGB conversion |
| `kiwi/KiwiSDRController.ts` | WebSocket connection, binary frame decoding, mode/frequency commands |
| `kiwi/RadioModeConfig.ts` | `HF_BANDS`, `KIWI_MODES`, `MODE_INFO` constants |
| `kiwi/RadioControls.tsx` | Frequency/zoom/mode/gain UI panel |

---

### 3. `DashboardView.tsx` — 1,193 lines
**Path:** `frontend/src/components/views/DashboardView.tsx`

**What it does:** Operational overview with track stats, outage alerts, RF site search, and embedded mini-map.

**Problems:**
- `MiniTacticalMap` (lines 188–357) is a complete canvas map inside the component — it has no reason to be co-located
- Stream status display, GDELT outage alerts, and RF site search are unrelated domains occupying the same file
- `Sparkline` component (lines 95–156) is generic and reusable but never extracted

**Extract candidates:**

| Extract to | Responsibility |
|---|---|
| `widgets/MiniMap.tsx` | `MiniTacticalMap` — canvas 2D map with circular markers |
| `widgets/TrackSparkline.tsx` | `Sparkline` — reusable micro chart |
| `widgets/StreamStatusMonitor.tsx` | Active/inactive pipeline display |
| `widgets/OutageAlertPanel.tsx` | GDELT-driven country outage severity |
| `widgets/RFSiteSearchPanel.tsx` | RF site reverse geocoding and distance display |

---

### 4. `RadioTerminal.tsx` — 1,191 lines
**Path:** `frontend/src/components/js8call/RadioTerminal.tsx`

**What it does:** JS8Call message log, heard station list, and orchestration of 4 SDR sub-panels.

**Problems:**
- Acts as an orchestration hub for `ListeningPost`, `WebSDRPanel`, `WebSDRDiscovery`, and `KiwiNodeBrowser` — each already large
- Message log rendering and station monitoring are separate features mixed in one component
- Band presets and GhostNet schedule constants belong in a dedicated config file

**Extract candidates:**

| Extract to | Responsibility |
|---|---|
| `js8call/JS8MessageLog.tsx` | RX/TX message display list |
| `js8call/StationMonitor.tsx` | Heard stations with SNR, grid, bearing |
| `js8call/RadioTerminalController.ts` | WebSocket dispatch and message routing |
| `constants/js8Presets.ts` | Band presets, GhostNet schedule (may partially exist) |

---

### 5. `TacticalMap.tsx` — 1,091 lines
**Path:** `frontend/src/components/map/TacticalMap.tsx`

**What it does:** 2D tactical map — layer composition, entity filtering, user interaction, data fetching.

**Problems:**
- Data fetching (aurora, jamming, GDELT, infrastructure APIs) lives inside the map component
- Context menu, entity selection, and hover logic are mixed with map initialization
- Globe/3D/replay mode state is threaded through 25+ refs alongside rendering state
- Props interface has 30+ parameters — no structure

**Extract candidates:**

| Extract to | Responsibility |
|---|---|
| `map/hooks/useMapDataFetcher.ts` | Aurora, jamming, GDELT, infrastructure API calls |
| `map/hooks/useMapInteraction.ts` | Context menu, selection, hover detection |
| `map/hooks/useMapModeController.ts` | Globe/3D/replay mode state |
| `map/types/MapProps.ts` | Break 30-param props into grouped interfaces |

---

### 6. `App.tsx` — 1,073 lines
**Path:** `frontend/src/App.tsx`

**What it does:** Root component — global state, view switching, event aggregation, sidebar orchestration.

**Problems (most critical file):**
- 35+ `useState`/`useRef`/`useCallback` hooks with no grouping
- All application state is local; no context or store
- Props are drilled 3+ levels (25+ props per map component)
- Replay system, sidebar visibility, filter persistence, and view mode are all entangled
- Acts as event bus: every subsystem reports directly to App

**Recommended architecture:**

```
AppContext (or Zustand store)
├── selectedEntity
├── filters (with localStorage persistence)
├── viewMode ('tactical' | 'orbital' | 'dashboard')
├── replayState { enabled, speed, currentTime }
└── sidebarState { alerts, settings, health, analyst, terminal }

Hooks to extract:
├── useAppFilters.ts       — filter state + localStorage sync
├── useReplayController.ts — playback state + frame interpolation
├── useSidebarState.ts     — panel open/close state
└── useTrackCounts.ts      — aggregated entity counts
```

---

### 7. `OrbitalMap.tsx` — 943 lines
**Path:** `frontend/src/components/map/OrbitalMap.tsx`

**What it does:** 3D orbital visualization, satellite tracks, ground coverage.

**Problems:**
- Duplicates an estimated 60% of `TacticalMap.tsx` (map init, entity filtering, layer composition pattern, replay support)
- Ground track computation logic is embedded directly

**Recommended approach:**
- Extract a shared `useMapBase.ts` hook with common init, entity filtering, and replay logic
- `TacticalMap` and `OrbitalMap` become thin wrappers that supply domain-specific layers

---

### 8. `SystemStatus.tsx` — 881 lines
**Path:** `frontend/src/components/widgets/SystemStatus.tsx`

**What it does:** Layer visibility toggles, filter controls, integration status display.

**Problems:**
- Layer toggle UI for every domain (air/sea/satellite/RF/environment) is monolithic
- LocalStorage persistence logic is inline rather than in a utility
- Integration status (RepeaterBook, RadioRef, RF_Public) is unrelated to layer visibility but co-located

**Extract candidates:**

| Extract to | Responsibility |
|---|---|
| `widgets/LayerVisibilityControls.tsx` | Toggle UI for each layer domain |
| `widgets/IntegrationStatus.tsx` | Third-party integration health display |
| `utils/filterPreferences.ts` | LocalStorage read/write for filter state |

---

### 9. `useEntityWorker.ts` — 794 lines
**Path:** `frontend/src/hooks/useEntityWorker.ts`

**What it does:** Web Worker orchestration, CoT parsing, emergency/distress alert detection for all domains.

**Problems:**
- Aviation emergency detection (squawk codes, TCAS), maritime distress (AIS nav status), and orbital collision alerts are all in one hook
- Trail smoothing (Chaikin curve) and dead reckoning are utility algorithms mixed into orchestration code
- Worker handshake/keep-alive protocol is embedded inline

**Extract candidates:**

| Extract to | Responsibility |
|---|---|
| `alerts/AviationAlertEngine.ts` | Squawk 7500/7600/7700, TCAS, emergency classification |
| `alerts/MaritimeAlertEngine.ts` | AIS nav status, distress detection, position errors |
| `alerts/OrbitalAlertEngine.ts` | Pass prediction alerts, collision warnings |
| `workers/WorkerProtocol.ts` | Handshake, keep-alive, message dispatch |
| `utils/trailSmoothing.ts` | Chaikin curve smoothing algorithm |

---

### 10. `useAnimationLoop.ts` — 554 lines
**Path:** `frontend/src/hooks/useAnimationLoop.ts`

**What it does:** RAF-driven entity update loop — position interpolation, layer composition, filtering, hover detection.

**Problems:**
- Four distinct responsibilities in one loop: interpolation → filtering → composition → rendering update
- Consumes 20+ MutableRefObjects from the parent, creating implicit coupling
- Globe vs flat map branching duplicates filter logic

**Extract candidates:**

| Extract to | Responsibility |
|---|---|
| `engine/EntityPositionInterpolator.ts` | Dead reckoning, trail point interpolation |
| `engine/EntityFilterEngine.ts` | Filter by type, affiliation, distance, replay time |
| `engine/HoverDetectionEngine.ts` | Proximity-based entity selection each frame |
| Keep `useAnimationLoop.ts` as | Thin RAF loop that calls the above engines |

---

### 11. `KiwiNodeBrowser.tsx` — 651 lines
**Path:** `frontend/src/components/js8call/KiwiNodeBrowser.tsx`

**What it does:** Floating Kiwi SDR node selector with distance filtering and embedded map.

**Problems:**
- Contains its own MapLibre map instance with no relation to the main TacticalMap
- Distance calculation and styling (5 helper functions) are embedded inline
- Node list and manual configuration form are unrelated UI panels

**Extract candidates:**

| Extract to | Responsibility |
|---|---|
| `kiwi/KiwiNodeList.tsx` | Node list rows with distance badges and load bars |
| `kiwi/KiwiManualConfig.tsx` | Manual host/port/password configuration form |
| `utils/kiwiDistance.ts` | Maidenhead-to-km conversion, distance classes |

---

### 12. `SystemSettingsWidget.tsx` — 611 lines
**Path:** `frontend/src/components/widgets/SystemSettingsWidget.tsx`

**What it does:** ICAO24 watchlist management, filter presets, shareable mission links.

**Problems:**
- Watchlist CRUD, filter preset persistence, and URL generation are three unrelated features
- API calls (`addToWatchlist`, `removeFromWatchlist`, `getWatchlist`) are mixed into component

**Extract candidates:**

| Extract to | Responsibility |
|---|---|
| `widgets/WatchlistManager.tsx` | ICAO24 add/remove UI |
| `widgets/FilterPresets.tsx` | Named filter save/load |
| `widgets/MissionLink.tsx` | Shareable URL generation |
| `hooks/useWatchlist.ts` | Watchlist API integration hook |

---

### 13. `IntelFeed.tsx` — 507 lines
**Path:** `frontend/src/components/widgets/IntelFeed.tsx`

**What it does:** Event log widget with multi-domain filtering (aviation, maritime, orbital, infrastructure).

**Problems:**
- 150+ lines of `useMemo` filter logic covering all 4 domains
- Event type classification from message content is imperative and unmaintainable
- Bell count accumulation and color-coded severity are mixed into the same render pass

**Extract candidates:**

| Extract to | Responsibility |
|---|---|
| `filters/AviationEventFilter.ts` | Filter by affiliation, platform, speed, altitude |
| `filters/MaritimeEventFilter.ts` | Filter by vessel type, cargo, nav status |
| `filters/OrbitalEventFilter.ts` | Filter by satellite category |
| `utils/EventCategorizer.ts` | Classify event domain and severity from message |

---

## Architectural Patterns to Apply

### 1. Inspector Registry (for SidebarRight)
Replace the if-chain with a map from entity type to inspector component. Each inspector owns its own data requirements, formatting helpers, and layout.

### 2. Domain State Slices (for App.tsx)
Replace 35 local hooks with a Zustand store or React Context split by domain:
- `useAviationState` — entities, filters, alerts
- `useMaritimeState` — vessels, nav status filters
- `useOrbitalState` — satellites, pass predictions
- `useRadioState` — JS8 stations, Kiwi connection
- `useAppUIState` — selected entity, view mode, sidebar panels

### 3. Shared Map Base (for TacticalMap + OrbitalMap)
```
useMapBase(config) → { mapRef, overlayRef, replayState, entityFilter }
  ├── TacticalMap: adds 2D layers + context menu
  └── OrbitalMap: adds 3D layers + ground tracks
```

### 4. Alert Engine Separation
Each domain's alert logic should be a pure function tested independently:
```ts
// alerts/AviationAlertEngine.ts
export function detectAviationAlerts(entity: CoTEntity): Alert[] { ... }

// alerts/MaritimeAlertEngine.ts
export function detectMaritimeAlerts(entity: CoTEntity): Alert[] { ... }
```

### 5. Animation Loop Pipeline
```ts
// Each frame:
const positions = interpolatePositions(entitiesRef.current, now);
const filtered  = filterEngine.apply(positions, activeFilters);
const layers    = composeAllLayers(filtered, visualState);
overlay.setProps({ layers });
```

---

## Recommended Refactoring Order

Ordered by impact vs risk (lower risk items first):

| Priority | File | Action | Risk |
|---|---|---|---|
| Done | `SidebarRight.tsx` | Extract 6 inspector components | Low — pure UI, no shared state changes |
| Done | `IntelFeed.tsx` | Extract domain filter functions | Low — pure functions |
| Done | `useEntityWorker.ts` | Extract alert engines | Medium — needs test coverage |
| Done | `ListeningPost.tsx` | Extract WaterfallRenderer + KiwiSDRController | Medium — canvas/WS lifecycle |
| Done | `DashboardView.tsx` | Extract MiniMap + panel widgets | Low — independent panels |
| Done | `SystemSettingsWidget.tsx` | Extract 3 sub-widgets + useWatchlist hook | Low |
| DONE | `SystemStatus.tsx` | Extract layer controls + integration status | Low |
| Done | `useAnimationLoop.ts` | Extract interpolation and filter engines | High — performance critical |
| 9 | `TacticalMap.tsx` + `OrbitalMap.tsx` | Extract shared map base | High — core rendering path |
| 10 | `App.tsx` | Introduce Zustand store, extract view wrappers | High — touches everything |

---

## What Not to Refactor Prematurely

- `KiwiNodeBrowser.tsx` (651 lines): The embedded map is used nowhere else; extraction would add abstraction without reuse.
- `RadioTerminal.tsx` (1,191 lines): The orchestration role is legitimate — the real fix is ensuring child components are small enough to stand alone first (Priority 4).
- Layer composition files in `frontend/src/layers/`: These are already split by domain; the issue is the hooks that consume them, not the files themselves.

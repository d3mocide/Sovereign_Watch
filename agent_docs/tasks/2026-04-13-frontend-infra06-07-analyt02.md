# Frontend: Infra-06, Infra-07, and Analyt-02 Components

**Date:** 2026-04-13
**Branch:** `claude/lower-priority-p2-items-FzkOy`

## Issue

The backend data pipelines for Infra-06 (DNS Root Server health), Infra-07
(Cloudflare CDN Edge PoPs), and Analyt-02 (mission-scoped stats) were complete,
but operators had no way to see or interact with any of it.  There were no map
layers, no layer toggles, and no mission-scope switch in the stats dashboard.

## Solution

### Infra-06 — DNS Root Server health layer

- **Type**: `DnsRootServer` added to `types.ts` (`letter`, `operator`, `ip`,
  `lat`, `lon`, `reachable`, `latency_ms`)
- **Data hook**: `useInfraData.ts` fetches `/api/infra/dns-root` on mount and
  every 5 minutes (matches poller cadence).
- **Layer**: `buildInfraLayers.ts` renders a `ScatterplotLayer` (id
  `dns-root-layer-merc|globe`).  Green fill = reachable (alpha scaled by
  latency_ms: 0 ms → 220, 200 ms+ → 140).  Red fill = unreachable.
- **Toggle**: `showDnsRoot` filter flag; `Server` icon, green theme in
  `LayerVisibilityControls.tsx`.  Defaults to off; wired into `infraIsOn`
  aggregate and `toggleInfra`.

### Infra-07 — Cloudflare CDN edge PoPs layer

- **Type**: `CdnEdgeNode` added to `types.ts` (`iata`, `city`, `country`,
  `lat`, `lon`, `region?`)
- **Data hook**: `useInfraData.ts` fetches `/api/infra/cdn-nodes` on mount and
  every 6 hours (matches poller cadence).
- **Layer**: `buildInfraLayers.ts` renders a `ScatterplotLayer` (id
  `cdn-edge-layer-merc|globe`).  Indigo-500 fill `[99,102,241,200]`.
- **Toggle**: `showCdnEdge` filter flag; `Zap` icon, indigo theme in
  `LayerVisibilityControls.tsx`.

### Wiring (both Infra-06/07)

Both new data arrays flow through the full rendering stack:

```
useInfraData → App.tsx
  → TacticalMap.tsx (props + useAnimationLoop)
  → DashboardView.tsx → SituationGlobe.tsx
  → useAnimationLoop.ts (new refs)
  → composition.ts (LayerCompositionOptions + composeAllLayers call)
  → buildInfraLayers.ts
```

`AppFilters` / `MapFilters` in `types.ts` gains `showDnsRoot?` and
`showCdnEdge?`.  `InfraFilters` in `buildInfraLayers.ts` likewise extended.

### Analyt-02 — Mission-scoped stats toggle

- **`StatsDashboardView.tsx`**: Added `missionScope: boolean` and
  `missionInfo` state.  The main `fetchData` useEffect (30 s polling) now
  derives its activity and TAK-breakdown URLs from `missionScope`:
  - Global: `/api/stats/activity?hours=24` and `/api/stats/tak-breakdown`
  - Mission: `/api/stats/mission/activity` and `/api/stats/mission/tak-breakdown`
  The effect dependency list includes `missionScope` so switching the toggle
  immediately re-fetches.  `missionInfo` is populated from the response
  `mission` field when `mission_scoped === true`.
- **`ProtocolTab.tsx`**: New optional props `missionScope`, `missionInfo`,
  `onToggleMissionScope`.  A `GLOBAL VIEW / MISSION AOR` toggle button appears
  in the header.  When mission-scoped, an amber AOR banner shows the active
  mission coordinates and radius.  The activity chart title also switches from
  "Global Signal Activity" → "Mission AOR Activity".

## Changes

| File | Change |
|------|--------|
| `frontend/src/types.ts` | Added `DnsRootServer`, `CdnEdgeNode` interfaces; `showDnsRoot?`, `showCdnEdge?` to `AppFilters` |
| `frontend/src/hooks/useInfraData.ts` | Added `dnsRootData`/`cdnEdgeData` state + fetch + polling |
| `frontend/src/layers/buildInfraLayers.ts` | Extended `InfraFilters`; added DNS root + CDN edge `ScatterplotLayer` blocks; added `DnsRootServer[]`/`CdnEdgeNode[]` params |
| `frontend/src/layers/composition.ts` | `LayerCompositionOptions` + destructure + `buildInfraLayers` call extended |
| `frontend/src/hooks/useAnimationLoop.ts` | `UseAnimationLoopOptions`, destructure, refs, and `composeAllLayers` call extended |
| `frontend/src/App.tsx` | Destructures new data from `useInfraData`; passes to `TacticalMap` and `DashboardView` |
| `frontend/src/components/map/TacticalMap.tsx` | `TacticalMapProps` + destructure + `useAnimationLoop` call extended |
| `frontend/src/components/map/SituationGlobe.tsx` | `SituationGlobeProps` + destructure + `buildInfraLayers` call extended |
| `frontend/src/components/views/DashboardView.tsx` | `DashboardViewProps` + destructure + `SituationGlobe` call extended |
| `frontend/src/components/widgets/LayerVisibilityControls.tsx` | Added `Server`/`Zap` icons; `showDnsRoot`/`showCdnEdge` in `infraIsOn`, `toggleInfra`, and sub-toggle UI |
| `frontend/src/components/views/StatsDashboardView.tsx` | `missionScope`/`missionInfo` state; URL switching; passes new props to `ProtocolTab` |
| `frontend/src/components/stats/ProtocolTab.tsx` | Mission-scope toggle button + AOR banner + chart title switch |

## Verification

```
cd frontend
pnpm run lint      # 0 errors, 0 warnings
pnpm run typecheck # clean
pnpm run test      # 19 files, 279 tests — all pass
```

## Benefits

- Operators can now visualise DNS root server reachability/latency on the
  tactical map — a critical global internet health signal.
- Cloudflare edge PoP density overlay shows CDN routing health worldwide.
- Stats dashboard mission-scope toggle lets analysts compare mission-AOR
  signal activity vs global baseline without leaving the dashboard.

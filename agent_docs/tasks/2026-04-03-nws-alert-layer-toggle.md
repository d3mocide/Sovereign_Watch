# 2026-04-03 NWS Alert Layer Toggle

## Issue
Operators requested an environmental map toggle and visual overlay for active National Weather Service (NWS) alerts so severe weather could be viewed directly in tactical/orbital map workflows.

## Solution
Added a Redis-backed backend API route for active NWS GeoJSON and summary payloads, then wired a new frontend environmental filter (`showNWSAlerts`) into map controls and the deck.gl composition pipeline using a dedicated NWS GeoJSON layer builder.

## Changes
- backend/api/routers/infra.py
  - Added `GET /api/infra/nws-alerts` returning `nws:alerts:active` as GeoJSON.
  - Added `GET /api/infra/nws-alerts/summary` returning `nws:alerts:summary` counts.
- frontend/src/hooks/useInfraData.ts
  - Added periodic fetch for `/api/infra/nws-alerts`.
  - Exposed `nwsAlertsData` in hook return payload.
- frontend/src/types.ts
  - Added `showNWSAlerts?: boolean` to `MapFilters`.
- frontend/src/hooks/useAppFilters.ts
  - Added default filter state for `showNWSAlerts`.
- frontend/src/components/widgets/LayerVisibilityControls.tsx
  - Added NWS Alerts row under Environmental section.
  - Extended Environmental group toggle to include NWS alert state.
- frontend/src/layers/buildWeatherAlertsLayer.ts
  - New GeoJSON layer with severity-based fill/line coloring and pick handlers.
- frontend/src/layers/composition.ts
  - Added `nwsAlertsData` option and integrated `buildNWSAlertsLayer` in layer stack.
  - Adjusted composition order to render/pick NWS alerts above infra layers for reliable 2D tactical hover tooltips.
- frontend/src/hooks/useAnimationLoop.ts
  - Threaded `nwsAlertsData` through refs into `composeAllLayers`.
- frontend/src/components/map/TacticalMap.tsx
  - Added `nwsAlertsData` prop and forwarded to animation loop.
  - Improved infra callsign fallback to include NWS `event`/`headline` properties.
- frontend/src/components/map/OrbitalMap.tsx
  - Added `nwsAlertsData` prop and forwarded to animation loop.
  - Improved infra callsign fallback to include NWS `event`/`headline` properties.
- frontend/src/components/map/OrbitalMap.tsx
  - Removed NWS layer data plumbing after deciding weather alerts are tactical-map specific.
- frontend/src/App.tsx
  - Wired `nwsAlertsData` from `useInfraData` into Tactical and Orbital maps.
  - Limited `nwsAlertsData` wiring to Tactical map only.
- frontend/src/components/layouts/SidebarRight.tsx
  - Added explicit `nws_alert` and `outage` routing to `InfraView` to avoid fallback into aircraft state.
- frontend/src/components/layouts/sidebar-right/InfraView.tsx
  - Added dedicated NWS alert state (header/icon/accent + weather-specific details block).
- frontend/src/components/layouts/sidebar-right/types.ts
  - Extended `InfraProperties` with NWS fields (`event`, `headline`, `urgency`, `certainty`, `areaDesc`, `expires`, etc.).

## Verification
- Frontend: `cd frontend && pnpm run lint && pnpm run test`
- Backend API: `cd backend/api && uv tool run ruff check . && uv run python -m pytest`

## Benefits
- Adds weather hazard situational awareness directly into map operations.
- Reuses existing infra data and deck.gl composition architecture with low integration risk.
- Keeps operational controls consistent by integrating NWS alerts into Environmental layer management.

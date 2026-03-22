# SatNOGS Network Integration

## Issue
The goal was to integrate SatNOGS ground station data and orbital spectrum observations into the Sovereign Watch frontend. This required fetching live ground station positions, rendering a global Mapbox/Deck.GL layer, and querying per-satellite spectrum verification data for analysis within the UI.

## Solution
We adopted a hybrid architecture by proxying requests via the FastAPI backend to bypass CORS and apply Redis caching, and rendering the data natively in the frontend using a customized `useSatNOGS` hook and a new `SatNOGSLayer`.

## Changes
- **Backend**: Added `GET /api/satnogs/stations` proxy endpoint via `httpx` in `backend/api/routers/satnogs.py`.
- **Frontend Types**: Added `SatNOGSStation` and updated `MapFilters` (`showSatNOGS`) inside `frontend/src/types.ts`.
- **Hooks**: Created `frontend/src/hooks/useSatNOGS.ts` targeting data fetching for `stations` and an isolated `fetchVerification(noradId)` method.
- **Layers**: Created `frontend/src/layers/SatNOGSLayer.ts` as a Deck.GL `ScatterplotLayer` for rendering ground locations on the globe, and injected it into `composition.ts`.
- **Component Routing**:
  - `frontend/src/App.tsx`: Wired up `useSatNOGS`, passing `stationsRef` down to `OrbitalMap` and `fetchSatnogsVerification` to `SidebarRight`.
  - `frontend/src/components/map/OrbitalMap.tsx` & `useAnimationLoop.ts`: Passed ref down to Deck.gl render loop.
  - `frontend/src/components/layouts/OrbitalSidebarLeft.tsx`: Added a stylistic toggle pill for the `SatNOGS Network` layer filter state.
  - `frontend/src/components/layouts/SidebarRight.tsx`: Injected a complex `Spectrum_Verification` panel into the `SatelliteInspectorSection`, calling out anomalies, latents, and overall verified status.

## Verification
- Validated TS types within `App.tsx` and the sidebars.
- Component state variables correctly scoped across `OrbitalSidebarLeft` array iterations and isolated hooks inside `SidebarRight`.

## Benefits
Provides analysts with a fast, real-time overlay of distributed RF sensors matching satellite flight paths, offering a major intelligence gathering boost for verifying anomalous signals or telemetry drops from orbital assets.

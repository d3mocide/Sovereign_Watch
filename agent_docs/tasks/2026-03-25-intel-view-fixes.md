# 2026-03-25: TopBar Reordering & Intel Globe Optimization

## Issue
- TopBar navigation was incorrectly ordered and read "DASHBOARD" instead of "DASH".
- The `INTEL` view globe was not auto-spinning immediately upon mount.
- Connection arcs (GDELT data) on the Intel globe were consistently occluded/swallowed when MapLibre rendered the globe.
- The `INTEL` view suffered from ~500ms latency resulting in sluggish performance.
- We needed a way to strip base map layers and view raw data layers for debugging.

## Solution
1. **TopBar & Auto-Spin**:
   - Reordered `TopBar.tsx` buttons to: `TACTICAL | ORBITAL | INTEL | DASH | RADIO`.
   - Set the default `intelSpin` state in `App.tsx` to `true`.
2. **Performance Optimization**:
   - Cached actor-to-country string matching in `buildCountryHeatLayer.ts` to convert an O(N*M) loop into O(N) lookup.
   - Memoized the `arcData` array and Deck.gl layer builders.
3. **Globe Map Rendering (The Occlusion Fix)**:
   - Diagnosed that MapLibre's underlying globe projection depth buffer conflicts heavily with Deck.gl's data layers when interleaved.
   - Decoupled `IntelGlobe.tsx` from MapLibre entirely.
   - Re-implemented the base maps using pure Deck.GL `TileLayer` on a native `GlobeView`, passing URLs from `intelMapStyles.ts`.
4. **Debug Mode**:
   - Added a `DEBUG` map style that bypasses base map rendering and disables `depthTest` / `depthBias` across all GDELT and Heat layer pipelines, revealing raw data.

## Changes
- `frontend/src/components/layouts/TopBar.tsx` (Buttons reordered/renamed)
- `frontend/src/App.tsx` (`intelSpin` defaults to true)
- `frontend/src/components/map/IntelGlobe.tsx` (Refactored to pure `DeckGL` native GlobeView + `TileLayer` base maps)
- `frontend/src/components/map/intelMapStyles.ts` (Added `getBaseMapTileUrl`)
- `frontend/src/components/map/MapLibreAdapter.tsx` (Disabled interleaved mode, though ultimately bypassed by IntelGlobe)
- `frontend/src/layers/buildCountryHeatLayer.ts` (Memoized matching logic, skipped depthTest in debug)
- `frontend/src/layers/buildGdeltArcLayer.ts` (Boosted arc visibility in debug)
- `frontend/src/layers/buildGdeltLayer.ts` (Skipped depthTest in debug)
- `frontend/package.json` / `pnpm-lock.yaml` (Added `@deck.gl/react@9.2.11`)

## Verification
- Intel view successfully loads with immediate smooth rotation.
- Frame rate improved; 500ms interaction latency eliminated via layer memoization.
- Selecting `DEBUG` style renders arcs and dots in high contrast on a plain background.
- Selecting `SATELLITE` natively drapes ESRI satellite raster tiles cleanly onto the Deck.GL globe with arcs cleanly layered on top.

## Benefits
- Drastically improved rendering stability and visual accuracy for global Intelligence data.
- Reduced CPU overhead.
- Removed Mapbox/MapLibre rendering dependency for the pure globe view.

# 2026-03-25 - Restore MapLibre in IntelGlobe

## Issue
Intel globe path was running as a direct Deck.gl-only globe render. Request was to restore MapLibre-backed rendering in `IntelGlobe`.

## Solution
Rewired `IntelGlobe` to render through `MapLibreAdapter` in globe projection while keeping existing Deck.gl intel layers as overlay content.

## Changes
- Updated [frontend/src/components/map/IntelGlobe.tsx](frontend/src/components/map/IntelGlobe.tsx):
  - Replaced direct `<DeckGL>` + `_GlobeView` render path with `<MapLibreAdapter globeMode={true}>`.
  - Switched style resolution to `resolveMapStyle(mapStyleProp)`.
  - Removed manual tile `TileLayer`/`BitmapLayer` base map path (MapLibre now owns base style rendering).
  - Kept existing intel data layers:
    - country heat layer
    - GDELT points
    - GDELT arcs
  - Added `handleMove` to update view state and only mark interaction on real user events.
- Updated [frontend/src/components/map/mapAdapterTypes.ts](frontend/src/components/map/mapAdapterTypes.ts):
  - `mapStyle` type widened from `string` to `string | object` to support resolved MapLibre style objects.
- Restarted frontend runtime:
  - `docker compose restart sovereign-frontend`

## Verification
- `cd frontend && pnpm run lint` (pass)
- `cd frontend && pnpm run test` (pass, 36 tests)

## Benefits
- Restores MapLibre globe pipeline for Intel view.
- Maintains Intel layer stack and sidebar interaction behavior.
- Keeps style switching compatible with both URL styles and inline style objects.

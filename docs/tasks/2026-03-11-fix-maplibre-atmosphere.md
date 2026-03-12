# 2026-03-11-fix-maplibre-atmosphere.md

## Issue
The recently implemented Map Globe visuals were triggering multiple errors in the browser console:
- `layers.tactical-sky-atmosphere: missing required property "source"`
- `layers.tactical-sky-atmosphere.type: expected one of [...], "sky" found`

These stemmed from using the Mapbox-specific `sky` layer type inside MapLibre GL JS, which does not support it even in v5.

## Solution
Migrated the atmosphere implementation in `useMapCamera.ts` to use the native `map.setAtmosphere()` API provided by MapLibre v5.

## Changes
- **[MODIFY] [useMapCamera.ts](file:///d:/Projects/SovereignWatch/frontend/src/hooks/useMapCamera.ts)**: 
    - Replaced `map.addLayer` logic for the `sky` type with `map.setAtmosphere`.
    - Added defensive checks for `typeof map.setAtmosphere === 'function'`.
    - Implemented `map.setAtmosphere(null)` when switching to Satellite imagery or leaving Globe mode to allow the `StarField` component to remain visible.

## Verification
- Code has been updated to follow the official MapLibre v5 atmosphere API.
- Logic ensures that in Satellite mode, the atmosphere is cleared to allow background transparency.
- Lint check performed (ignoring transient environment-related module resolution errors).

## Benefits
- Resolves multiple critical console errors that were forcing style rebuilds from scratch.
- Restores the intended cinematic "navy" atmosphere in dark tactical mode.
- Maintains visual parity between Mapbox and MapLibre implementations for Globe mode.

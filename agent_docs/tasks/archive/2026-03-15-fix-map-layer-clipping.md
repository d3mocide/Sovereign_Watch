# 2026-03-15-fix-map-layer-clipping

## Issue
Map layers (history trails, AOT borders, submarine cables) are being clipped or occluded by the internet outage layer when enabled. This is particularly visible in Mercator mode, where surface layers using `depthTest: true` can conflict with one another or the base map tiles if not properly biased or if Rule 1 (z=0 depth testing) is violated.

## Solution
1. **Infrastructure Layers**: Update `buildInfraLayers.ts` to use conditional depth testing `{ depthTest: !!globeMode, depthBias: globeMode ? -N : 0 }`. This follows "Rule 1" from `agent_docs/z-ordering.md` and prevents them from writing to the depth buffer in Mercator mode, where draw order (Slot 3) already ensures they are background.
2. **Depth Tiers**: Shift infrastructure depth bias values further back in the depth stack to ensure history trails (-50) and AOT boundaries (-200) always render in front in Globe mode.
    - `country-outages`: `-20.0`
    - `submarine-cables`: `-30.0`
    - `cable-stations`: `-40.0`

## Changes
- `frontend/src/layers/buildInfraLayers.ts`: Changed `parameters` for outages, cables, and stations.

## Verification
- Toggle "Internet Outages" on/off and verify history tails and submarine cables are no longer clipped.
- Test in both Mercator (2D) and Globe (3D) modes.
- Verify AOT boundaries (cyan/green rings) remain topmost.

# 2026-03-12-map-layer-depth-sorting.md

## Issue
Infrastructure layers (Internet Outages, Submarine Cables, Landing Stations) were visually occluding tactical indicators like AIS and ADS-B icons and trails. This was due to inconsistent or conflicting `depthBias` settings across Deck.gl layers, particularly when rendering in Globe/3D modes.

## Solution
Implemented a comprehensive depth stacking strategy across the entire map layer ecosystem. This ensures a consistent vertical hierarchy where tactical data always "floats" above environmental and infrastructure data.

## Changes
- **Infrastructure (`buildInfraLayers.ts`)**:
    - Set positive `depthBias` values (15.0 to 20.0) for outages, cables, and stations.
    - Enabled `depthTest: true` for these layers to ensure they respect the depth buffer.
- **Tactical Entities (`buildEntityLayers.ts`)**:
    - Set negative `depthBias` values:
        - Icons: `-100.0`
        - Halos: `-150.0`
        - Velocity Vectors: `-250.0`
    - Enabled `depthTest: true` for velocity vectors.
- **Trails (`buildTrailLayers.ts`)**:
    - Set negative `depthBias` value of `-50.0` for all history trails and gap bridges.
    - This positions trails between the infrastructure background and the entity foreground.

## Verification
- **Visual Stacking**: Confirmed that tactical icons and trails render clearly on top of shaded country polygons (Outages) and cable lines.
- **Projection Consistency**: Verified depth sorting remains correct across both Mercator and Globe modes.
- **3D Mode**: Ensured that icons do not "sink" into environmental layers when tilting the camera in globe mode.

## Benefits
- Improved tactical clarity: Operators can always see tracked assets regardless of active infrastructure overlays.
- Reduced visual artifacts: Eliminates z-fighting between background polygons and foreground indicators.
- Future-proof layering: Established a numeric range strategy for future layer additions.

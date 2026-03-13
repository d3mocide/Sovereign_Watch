# 2026-03-11-universal-sat-mode.md

## Issue
The user requested that the Satellite imagery mode be available in all map views (2D, 3D, and Globe) for both Tactical and Orbital maps, providing a consistent experience when switching styles.

## Solution
Unified the map styling state across all components and view modes.

## Changes
- **[MODIFY] [useMapCamera.ts](file:///d:/Projects/SovereignWatch/frontend/src/hooks/useMapCamera.ts)**:
    - Renamed internal `globeStyle` to `mapStyleMode` to reflect its expanded role.
- **[MODIFY] [TacticalMap.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/map/TacticalMap.tsx)**:
    - Renamed state and updated UI to show the DARK/SAT switcher in all modes (2D/3D/Globe).
    - Updated `mapStyle` logic:
        - Mapbox: Toggle between `standard` (dark preset) and `satellite-v9`.
        - MapLibre: Toggle between `dark-matter-gl` and ESRI satellite tiles.
- **[MODIFY] [OrbitalMap.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/map/OrbitalMap.tsx)**:
    - Implemented identical logic to TacticalMap for visual parity.
- **Starfield Visibility**: The Starfield remains active in all Globe modes (including Dark), using subtle transparency to show stars while maintaining a 3D atmosphere.

## Verification
- Verified DARK/SAT toggle in:
    - Tactical 2D (Mapbox / MapLibre)
    - Tactical 3D (Mapbox)
    - Tactical Globe (MapLibre)
    - Orbital 2D (MapLibre)
    - Orbital Globe (MapLibre)
- UI consistency across both components confirmed.

## Benefits
- Full flexibility for users to choose their preferred visualization style in any mode.
- Professional, cohesive design language across the entire platform.

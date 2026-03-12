# 2026-03-11-revert-satellite-refine-ui.md

## Issue
The universal satellite mode in 2D/3D views was visually inconsistent and had rendering issues with Mapbox. Additionally, the UI controls (2D/3D and Style Switcher) were always visible, leading to a cluttered interface in Globe mode.

## Solution
Reverted the universal satellite mode and refined the UI visibility logic:
1.  **Basemap Reversion**: 2D and 3D views are now forced to use the Dark Tactical basemap (Mapbox Standard or Carto Dark Matter). Satellite view is now exclusively available in Globe mode.
2.  **Adaptive Controls**:
    - **2D/3D Buttons**: Automatically hidden when entering Globe mode to simplify the UI.
    - **Style Switcher (DARK/SAT)**: Only visible when in Globe mode, as that's currently the only mode where switching basemaps is functionally supported and visually intended.
3.  **UI Layout**: Maintained the updated layout where 3D orientation controls appear above the mode selector.

## Changes
- **[MODIFY] [TacticalMap.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/map/TacticalMap.tsx)**:
    - Updated `mapStyle` calculation.
    - Wrapped buttons in conditional rendering blocks based on `globeMode`.
- **[MODIFY] [OrbitalMap.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/map/OrbitalMap.tsx)**:
    - Updated `mapStyle` calculation.
    - Wrapped style switcher in conditional rendering.

## Verification
- Verified code logic for `mapStyle` ensuring it defaults to standard/dark when `globeMode` is false.
- Verified JSX structure for conditional rendering of UI elements.

# 2026-03-11-orbital-map-sat-starfield.md

## Issue
The user requested parity between Tactical and Orbital maps, specifically:
- SAT mode (satellite imagery) in Orbital Map.
- Starfield background visible in both Dark and Satellite globe modes.

## Solution
Implemented SAT mode in `OrbitalMap.tsx` and modified the atmosphere implementation to allow background transparency in Dark globe mode.

## Changes
- **[MODIFY] [OrbitalMap.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/map/OrbitalMap.tsx)**:
    - Added `globeStyle` state and `SATELLITE_MAP_STYLE` constant.
    - Integrated `StarField` component behind the map.
    - Added UI switcher buttons for DARK/SAT styles in the bottom control bar.
- **[MODIFY] [TacticalMap.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/map/TacticalMap.tsx)**:
    - Updated `StarField` to be active in all globe modes.
- **[MODIFY] [useMapCamera.ts](file:///d:/Projects/SovereignWatch/frontend/src/hooks/useMapCamera.ts)**:
    - Adjusted the DARK mode atmosphere to use `rgba` colors with 0.4-0.6 alpha, allowing the `StarField` to show through the globe's "space" region while maintaining a subtle cinematic glow.

## Verification
- UI controls verified for toggling styles.
- Starfield visibility logic confirmed for both Dark and Satellite styles in Globe mode.
- MapLibre v5 atmosphere API remains the authoritative method for these effects.

## Benefits
- Visual consistency across all map views.
- Enhanced immersive experience for orbital tracking.
- Resolves the "empty space" look in dark globe mode.

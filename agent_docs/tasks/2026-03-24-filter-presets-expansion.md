# 2026-03-24-filter-presets-expansion

## Issue
The user requested two new filter presets in the system settings:
1.  **Orbital Only**: To view only satellite-related data.
2.  **Map Layers Only**: To view standard terrestrial/map data without satellites.

## Solution
1.  Updated `ALL_FILTER_KEYS` in `FilterPresets.tsx` to include missing layer keys (`showSatNOGS`, `showH3Coverage`, `showTerminator`) so they can be managed by presets.
2.  Expanded the `applyPreset` logic to support `"orbital"` and `"map"` states.
3.  Updated the UI grid in `FilterPresets.tsx` to include buttons for the new presets with appropriate Lucide icons (`Satellite` and `Layers`) and theme colors.

## Changes
- `frontend/src/components/widgets/FilterPresets.tsx`:
    - Added `Layers` and `Satellite` icons to imports.
    - Updated `ALL_FILTER_KEYS` list.
    - Implemented logic for `orbital` and `map` presets.
    - Added new buttons to the preset grid.

## Verification
- Ran `pnpm run lint` in `frontend` (PASSED).
- Ran `pnpm run test` in `frontend` (PASSED).
- Verified the logic covers all satellite keys (Satellites, GPS, Weather, Comms, Intel, Other, Starlink, SatNOGS).

## Benefits
- Improved situational awareness by providing quick toggles for space-based vs. terrestrial data views.
- Better consistency in "Clear All" logic by including more managed layer keys.

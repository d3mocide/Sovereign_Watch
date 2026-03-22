# 2024-03-22 - Orbital Map Refinements & Bug Fixes

## Issue
The orbital map view had some layout density issues, particularly on the right side. Several UI components were not defaulting to the user's preferred states, and there were inconsistencies with layer filtering (specifically GDELT events) and the internet outages layer in orbital view.

## Solution
1.  **Orbital Layout**: Moved the `SpaceWeatherPanel` and `PolarPlotWidget` from the absolute-positioned HUD in `OrbitalMap.tsx` into the `rightSidebar` slot in `App.tsx`. This aligns them with the sidebar width and moves them out of the center-right density zone.
2.  **Default States**: Set the global terminator toggle to be enabled by default. Changed the default state of the space weather map filter in the tactical view to 'off'.
3.  **Orbital View Optimization**: Disabled the internet outages layer in orbital view (via `orbitalFilters` in `App.tsx`) to focus on space-relevant data.
4.  **UI/UX Refinements**: Reordered the view state pill selector to **TACT | ORB | DASH | RADIO**.
5.  **GDELT Layer Fix**: Fixed a bug where GDELT icons were always enabled; they now correctly respect the `showGdelt` filter in `composition.ts` and `IntelFeed.tsx`. Added a dedicated GDELT toggle to the `SystemStatus` widget under a new OSINT section.
6.  **Type Safety & Linting**: Resolved numerous TypeScript errors and linting warnings in `App.tsx`, `composition.ts`, `buildInfraLayers.ts`, and `buildAOTLayers.ts`.

## Changes
- `frontend/src/App.tsx`: Refactored `rightSidebar` prop to include orbital HUD; updated default filter states.
- `frontend/src/components/map/OrbitalMap.tsx`: Removed absolute-positioned HUD components.
- `frontend/src/components/widgets/SystemStatus.tsx`: Added OSINT section with GDELT toggle.
- `frontend/src/components/layouts/TopBar.tsx`: Reordered view mode buttons.
- `frontend/src/layers/composition.ts`: Fixed boolean casting for filter properties to ensure consistent layer visibility.
- `frontend/src/components/widgets/IntelFeed.tsx`: Added filter check to ensure GDELT events are correctly hidden when the toggle is off.
- `frontend/src/types.ts`: Updated `MapFilters` interface.

## Verification
- Switched to Orbital View: HUD stack now aligns with the right sidebar and dynamically sizes.
- Toggled GDELT filters: Icons correctly appear/disappear on the map and in the intelligence feed.
- Verified default states: Terminator is on by default; Space Weather is off.
- Checked Internet Outages: Layer is hidden in orbital mode as requested.

## Benefits
- Improved UI balance and readability in orbital mode.
- More intuitive default state for global visibility tools.
- Better data focus in space-centric views.
- Resolved multiple "ghost" linting and type errors, improving code quality.

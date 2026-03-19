# 2026-03-16-dashboard-orbital-filtering.md

## Issue
The dashboard view was experiencing two major issues:
1.  **Metric/Map Desync**: Switching to the Dashboard View unmounted the `TacticalMap`, which previously held the `useMissionArea` hook responsible for mission polling and entity maintenance. This caused the dashboard metrics (Air, Sea, Orbital counts) to freeze or reset to zero.
2.  **Starlink Noise**: The orbital data set is dominated by several thousand Starlink nodes. These are useful for the dedicated "Orbital View" but add significant visual and performance noise to the dashboard's mini-map and high-level counters.

## Solution
1.  **Mission Logic Lift**: Moved the `useMissionArea` hook from `TacticalMap` to the `App` root. This ensures that the global mission state, entity maintenance, and localized asset counts are processed continuously in the background, regardless of the active view.
2.  **Starlink Suppression**:
    *   Updated the background maintenance loop in `App.tsx` to exclude satellites with the `constellation: 'Starlink'` property from the dashboard-exposed `orbital` count.
    *   Modified `DashboardView.tsx` to skip Starlink nodes when rendering the mini-map GeoJSON overlay.

## Changes
- **App.tsx**
    - Captured the return value of `useMissionArea` and passed it as a prop named `missionArea` to `TacticalMap`.
    - Implemented a filter in the background `maintenance` loop to exclude 'Starlink' from the `orbital` count.
    - Updated `filters` state to use the `MapFilters` interface for better type safety.
- **TacticalMap.tsx**
    - Refactored to accept `missionArea` as a prop instead of managing it internally.
    - Cleaned up unused variables and fixed `useEffect` dependency warnings.
- **DashboardView.tsx**
    - Updated `updateLayers` to filter out Starlink satellites from the mini-map data source.
- **types.ts**
    - Relaxed the `MapFilters` index signature to `any` to allow non-boolean values (radius, modes) while maintaining required fields.

## Verification
- Switched between Tactical and Dashboard views; confirmed metrics in the top bar remain synchronized and up-to-date.
- Verified that the "Orbital" count on the dashboard is now significantly lower (reflecting only tactical/science sats) and the mini-map is clear of dense Starlink clusters.
- Confirmed that Starlink data remains fully available and visible in the dedicated "Orbital View".
- Resolved the `TypeError` related to `missionArea` destructuring.

# 2026-03-22-gdelt-dashboard-integration

## Issue

The user wanted to integrate GDELT event data more deeply into the dashboard. Specifically:

1. Replace the JS8 Terminal widget with a GDELT breakdown.
2. Centralize GDELT fetching so both the map and dashboard share data.
3. Show a count of events worldwide by "Goldstein Tone".
4. Enhance map hover tooltips for GDELT incidents.

## Solution

1. **Centralized Data Fetching**: Modified `useInfraData.ts` to include GDELT fetching logic. This ensures data is fetched once and shared across components.
2. **Dashboard Widget**: Created `GdeltBreakdownWidget.tsx` which calculates statistics (Total Events, Avg Stability) and provides a visual breakdown by categorization (Conflict, Tension, Unstable, Stable).
3. **UI Integration**: Replaced the JS8 feed in `DashboardView.tsx` with the new widget.
4. **Tooltip Enhancement**: Updated `MapTooltip.tsx` with a specialized GDELT view.
5. **Logic Refinement**: Removed proximity-based "intel feed" alerts for GDELT in `TacticalMap.tsx` to focus on the global breakdown view instead.

## Changes

- Modified `frontend/src/hooks/useInfraData.ts`: Added `gdeltData` state and `fetchGdelt` logic.
- Modified `frontend/src/App.tsx`: Propagated `gdeltData` to child views.
- Created `frontend/src/components/widgets/GdeltBreakdownWidget.tsx`: Aggregation logic and UI.
- Modified `frontend/src/components/views/DashboardView.tsx`: Integrated the new widget and removed JS8 logic.
- Modified `frontend/src/components/map/MapTooltip.tsx`: Dedicated GDELT styling.
- Modified `frontend/src/layers/buildGdeltLayer.ts`: Added hover callback support.
- Modified `frontend/src/components/map/TacticalMap.tsx`: Cleaned up local fetching and alerts.

## Verification

- Verified GDELT data loads from the API.
- Verified tooltips show domain and tone.
- Verified Dashboard displays the breakdown stats.

## Filter State Persistence & Master Toggles

- **Issue**: The master "Global Network" toggle would auto-enable everything (including high-density FCC towers), and previously set user preferences were lost when toggling the group off and back on.
- **Solution**:
  - Implemented a "User Preference" system using `localStorage` keys (e.g., `pref_showTowers`).
  - Modified the master "Global Network" toggle in `SystemStatus.tsx` to restore from these preferences instead of forcing `true`.
  - Defaulted FCC Towers and Landing Stations to `false` on initial enable (to avoid UI clutter), while preserving the "Active" status of the master group if any sub-category is on.
- **Benefits**:
  - Reduced map clutter by not auto-enabling heavy layers.
  - Improved UX through "Stateful Toggling" that remembers what the user specifically wanted visible.

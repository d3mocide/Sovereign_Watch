## Issue
The System Health widget was excessively tall, taking up too much screen real estate and requiring scrolling to view all trackers. Additionally, the SatNOGS trackers were fragmented across multiple sections, and the Clausalizer Flow activity bar was non-dynamic (pegged at 100%).

## Solution
Implemented a condensed grid-based layout for the widget, consolidated SatNOGS health into a single unified row, and updated the Clausalizer metrics logic for better visual feedback.

## Changes
- Updated `frontend/src/components/widgets/SystemHealthWidget.tsx`:
  - **Grid Layout**: Switched poller lists to a 2-column grid to reduce vertical height by ~40%.
  - **SatNOGS Consolidation**: Integrated "Stations", "Network", and "Database" into a single row with STAT, NET, and DB status pills.
  - **Compact Rows**: Reduced vertical padding and simplified labels (truncated extra context like "(ADS-B)" in favor of a cleaner look).
  - **Clausalizer Flow Fix**: 
    - Updated `activityPercent` to use a logarithmic scale saturated at 5,000 rows (previously 100), making it much more representative of real-time throughput.
    - Added an `animate-pulse` effect to the bar when active to provide immediate visual confirmation of system health.
  - **Dimensions**: Increased widget width from `300px` to `320px` to accommodate the new grid layout without text clipping.

## Verification
- Frontend: 
  - `pnpm run lint`: Passed.
  - `pnpm run typecheck`: Passed.
- Visual: Verified that all status items are now visible without scrolling on a standard 1080p display.

## Benefits
- Improved dashboard density and scan-ability.
- Consolidated SatNOGS health simplifies external dependency awareness.
- More accurate "active" signal for the data fusion pipeline.

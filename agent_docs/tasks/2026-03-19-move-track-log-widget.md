# Move Track Log Widget

## Issue
The Track Log widget was previously showing under the Vector Dynamics and Compass sections in the right sidebar, requiring users to scroll or miss it. The user requested it to be moved before the Position Telemetry section so it is front and center.

## Solution
Moved the `TrackHistoryPanel` rendering block above the `Positional_Telemetry` logic in the right sidebar.

## Changes
- `frontend/src/components/layouts/SidebarRight.tsx`:
  - Moved the TrackHistoryPanel logic from the bottom of the "Main Data Body" section to the very top, before the "Positional Group", ensuring it remains bounded by the `showHistory && !isSat && !isShip` conditions.

## Verification
- Verified the code logic flow in the component tree. HMR will reload the module correctly inside the container.

## Benefits
- Improved usability and discoverability for track logs.

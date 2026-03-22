# 2026-03-22-fix-orbital-widget-duplication

## Issue

The Orbital Map view was displaying duplicate instances of the `SpaceWeatherPanel` and `PolarPlotWidget`. One set was correctly anchored as a floating HUD in `OrbitalMap.tsx`, while a second set was improperly injected into the `rightSidebar` slot in `App.tsx`. This caused visual clutter, with widgets overlapping when the sidebar was open and "ghost" static panels appearing in the sidebar region.

## Solution

Consolidated the widget rendering to ensure clarity and avoid redundancy. Removed the redundant `SpaceWeatherPanel` from the `App.tsx` sidebar slot, eliminated the floating `PolarPlotWidget` from the `OrbitalMap.tsx` HUD stack, and disabled map attribution in Orbital View for a cleaner aesthetic.

1. **Pruned Duplicates**: Eliminated `SpaceWeatherPanel` from the `App.tsx` layout shell.
2. **Removed Phantom HUD Widget**: Deleted the floating `PolarPlotWidget` from `OrbitalMap.tsx` to stop 'phantom' ghosting.
3. **Preserved Sidebar Inspector**: Kept the `PolarPlotWidget` inside `SidebarRight.tsx` for detailed satellite analysis.
4. **Cleaned Logic**: Removed `currentPassData` state from `App.tsx` and related props from `OrbitalMap.tsx`.
5. **Aesthetic Cleanup**: Disabled map attribution in `OrbitalView` to match the application-wide clean UI rules.

## Changes

- `frontend/src/App.tsx`:
  - Removed `SpaceWeatherPanel` and `PolarPlotWidget` from the `rightSidebar` prop section.
  - Removed unused imports for these components.
- `agent_docs/tasks/2026-03-22-fix-orbital-widget-duplication.md`: Created this task log.

## Verification

- Switched to Orbital View:
  - PASS: Only one Space Weather panel is visible.
  - PASS: The panel is correctly positioned at the top-right of the map.
- Selected a satellite (e.g., GAOFEN-1):
  - PASS: Sidebar opened correctly.
  - PASS: The Space Weather panel slid left to `right: 380` to avoid overlapping the sidebar.
  - PASS: The sidebar-specific Polar Plot remained in the inspector (as designed for detailed analysis), while the floating HUD stack maintained its position.
- Deselected satellite:
  - PASS: HUD stack returned to `right: 20`.

## Benefits

- **Visual Clarity**: Removed confusing duplicate UI elements.
- **Consistent Layout**: Fixed the "ontop" rendering issue reported by the user.
- **Improved Performance**: Reduced redundant component renders and API calls for space weather data.

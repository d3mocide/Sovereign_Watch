# Task: Dashboard TAK Protocol Breakdown & Navigation

**Date**: 2026-03-26
**Status**: Completed

## Issue
The Sovereign Watch dashboard required deeper protocol analytics (TAK/CoT breakdown) and better navigation from the main tactical interface. Additionally, the dashboard layout was non-scrollable, causing content to be clipped on smaller screens.

## Solution
1. **Backend**: Implemented `/api/stats/tak-breakdown` to aggregate signal types from the `tracks` table.
2. **Frontend HUD**: Added a "STATS" link to the `SystemHealthWidget` header for quick access.
3. **Frontend Dashboard**:
   - Refactored layout to use Flexbox with `overflow-y-auto` for scrollability.
   - Integrated a `TAK Protocol Breakdown` pie chart and reference guide.
   - Enhanced the activity chart with stacked areas and protocol-specific colors.

## Changes

### [Backend]
- [stats.py](file:///c:/Projects/Sovereign_Watch/backend/api/routers/stats.py): Added `get_tak_breakdown` endpoint and `COT_MAP` for human-readable labels.
- [test_stats.py](file:///c:/Projects/Sovereign_Watch/backend/api/tests/test_stats.py) [NEW]: Added unit tests for telemetry aggregation and breakdown logic.

### [Frontend]
- [SystemHealthWidget.tsx](file:///c:/Projects/Sovereign_Watch/frontend/src/components/widgets/SystemHealthWidget.tsx): Added navigation button to `/stats`.
- [StatsDashboardView.tsx](file:///c:/Projects/Sovereign_Watch/frontend/src/components/views/StatsDashboardView.tsx):
  - Updated root container styles for full-page scrollability.
  - Added `TAK Protocol Breakdown` (Pie Chart) and `Hierarchical Reference Guide`.
  - Improved chart legends and color mapping.

## Verification
- **Backend**: Ran `pytest tests/test_stats.py` - 3/3 passed.
- **Frontend**: Ran `pnpm run lint` - 0 warnings/errors.
- **Manual**: Verified link resolution and layout responsiveness.

## Benefits
- Improved situational awareness with protocol-level signal distribution.
- Better visibility into system health and telemetry.
- Enhanced UX with reliable navigation and responsive layouts.

# 2026-03-28 - Holding Sidebar Severity Badge

## Issue
Holding pattern detail view in the right sidebar showed status but did not expose turn-intensity severity at a glance, even after map-level turn-based severity coloring was added.

## Solution
Added a severity badge to the holding sidebar status block using the same turn thresholds as the map layer for visual consistency.

## Changes
- Updated `frontend/src/components/layouts/sidebar-right/HoldingPatternView.tsx`:
  - Added a `getHoldingSeverity()` helper based on `turns_completed`.
  - Severity thresholds:
    - `< 2 turns` -> `NORMAL` (amber)
    - `2 to < 5 turns` -> `ELEVATED` (orange)
    - `>= 5 turns` -> `CRITICAL` (red)
  - Applied severity color to status text.
  - Added a dedicated `SEVERITY` badge in the tactical badge row.

## Verification
- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run test`

## Benefits
- Better analyst readability in the right-sidebar holding view.
- Consistent severity semantics between map markers and sidebar details.
- Faster prioritization of sustained/extreme holding behavior.

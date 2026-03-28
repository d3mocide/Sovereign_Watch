# 2026-03-28 - Holding Tooltip Severity Badge

## Issue
Map tooltip for holding patterns displayed turns completed but did not explicitly indicate severity, creating mismatch with newer map/sidebar severity indicators.

## Solution
Added a holding severity label to the tooltip using the same turn-based thresholds as the map layer and right-sidebar holding panel.

## Changes
- Updated `frontend/src/components/map/MapTooltip.tsx`:
  - Added `getHoldingSeverity()` helper.
  - Severity thresholds:
    - `< 2 turns` -> `NORMAL` (amber)
    - `2 to < 5 turns` -> `ELEVATED` (orange)
    - `>= 5 turns` -> `CRITICAL` (red)
  - Added `SEVERITY` row in the holding tooltip content block.
  - Synced tooltip chrome to severity:
    - Header icon/dot accent color follows severity.
    - Tooltip border color follows severity.
    - `TACTICAL STATUS` and `COMPLETED` values follow severity color.

## Verification
- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run test`

## Benefits
- Consistent severity language across map rings, tooltip, and right sidebar.
- Faster triage during hover without opening the full entity panel.

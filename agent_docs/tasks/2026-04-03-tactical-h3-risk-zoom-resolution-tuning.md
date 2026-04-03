# 2026-04-03 Tactical H3 Risk Zoom Resolution Tuning

## Issue
Tactical view Risk Grid needed to keep midsize cells longer through normal mission zooms. Smaller cells were being introduced too early, creating an over-detailed look at common working scales.

## Solution
Adjusted tactical map zoom-to-H3-resolution mapping to prioritize midsize cells through mid zoom levels, then increase detail only at deeper local zoom.

## Changes
- `frontend/src/components/map/TacticalMap.tsx`
  - Updated `h3RiskResolution` logic to keep midsize cells dominant at common tactical zooms:
    - `z < 5  => res 4`
    - `z < 15 => res 6`
    - `z < 17 => res 7`
    - `z < 19 => res 8`
    - `z >= 19 => res 9`

## Verification
- `cd frontend && pnpm run lint && pnpm run test`
- Result: pass (`36` tests passed)

## Benefits
- Preserves preferred midsize tactical appearance at mission-operating zoom levels.
- Delays fine-cell rendering until very close local inspection zoom levels.
- Keeps globe/orbital coarse behavior intact while still allowing deep-zoom detail.

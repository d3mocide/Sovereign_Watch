# 2026-03-28 - Mini Tactical Hazard Overlays

## Issue
The Tactical Overview mini map in the dashboard did not show key hazards, specifically GPS jamming zones and holding pattern indicators, reducing cross-panel situational parity.

## Solution
Added dedicated mini-map overlay sources/layers for active jamming zones and active holding patterns, populated via existing API endpoints on a polling interval.

## Changes
- Updated `frontend/src/components/widgets/MiniMap.tsx`:
  - Added polling for:
    - `GET /api/jamming/active`
    - `GET /api/holding-patterns/active`
  - Added `jamming-zones` source and rendered a confidence-scaled halo with assessment-based color.
  - Added `holding-zones` source and rendered severity-scaled indicators with turn-based color ramp:
    - `< 2 turns` amber
    - `2 to < 5 turns` orange
    - `>= 5 turns` red
  - Integrated jamming/holding source updates into existing periodic layer refresh loop.

## Verification
- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run test`

## Benefits
- Improves Tactical Overview parity with main map hazards.
- Enables faster dashboard triage with compact hazard indicators.
- Reuses existing backend hazard APIs without new server endpoints.

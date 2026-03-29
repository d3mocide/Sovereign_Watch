# 2026-03-28 - Fix SMAPS Tooltip State

## Issue
Map hover/click tooltips for SMAPS/piracy entities were falling through to the generic default branch, showing `TYPE: AVIONICS` and `STATUS: TRACKING` instead of piracy-specific state.

## Solution
Added explicit SMAPS entity detection and a dedicated tooltip rendering branch with piracy semantics (icon, labels, threat-driven status/color).

## Changes
- Updated `frontend/src/components/map/MapTooltip.tsx`:
  - Added `isSMAPS` detection using entity type and incident properties fallback.
  - Added SMAPS styling in accent and border color logic.
  - Added SMAPS icon mapping (`Skull`).
  - Added SMAPS header badge label (`PIRACY`).
  - Added dedicated SMAPS content section with:
    - `SYSTEM: PIRACY INCIDENT`
    - `TYPE` from hostility
    - `STATUS` derived from threat score thresholds
    - `THREAT` score display
    - `NAV AREA`
  - Added SMAPS fallback in the generic `TYPE` formatter so it never returns `AVIONICS` for incident rows.

## Verification
- `cd frontend && pnpm run lint && pnpm run test`
- Result: pass (lint clean, 36 tests passed).

## Benefits
- Tooltip now correctly represents SMAPS incidents as piracy/hazard intelligence.
- Removes misleading avionics state for maritime threat entities.
- Improves operator trust and situational clarity in map interaction.

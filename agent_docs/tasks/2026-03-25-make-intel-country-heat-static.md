# 2026-03-25 - Make Intel Country Heat Static

## Issue
The animated pulse effect on Intel country heat fills was visually too aggressive and distracted from the rest of the map overlays.

## Solution
Removed the fill pulse behavior and switched the country heat layer to static threat-based fill opacity while preserving existing threat color semantics and depth ordering.

## Changes
- Updated `frontend/src/layers/buildCountryHeatLayer.ts`:
  - Removed pulse-based alpha modulation from `threatToFillColor`.
  - Set fixed fill alpha values for `CRITICAL`, `ELEVATED`, and `MONITORING`.
  - Removed the fill-color animation trigger.
  - Kept `animTick` parameter only for call-site compatibility.

## Verification
- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run test`

## Benefits
- Reduces visual noise in Intel mode.
- Makes country heat feel more stable and readable.
- Preserves existing threat encoding without introducing new controls or dependencies.

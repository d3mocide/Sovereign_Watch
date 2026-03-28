# 2026-03-28 - Hazards Color, Jamming Radius Tuning, and Tooltip Runtime Fix

## Issue
Three UX/runtime issues were observed:
- Runtime crash in `MapTooltip` (`Cannot access 'holdSeverity' before initialization`).
- Hazards group controls used a purple accent that conflicted with hazard semantics.
- GPS integrity/jamming zones appeared visually oversized for tactical readability.

## Solution
- Fixed variable initialization order in tooltip logic.
- Re-themed top-level Hazards controls from purple to amber.
- Reduced jamming overlay radii while preserving confidence-based scaling.

## Changes
- Updated `frontend/src/components/map/MapTooltip.tsx`:
  - Moved `holdSeverity` computation above first usage in color selection logic.
- Updated `frontend/src/components/widgets/LayerVisibilityControls.tsx`:
  - Changed Hazards top-level button/badge/toggle accent from purple to amber.
  - Kept per-sub-layer colors (e.g., Aurora remains purple) for domain distinction.
- Updated `frontend/src/layers/buildJammingLayer.ts`:
  - Pulse ring radius reduced from approximately `40-110 km` to `22-60 km`.
  - Fill zone radius reduced from approximately `38-66 km` to `18-45 km`.

## Verification
- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run test`

## Benefits
- Resolves hover runtime failure in map tooltip.
- Improves visual language consistency for Hazards controls.
- Keeps GPS integrity zones informative while reducing map clutter/overlap.

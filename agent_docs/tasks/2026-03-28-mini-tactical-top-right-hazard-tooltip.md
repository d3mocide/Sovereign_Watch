# 2026-03-28 - Mini Tactical Top-Right Hazard Tooltip

## Issue
After adding jamming and holding overlays to the Tactical Overview mini map, there was no at-a-glance legend in-map to indicate what the hazard colors represented.

## Solution
Added a compact top-right hazard tooltip/legend panel directly on the mini map.

## Changes
- Updated `frontend/src/components/widgets/MiniMap.tsx`:
  - Wrapped mini-map container with a `relative` parent.
  - Added an absolute top-right hazard panel (`pointer-events-none`) showing:
    - `JAM` indicator with active zone count.
    - `HOLD` indicator with active hold count.
    - Critical hold cue: dot/text switch to red when any hold has `turns_completed >= 5`.

## Verification
- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run test`

## Benefits
- Improves Tactical Overview readability without opening side panels.
- Provides quick hazard context directly where overlays are displayed.
- Keeps interaction unobstructed via non-interactive overlay styling.

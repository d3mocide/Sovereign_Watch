# 2026-03-28-situation-globe-rotation-controls

## Issue

The Situational globe rotation speed needed to be reduced to the preferred slower cadence (the prior `25%` control setting), while avoiding extra in-viewport UI controls.

## Solution

Set the Situational globe to a fixed default rotation speed equal to the previously preferred `25%` setting and removed the temporary bottom-left control cluster.

The animation loop remains imperative and jitter-free, with a single baked-in spin constant.

## Changes

- `frontend/src/components/map/SituationGlobe.tsx`
  - Set `GLOBE_ROTATION_DEG_PER_60FPS_FRAME` to `0.01` (equivalent to previous `25%` speed setting).
  - Removed in-viewport rotation control UI.
  - Removed temporary pause/speed state and scaling logic.

## Verification

- `cd frontend && pnpm run lint && pnpm run test`
  - Lint: pass
  - Tests: pass (`36/36`)

## Benefits

- Preserves the preferred slower tactical rotation speed by default.
- Keeps the viewport visually clean with no extra control chrome.
- Maintains smooth globe animation performance.

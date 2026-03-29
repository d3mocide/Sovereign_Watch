# 2026-03-28 - Intel News Widget 75% Height Constraint

## Issue
In Intel view, the full News widget consumed the entire right sidebar height, making it visually dominant relative to other HUD elements.

## Solution
Constrain the Intel News widget container to 75% of viewport height so it no longer fills 100% of available panel space.

## Changes
- Updated `frontend/src/App.tsx`:
  - In the Intel right-sidebar branch (`viewMode === "INTEL"`), changed the News widget wrapper class from `flex-1` to fixed viewport constraints:
    - `h-[75vh] max-h-[75vh]`
  - Kept existing overflow and panel styling behavior unchanged.

## Verification
- Ran targeted frontend verification:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run test`
- Result: pass (`2` test files, `36` tests, `0` failures).

## Benefits
- Prevents full-height visual takeover by the News widget.
- Improves Intel view composition balance and breathing room.
- Maintains existing widget behavior while adjusting only layout footprint.

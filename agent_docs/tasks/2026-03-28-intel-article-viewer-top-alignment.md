# 2026-03-28 - Intel Article Viewer Top Alignment

## Issue
The Intel in-app article viewer opened slightly misaligned relative to the left and right sidebar panels, making the overlay feel detached from the shared HUD grid.

## Solution
Align the article viewer top offset to the same vertical baseline used by the sidebar columns: TopBar height plus MainHud content padding.

## Changes
- Updated `frontend/src/App.tsx`:
  - Changed article viewer overlay top offset from `top-16` to `top-[71px]`.
- Alignment basis:
  - `TopBar` height = `55px`
  - `MainHud` content padding = `16px`
  - Total = `71px`

## Verification
- Ran targeted frontend verification:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run test`
- Result: pass (`2` test files, `36` tests, `0` failures).

## Benefits
- Article viewer now aligns cleanly with left/right sidebar panel tops.
- Improves HUD grid consistency in Intel view.
- Keeps overlay positioning deterministic relative to the main shell layout.

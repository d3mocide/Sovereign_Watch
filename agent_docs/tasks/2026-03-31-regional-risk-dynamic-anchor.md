# 2026-03-31 - Regional Risk Dynamic Anchor

## Issue
The Regional Risk Analysis panel was fixed-position and appeared to float. It did not re-anchor when the right sidebar opened or closed.

## Solution
Aligned Regional Risk panel positioning behavior with the Space Weather HUD widget pattern by using a dynamic right offset with smooth transition.

## Changes
- Updated [frontend/src/App.tsx](frontend/src/App.tsx):
  - Replaced static `right-[22rem]` placement for the regional risk overlay.
  - Added dynamic style-based positioning:
    - `right: 380` when an entity sidebar is open.
    - `right: 20` when no entity sidebar is open.
  - Added `transition: "right 0.3s ease-in-out"` for smooth anchor movement.

## Verification
- Ran frontend lint:
  - `cd frontend && pnpm run lint`
  - Result: pass
- Ran frontend tests:
  - `cd frontend && pnpm run test`
  - Result: pass (36 tests)

## Benefits
- Regional Risk panel now anchors with HUD behavior instead of floating.
- Prevents overlap with the right entity sidebar.
- Provides a consistent motion/positioning model with existing map widgets.

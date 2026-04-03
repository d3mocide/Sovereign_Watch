# 2026-04-03 Risk Grid Toggle TopBar Relocation

## Issue
The Risk Grid quick toggle in the Intelligence Stream header created visual clutter and duplicated controls in a context where users preferred core map toggles in the top status bar.

## Solution
Relocated the Risk Grid quick toggle to the TopBar status controls, placing it between Terminator and History Trails. Removed the duplicate control from the Intelligence Stream header.

## Changes
- `frontend/src/components/layouts/TopBar.tsx`
  - Added `showH3Risk` and `onToggleH3Risk` props.
  - Added Risk Grid toggle button between Terminator and History Trails.
- `frontend/src/App.tsx`
  - Wired TopBar Risk Grid props to app filter state (`showH3Risk`) and `handleFilterChange`.
- `frontend/src/components/widgets/IntelFeed.tsx`
  - Removed Risk Grid toggle from Intelligence Stream header.

## Verification
- `cd frontend && pnpm run lint && pnpm run test`
- Result: pass (`36` tests passed)

## Benefits
- Consolidates map-control toggles in one consistent top-bar location.
- Reduces Intelligence Stream header clutter.
- Preserves full Risk Grid functionality and existing mode-aware behavior.

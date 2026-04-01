# 2026-03-31-wire-regional-risk-context-menu-action

## Issue
The map context menu item "Analyze Regional Risk" produced no visible behavior because the callback chain stopped at `App.tsx`. `MapContextMenu` emitted `onAnalyzeRegionalRisk`, but `App` did not pass a handler into map components.

## Solution
Implemented an App-level regional risk handler that calls `POST /api/ai_router/evaluate`, then wired this handler into both `TacticalMap` and `OrbitalMap`.

## Changes
- `frontend/src/App.tsx`
  - Added `handleAnalyzeRegionalRisk(h3Region, lat, lon)` callback.
  - Calls backend endpoint `/api/ai_router/evaluate` with lookback and source flags.
  - Emits progress/success/error messages into the Intel event feed using `addEvent`.
  - Passed callback prop to:
    - `TacticalMap` as `onAnalyzeRegionalRisk`
    - `OrbitalMap` as `onAnalyzeRegionalRisk`

## Verification
- `cd frontend && pnpm run lint` passed.
- `cd frontend && pnpm run test` passed (36 tests).

## Benefits
Enables operators to trigger real regional risk evaluation directly from map right-click, making the context menu action actionable for clausalizer/risk testing.

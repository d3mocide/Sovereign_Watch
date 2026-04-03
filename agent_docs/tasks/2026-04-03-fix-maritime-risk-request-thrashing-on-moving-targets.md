# 2026-04-03 - Fix Maritime Risk Request Thrashing on Moving Targets

## Issue
`/api/maritime/risk-assessment` was being called repeatedly at high frequency while a maritime CoT target was selected.

## Root Cause
`useMaritimeRisk` depended on `lat` and `lon` in its effect dependencies. Since selected AIS targets update position continuously, each coordinate update retriggered the effect and immediate fetch.

## Solution
Adjusted the hook to fetch once per MMSI selection by default, with optional timer-based refresh only when explicitly requested.

## Changes
- Updated `frontend/src/hooks/useMaritimeRisk.ts`:
  - Added `refreshMs` optional parameter (`null` default).
  - Removed `lat`/`lon` from trigger dependencies and tracked latest coordinates in a ref.
  - Immediate fetch now occurs on MMSI selection; repeat polling occurs only when `refreshMs` is provided.
  - Retained request cancellation and cleanup behavior.

## Verification
- Frontend verification run:
  - `cd frontend && pnpm run lint && pnpm run test`

## Benefits
- Eliminates endpoint spam while following moving maritime tracks.
- Preserves correct one-shot risk assessment behavior per selected vessel.
- Keeps optional periodic refresh capability available for future tuning.

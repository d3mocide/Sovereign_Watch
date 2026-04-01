# 2026-03-31 - Add Clausalizer Monitoring Bar to System Health Widget

## Issue
The System Health widget showed service statuses but did not surface clausalizer pipeline throughput/freshness inline, requiring operators to switch to the Stats dashboard for quick clausalizer health checks.

## Solution
Added an analysis-scoped Clausalizer monitoring row with a compact activity bar in the System Health widget.

## Changes
- Updated `frontend/src/components/widgets/SystemHealthWidget.tsx`:
  - Added fetch for `/api/stats/clausalizer?hours=1` alongside poller health.
  - Added local clausalizer metrics state.
  - Added a new `CLAUSALIZER FLOW` row under the `ANALYSIS` group.
  - Added status derivation from `last_write_at` freshness:
    - `HEALTHY` for <= 5 minutes
    - `STALE` for <= 15 minutes
    - `ERROR` when older or missing
  - Added compact monitoring bar driven by recent `rows_5m_total` activity.
  - Added metadata text for `Rows/5m` and minutes since last write.
  - Added minute-tick state update to keep freshness text current without impure render calls.

## Verification
- Frontend lint:
  - `cd frontend && pnpm run lint`
  - Result: pass
- Frontend tests:
  - `cd frontend && pnpm run test`
  - Result: pass (36 tests)

## Benefits
- Exposes clausalizer runtime signal directly in the tactical health widget.
- Improves operator awareness without requiring dashboard context-switching.
- Provides immediate visual cue for both activity volume and write freshness.

# Fusion Audit Storage Metrics Fix

## Issue

The Fusion Audit panel could display implausibly small database sizes (for example `0.1 MB`) even when the Timescale hypertable had significantly more data. The root cause was that the backend size query only inspected the parent `tracks` relation and did not include Timescale chunk tables. The same endpoint also returned a hardcoded ingest velocity (`14.2 MB/HR`), so the storage projection chart was not tied to current ingestion behavior.

## Solution

Update the backend fusion metrics endpoint to compute total storage from both the parent hypertable and its chunk relations, and replace the simulated velocity baseline with a measured estimate derived from recent track ingest volume. Update the frontend formatting so large values are shown in GB/TB and clarify that the projection is linear from current velocity.

## Changes

- Updated `backend/api/routers/stats.py`:
  - Storage query now sums `timescaledb_information.chunks` relation sizes plus the parent `tracks` relation.
  - Added fallback to parent-table size query if chunk-aware query is unavailable.
  - Replaced hardcoded `velocity_mb_hr` with an estimate derived from recent row count and sampled row byte size over a 6-hour window.
- Updated `frontend/src/components/stats/FusionAuditTab.tsx`:
  - Added storage and velocity formatters for MB/GB/TB readability.
  - Capped retention bar width at 100% to prevent overrun artifacts.
  - Updated chart subtitle to indicate it is a linear estimate from current ingest velocity.

## Verification

- Frontend:
  - `pnpm run lint` (pass)
  - `pnpm run typecheck` (pass)
  - `pnpm run test` (pass, 11 files / 180 tests)
- Backend API:
  - `uv tool run ruff check .` (pass)
  - `uv run python -m pytest` (fails during collection in this environment due pre-existing NumPy CPU baseline mismatch: `X86_V2`)
  - `uv run python -m pytest tests/test_ai_router_air.py` is affected by the same environment-level NumPy issue because `routers.ai_router` imports `services.hmm_trajectory`.

## Benefits

- Fusion Audit `Current Size` now reflects actual Timescale hypertable footprint instead of parent-table-only size.
- Ingest velocity and chart projection are grounded in current data flow rather than a placeholder constant.
- Operators can read large storage values directly without manually converting from raw MB.

# 2026-04-01 - Clausalizer Stats Dashboard Tab

## Issue
Operators could not directly observe clausalizer pipeline health and recent clause activity from the backend stats dashboard, making it hard to confirm runtime behavior and diagnose perceived pipeline outages.

## Solution
Added a dedicated Clausalizer tab in the stats dashboard and a backend stats endpoint that aggregates clausalizer health, source activity totals, timeline data, and recent clause samples.

## Changes
- Updated `backend/api/routers/stats.py`:
  - Added `GET /api/stats/clausalizer`.
  - Returned:
    - `health` (`rows_5m`, `rows_5m_total`, `last_write_at`)
    - `source_totals`
    - `timeline` (1-minute buckets by source)
    - `latest` (recent clause samples)
- Updated `frontend/src/components/stats/types.ts`:
  - Added `ClausalizerMetrics`, `ClausalizerTimelinePoint`, and `ClausalizerLatestClause` types.
  - Extended `TabName` with `clausalizer`.
- Added `frontend/src/components/stats/ClausalizerTab.tsx`:
  - KPI cards for 5-minute health and source splits.
  - Timeline chart for source throughput.
  - Latest clauses list for debug visibility.
- Updated `frontend/src/components/views/StatsDashboardView.tsx`:
  - Added clausalizer metrics state.
  - Added fetch for `/api/stats/clausalizer?hours=24`.
  - Added Clausalizer tab nav item and render case.

## Verification
- Frontend:
  - `cd frontend && pnpm run lint && pnpm run test`
  - Result: PASS (`eslint` clean, `vitest` 36/36 tests passed).
- Backend API:
  - `cd backend/api && uv tool run ruff check . && uv run python -m pytest`
  - Result:
    - `ruff`: FAIL due to pre-existing unused variable (`services/escalation_detector.py:420`, `context_score`).
    - `pytest`: FAIL due to pre-existing test mismatch (`tests/test_tracks_validation.py::test_track_history_hours_exceeded`, expected 400, got 503).

## Benefits
- Provides immediate operational visibility into clausalizer pipeline behavior.
- Reduces ambiguity during ingestion/debug incidents by surfacing recent clause emissions.
- Improves confidence that clausalizer writes are active without direct DB inspection.

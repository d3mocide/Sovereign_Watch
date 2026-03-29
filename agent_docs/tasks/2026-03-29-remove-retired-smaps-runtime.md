# 2026-03-29 - Remove Retired SMAPS Runtime

## Issue
SMAPS had already been sunset operationally, but the repository still contained retired runtime code, UI branches, ingestion helpers, schema definitions, and active documentation that treated the workstream as current. The live database also still had the retired `smaps_incidents` table.

## Solution
Removed the remaining SMAPS runtime path end-to-end. This cleanup deleted the retired router, hook, layer, ingestion loop, tests, and schema objects, then updated the remaining maritime conditions interfaces to use generic compatibility naming. Active docs were revised to mark SMAPS as retired, and the live database table was dropped to match source control.

## Changes
- Removed retired backend/API/runtime code:
  - `backend/api/routers/smaps.py`
  - SMAPS router registration from `backend/api/main.py`
  - SMAPS schema/context references from `backend/api/services/schema_context.py`
- Removed retired ingestion code and tests:
  - SMAPS loop/helpers/config from `backend/ingestion/infra_poller/main.py`
  - `backend/ingestion/infra_poller/tests/test_smaps.py`
- Removed retired frontend code paths:
  - `frontend/src/hooks/useSMAPSWarnings.ts`
  - `frontend/src/layers/buildSMAPSLayer.ts`
  - SMAPS entity/filter/UI branches from the tactical map, tooltip, sidebar, layer composition, and shared types
- Updated remaining maritime conditions compatibility naming:
  - `backend/api/routers/maritime.py`
  - `backend/api/tests/test_maritime_risk.py`
  - `frontend/src/hooks/useMaritimeRisk.ts`
- Removed retired schema objects:
  - `backend/db/init.sql` no longer defines `smaps_incidents`
  - Live database: `DROP TABLE IF EXISTS smaps_incidents CASCADE;`
- Updated active docs to reflect retirement rather than active implementation:
  - `agent_docs/README.md`
  - `agent_docs/UNIFIED_ROADMAP.md`
  - `agent_docs/IMPLEMENTATION_ROADMAP.md`
  - `agent_docs/GEOSPATIAL_SUMMARY.md`

## Verification
- Frontend:
  - `cd frontend && pnpm run lint && pnpm run test`
  - Result: pass, 36 tests passed.
- Backend API:
  - `cd backend/api && d:/Projects/SovereignWatch/.venv/Scripts/python.exe -m ruff check . && d:/Projects/SovereignWatch/.venv/Scripts/python.exe -m pytest`
  - Result: pass, 46 tests passed.
- Infra poller:
  - `cd backend/ingestion/infra_poller && d:/Projects/SovereignWatch/.venv/Scripts/python.exe -m ruff check . && d:/Projects/SovereignWatch/.venv/Scripts/python.exe -m pytest`
  - Result: pass, 50 tests passed.
- Live DB check:
  - `docker compose exec -T sovereign-timescaledb psql -U postgres -d sovereign_watch -c "\\dt *smaps*"`
  - Result: no SMAPS relations found.

## Benefits
- Fully removes a retired and unreliable upstream dependency from active code and schema.
- Keeps the maritime conditions feature focused on buoy-driven data that still operates.
- Reduces maintenance noise from dead branches, stale tests, and misleading implementation docs.
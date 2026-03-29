# Release - v0.56.0 - SMAPS Retirement and Maritime Conditions Stabilization

This release completes the operational retirement of SMAPS from Sovereign Watch runtime paths. Maritime operator workflows remain available through buoy-derived sea-state conditions while retired SMAPS ingestion, API, map-layer, and schema surfaces are removed to reduce runtime fragility and maintenance overhead.

### Key Features

- **SMAPS Runtime Removal**: Removed the retired SMAPS incidents route from active backend wiring and deleted the dedicated router module.
- **Ingestion Simplification**: Removed SMAPS loop/config/helpers from the infra poller and deleted associated test modules.
- **Frontend Cleanup**: Removed SMAPS hooks/layers/toggles and SMAPS-specific tooltip/sidebar branching from tactical map UX paths.
- **Schema and Runtime Parity**: Removed `smaps_incidents` bootstrap DDL and dropped the live table so source and runtime database state match.
- **Maritime Conditions Continuity**: Preserved buoy-driven maritime conditions reporting with compatibility-safe incident field naming.

### Technical Details

- **Backend/API**:
  - Removed SMAPS router registration and module.
  - Updated maritime report compatibility naming to `incident_max_score`.
  - Removed SMAPS schema context and endpoint references from analyst context builders.
- **Ingestion**:
  - Removed retired SMAPS scheduling path and parsing/upsert helpers from `infra_poller`.
  - Removed SMAPS test suite under `backend/ingestion/infra_poller/tests`.
- **Frontend**:
  - Removed retired SMAPS hook and layer modules.
  - Removed SMAPS entity/filter/type branches from map composition, tooltip, and right-sidebar rendering.
  - Updated maritime report hook typings to generic incident compatibility labels.
- **Database**:
  - Deleted `smaps_incidents` table/index definitions from `backend/db/init.sql`.
  - Executed live cleanup: `DROP TABLE IF EXISTS smaps_incidents CASCADE;`.

### Verification

- Frontend: `cd frontend && pnpm run lint && pnpm run test` (pass, 36 tests)
- Backend API: `cd backend/api && ruff check . && python -m pytest` (pass, 46 tests)
- Infra poller: `cd backend/ingestion/infra_poller && ruff check . && python -m pytest` (pass, 50 tests)
- Live database: `docker compose exec -T sovereign-timescaledb psql -U postgres -d sovereign_watch -c "\\dt *smaps*"` (no relations found)

### Upgrade Instructions

To upgrade to v0.56.0:

1. Pull the latest code:
   `git pull origin main`
2. Rebuild and restart services:
   `docker compose up -d --build`
3. Validate service health and map overlays:
   - Confirm buoy data and maritime conditions panel are rendering.
   - Confirm no SMAPS entities/routes are expected in runtime output.

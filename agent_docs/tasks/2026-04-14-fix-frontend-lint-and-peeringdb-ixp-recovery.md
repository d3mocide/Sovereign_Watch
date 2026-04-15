## Issue

Frontend verification was blocked by a stale `react-hooks/exhaustive-deps` disable in `useInfraData.ts`. Separately, the internet exchange layer had stopped loading any data because the PeeringDB `/api/ix` payload no longer included direct coordinates, so the infra poller parsed zero IXPs while still successfully ingesting facilities.

## Solution

Removed the obsolete lint suppression and updated the infra poller to recover IXP coordinates from PeeringDB facility city/country centroids when the upstream IXP payload omits lat/lon. Also added a recovery guard so the poller bypasses its 24-hour cooldown when the prior IXP ingest produced zero records.

## Changes

- Updated `frontend/src/hooks/useInfraData.ts`
  - Removed the unused `react-hooks/exhaustive-deps` disable on the FIRMS effect.
- Updated `backend/ingestion/infra_poller/main.py`
  - Added `build_peeringdb_facility_location_index()` to derive city/country centroids from facility data.
  - Added `enrich_peeringdb_ixps_with_facility_locations()` to backfill missing IXP coordinates.
  - Updated PeeringDB ingestion to parse facilities first, infer IXP coordinates where needed, and bypass cooldown when cached stats show an empty IXP ingest.
- Updated `backend/ingestion/infra_poller/tests/test_peeringdb_iss.py`
  - Added regression coverage for the facility centroid index and IXP coordinate backfill logic.

## Verification

- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run typecheck`
- `cd frontend && pnpm run test`
  - Result: passed (`18` files, `268` tests).
- `cd backend/ingestion/infra_poller && uv tool run ruff check .`
- `cd backend/ingestion/infra_poller && uv run python -m pytest`
  - Result: passed (`88` tests).
- Runtime parity:
  - `docker compose -f docker-compose.yml -f compose.dev.yml up -d --build sovereign-infra-poller`
  - Verified logs show `PeeringDB: previous IXP ingest was empty, bypassing cooldown for recovery.`
  - Verified Redis stats now report `ixp_count: 975`.
  - Verified Postgres now contains `975` rows in `peeringdb_ixps`.

## Benefits

- Restores a clean frontend verification surface.
- Makes the IXP layer resilient to PeeringDB upstream schema drift.
- Allows the poller to self-heal quickly after a bad or empty IXP ingest instead of waiting a full day.
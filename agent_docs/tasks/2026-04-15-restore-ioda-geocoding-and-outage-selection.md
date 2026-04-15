## Issue

Internet outage ingestion in `infra_poller` regressed because `_fetch_internet_outages()` still called `InfraPollerService.geocode_region(...)`, but that method no longer existed. The frontend also had an outage selection regression where outage features could be treated as generic infrastructure in map hover/select handlers, which pushed the sidebar/tooltip into the default submarine cable rendering path.

## Solution

Restored the missing Nominatim-backed geocoder with in-memory caching in `infra_poller`, and hardened frontend outage detection so both Tactical and Orbital map interactions consistently classify outage features from their properties rather than relying only on `object.type`.

## Changes

- Updated `backend/ingestion/infra_poller/main.py`
  - Reintroduced `geocode_region()` using `NOMINATIM_URL`, the existing `_geocode_cache`, and the shared poller user agent.
  - Preserved safe failure behavior by returning `(0.0, 0.0)` when geocoding fails or produces no result.
- Updated `backend/ingestion/infra_poller/tests/test_infra.py`
  - Added regression coverage verifying Nominatim lookup and cache reuse.
- Updated `frontend/src/components/map/OrbitalMap.tsx`
  - Added property-based outage detection for hover and selection.
  - Prefer outage region labels in callsigns so outage entities render with the correct detail context.
- Updated `frontend/src/components/map/TacticalMap.tsx`
  - Applied the same outage-feature detection hardening for infra hover and selection paths.

## Verification

- `cd backend/ingestion/infra_poller && uv tool run ruff check .`
- `cd backend/ingestion/infra_poller && uv run python -m pytest`
  - Result: passed (`86` tests).
- `cd frontend && pnpm run typecheck`
  - Result: passed.
- `cd frontend && pnpm run test`
  - Result: passed (`18` files, `268` tests).
- `cd frontend && pnpm run lint`
  - Result: blocked by a pre-existing unused eslint-disable in `frontend/src/hooks/useInfraData.ts`.

## Benefits

- Restores IODA outage ingestion so `infra:outages` can populate again instead of failing on startup.
- Prevents outage clicks and hovers from degrading into generic infrastructure detail rendering.
- Adds regression coverage for the geocoding path that caused the production failure.
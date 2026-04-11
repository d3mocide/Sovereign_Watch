## Issue

Regional risk was still admitting GDELT through a centroid-radius proxy around the requested H3 cell. That allowed out-of-AOT events into mission narratives without an explicit causal linkage model and still labeled GDELT scope as a pending proxy in the API response metadata.

The implementation plan also assumed a 2-letter GDELT country-code space, but the current repository stores actor country values as 3-letter strings such as USA and RUS in the ingest path.

## Solution

Implemented Phase 1 explicit GDELT linkage in the backend API layer without changing the database schema or ingestion pipeline.

The new path:
- uses ST_Within for in-AOT admission,
- derives mission-country and neighbor sets from a backend-local country lookup module,
- reverse-maps cable landing countries into the stored GDELT actor-country keyspace,
- admits linked external conflict events through state-actor, cable-infrastructure, and chokepoint gates,
- and reports explicit per-tier counts in source_scope metadata.

## Changes

- Added backend country-linkage data module in backend/api/routers/gdelt_country_codes.py.
  - Generated from existing workspace country assets and checked into the backend.
  - Includes normalized name lookup, reverse name-to-code lookup, centroid coordinates, and first-order neighbor sets.
  - Added alias coverage needed for cable-country reverse mapping such as United States.
- Updated backend/api/routers/ai_router.py.
  - Added helper functions for mission-country detection, mission-neighbor expansion, cable-country reverse mapping, chokepoint matching, and linkage classification.
  - Replaced the evaluate_regional_escalation GDELT proxy path with explicit in-AOT plus linked-external admission.
  - Extended selected GDELT rows with actor1_country, actor2_country, in_aot, and linkage_tier context.
  - Replaced the old proxy metadata note with explicit_geopolitical_linkage and per-tier linkage counts.
- Updated backend/api/tests/test_ai_router_evaluate.py.
  - Adjusted the regression assertion to the new GDELT scope contract.
- Added backend/api/tests/test_gdelt_linkage.py.
  - Covers mission-country detection, neighbor expansion, cable-country reverse mapping, and tier classification.

## Verification

- Ran targeted backend verification on host:
  - cd backend/api && uv tool run ruff check .
  - cd backend/api && uv run python -m pytest tests/test_ai_router_evaluate.py tests/test_gdelt_linkage.py
- Result: ruff clean, 5 tests passed.

## Benefits

- Removes the centroid-radius proxy from the primary in-AOT GDELT admission path.
- Prevents non-conflict external events from being admitted through the new external linkage gates.
- Makes the remaining GDELT mission-linkage behavior auditable through explicit linkage_tier tagging and source_scope counts.
- Keeps Phase 1 scoped to the backend API path so it can ship without schema or ingestion churn.
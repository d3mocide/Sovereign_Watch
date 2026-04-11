## Issue

Phase 1 linkage was implemented inside the regional evaluate route only. That solved the immediate mission-area proxy problem, but it left two follow-on gaps:

- the country-linkage data file was generated ad hoc rather than from a reproducible source path,
- and the GDELT linkage model still lived only in ai_router instead of being reusable by other API routes.

At the same time, the default GDELT feed endpoints are consumed by the frontend as raw/global feeds, so any reuse had to preserve the existing default behavior.

## Solution

Added a reproducible generator path for backend GDELT country linkage data and extracted the mission-linkage logic into a shared service.

Then extended the GDELT API routes with an optional mission-aware mode keyed by h3_region, while preserving the current raw/global behavior when that parameter is omitted.

## Changes

- Added reproducible country-data sources:
  - tools/generate_gdelt_country_codes.py
  - backend/api/data/gdelt_country_overrides.json
- Regenerated backend/api/routers/gdelt_country_codes.py from repo-owned assets plus explicit overrides.
  - Includes the Kosovo remap from XKX to KOS.
  - Keeps manual aliases and neighbor overrides out of the generated output.
- Added backend/api/services/gdelt_linkage.py.
  - Centralizes mission-country detection, cable-country reverse mapping, chokepoint matching, tier classification, and linked GDELT event fetching.
  - Exposes a single fetch_linked_gdelt_events() path used by routers.
- Updated backend/api/routers/ai_router.py.
  - Removed the in-router duplicate GDELT linkage implementation.
  - Repointed evaluate_regional_escalation() to the shared service.
- Updated backend/api/routers/gdelt.py.
  - Added optional h3_region mission-aware mode to /api/gdelt/events.
  - Added optional h3_region mission-aware mode to /api/gdelt/actors.
  - Preserved current default raw/global behavior and caching when h3_region is not supplied.
- Updated tests:
  - backend/api/tests/test_gdelt_linkage.py now targets the shared service helpers.
  - Added backend/api/tests/test_gdelt_router.py for mission-aware route behavior.

## Verification

- Ran targeted backend verification on host:
  - cd backend/api && uv tool run ruff check .
  - cd backend/api && uv run python -m pytest tests/test_ai_router_evaluate.py tests/test_gdelt_linkage.py tests/test_gdelt_router.py
- Result: ruff clean, 7 tests passed.

## Benefits

- The mission-linkage model now has one implementation path instead of being embedded only in ai_router.
- The backend country bridge is now reproducible from committed workspace assets and an explicit override file.
- Mission-aware GDELT APIs can now expose linked-only events and actor aggregations without changing the default raw/global feed behavior that current frontend consumers expect.
- Future linkage work can extend the shared service once instead of patching multiple routers independently.
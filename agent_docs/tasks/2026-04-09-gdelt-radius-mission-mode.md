## Issue
The mission-aware GDELT route support only accepted H3 cells, which left radius-based mission workflows without a shared linkage path for events and actor aggregation.

## Solution
Extended the shared GDELT linkage service to support either an H3 polygon AOT or a lat/lon plus nautical-mile radius AOT, then exposed that mode through the GDELT events and actors routes as an opt-in query pattern.

## Changes
- Rebuilt backend/api/services/gdelt_linkage.py into a clean shared implementation that supports both H3 and radius AOT contexts.
- Updated backend/api/routers/gdelt.py to accept lat, lon, and radius_nm alongside existing h3_region mission mode and to reject invalid mixed or partial inputs.
- Added router regression coverage in backend/api/tests/test_gdelt_router.py for radius mission mode and validation behavior.
- Preserved default global/raw route behavior for existing frontend consumers when no mission parameters are provided.

## Verification
- cd backend/api && uv tool run ruff check .
- cd backend/api && uv run python -m pytest tests/test_ai_router_evaluate.py tests/test_gdelt_linkage.py tests/test_gdelt_router.py
- Result: Ruff passed and all 9 targeted tests passed.

## Benefits
Radius-based missions can now reuse the same explicit geopolitical linkage logic as H3-based missions without forking route logic, while existing global dashboards remain unchanged.

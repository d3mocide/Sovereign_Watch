## Issue
The H3 risk route only supported global risk aggregation, which meant the map's mission-oriented workflows had no matching mission-scoped risk surface to complement right-click regional analysis.

## Solution
Added an opt-in mission mode to the existing H3 risk route using the same H3-or-radius selector pattern used by the mission-aware GDELT routes. In mission mode, track density is spatially filtered to the mission area, GDELT sentiment is sourced from the shared explicit-linkage service, and the response includes source-scope metadata.

## Changes
- Updated backend/api/routers/h3_risk.py to accept h3_region or lat/lon/radius_nm mission selectors.
- Reused backend/api/services/gdelt_linkage.py for mission-linked GDELT sentiment scoring and linkage metadata.
- Added mission-aware cache key partitioning so global and mission responses do not collide.
- Extended backend/api/models/schemas.py so H3 risk responses can carry optional source_scope metadata.
- Added regression coverage in backend/api/tests/test_h3_risk_scope.py for mission mode and invalid partial radius input.
- Kept backend/api/routers/stats.py unchanged so the existing backend stats dashboard remains global; mission stats remain a separate follow-on API decision.

## Verification
- cd backend/api && uv tool run ruff check routers/h3_risk.py models/schemas.py tests/test_h3_risk_scope.py
- cd backend/api && uv run python -m pytest tests/test_h3_risk_scope.py
- Result: Ruff passed and all 3 H3 risk scope tests passed.

## Benefits
Mission workflows can now request a risk surface aligned to the same explicit geopolitical linkage rules used elsewhere, improving consistency for right-click regional analysis while preserving the existing global risk and stats dashboards.

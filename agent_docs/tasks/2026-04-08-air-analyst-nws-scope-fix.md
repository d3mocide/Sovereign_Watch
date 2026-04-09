# Air Analyst NWS Scope Fix

## Issue

The air-domain analyst was reading the national NWS alert summary from Redis and passing those counts directly into the analysis prompt and context snapshot. That caused the analyst to cite severe weather risk even when the selected mission area had no active NWS alerts.

## Solution

Switch the air-domain analysis path to intersect the active NWS GeoJSON alerts with the target H3 region and pass only mission-area counts into the analyst context.

## Changes

- Updated `backend/api/routers/ai_router.py` to summarize NWS alerts from `nws:alerts:active` against the requested H3 region instead of using the national summary counts.
- Kept `fetched_at` metadata from the Redis summary blob while changing the alert counts to mission-area scope.
- Updated the air-domain prompt wording so the analyst sees `NWS alerts in target region` rather than an unscoped national blob.
- Added `backend/api/tests/test_ai_router_air.py` to prevent regressions where national NWS counts leak into region-scoped air analysis.

## Verification

- Ran `uv tool run ruff check .` from `backend/api` (pass).
- Ran `uv run python -m pytest` from `backend/api`; test collection failed in this environment due a pre-existing NumPy CPU baseline incompatibility (`X86_V2`) unrelated to this fix.
- Ran focused regression validation for this change:
	- `uv tool run ruff check routers/ai_router.py tests/test_ai_router_air.py` (pass)
	- `uv run python -m pytest tests/test_ai_router_air.py` (pass)

## Benefits

- Air-domain analysis now reflects actual weather context near the selected mission area.
- Operators are less likely to receive inflated or misleading weather-driven risk narratives.
- The national NWS summary remains available for dashboard and UI uses that are intentionally nationwide.
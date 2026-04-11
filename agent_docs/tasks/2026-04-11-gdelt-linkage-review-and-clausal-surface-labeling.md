# GDELT Linkage Review And Clausal Surface Labeling (2026-04-11)

## Issue

The new GDELT Phase 2 experiment scaffolding could evaluate second-order-neighbor and alliance/basing support candidates in tests, but there was no mission-scoped way to compare those experimental candidates against the live admitted linkage set on real mission queries. Separately, clausal external-driver labeling had been added to the sidebar only, leaving tooltip and analyst-panel surfaces without the same distinction between thresholded external drivers and local evidence.

## Solution

Added a mission-scoped GDELT linkage review endpoint that returns the live admitted set, the experimental candidate set, and a side-by-side overlap/delta summary for the same mission query. Reused the existing clausal space-weather presentation helper in the tooltip and AI analyst panel so analyst-facing clausal surfaces now use the same external-driver wording and threshold semantics.

## Changes

- `backend/api/services/gdelt_phase2_experiments.py`
  - Added `fetch_experimental_linkage_review()` to assemble live linkage results and experimental-only candidates side by side.
  - Preserved the non-rollout contract: experimental country sets remain review-only and do not affect live admission.
- `backend/api/routers/gdelt.py`
  - Added `/api/gdelt/linkage-review` for mission-scoped live-versus-experimental comparison.
- `backend/api/tests/test_gdelt_router.py`
  - Added route coverage for the new comparison payload.
- `frontend/src/components/map/MapTooltip.tsx`
  - Added clausal external-driver summary text using the shared presentation helper.
- `frontend/src/components/widgets/AIAnalystPanel.tsx`
  - Added clausal external-driver context summary in the target-info block using the shared presentation helper.

## Verification

- `cd backend/api && uv tool run ruff check . && uv run python -m pytest tests/test_gdelt_router.py tests/test_gdelt_phase2_experiments.py tests/test_gdelt_linkage.py`
  - Passed, `17 passed`
- `cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test`
  - Passed

## Benefits

- Mission operators can now compare the live GDELT linkage set against experimental widening candidates without changing the production trust boundary.
- The comparison output shows exactly how much blast radius second-order or support-country rules would add before any rollout decision.
- Clausal external-driver context now reads consistently across the sidebar, tooltip, and analyst panel.
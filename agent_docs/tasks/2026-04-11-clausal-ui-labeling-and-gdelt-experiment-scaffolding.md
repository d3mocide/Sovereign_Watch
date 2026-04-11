# Clausal UI Labeling And GDELT Experiment Scaffolding (2026-04-11)

## Issue

The backend now distinguishes thresholded external-driver space-weather context from local clausal evidence, but the clausal sidebar did not surface that distinction because the frontend was dropping chain-level context before rendering the selected event. In parallel, the next GDELT Option 3 work item called for second-order-neighbor and alliance/basing evaluation, but the repository still lacked explicit, reviewable experiment scaffolding for those cases.

## Solution

Preserved clausal chain context metadata through the map selection path and added a small presentation helper so the clausal sidebar can explicitly label space weather as thresholded external-driver context rather than local evidence. Separately, added a non-rollout GDELT Phase 2 experiment module with explicit reviewable reference sets and tests for second-order-neighbor and alliance/basing evaluation, while keeping the live linkage classifier unchanged.

## Changes

- `frontend/src/layers/buildClausalChainLayer.ts`
  - Preserved `context_scope` and `space_weather_context` on selected clausal event detail payloads.
- `frontend/src/components/layouts/sidebar-right/clausalContextPresentation.ts`
  - Added a presentation helper that translates clausal space-weather scope metadata into analyst-facing labels.
- `frontend/src/components/layouts/sidebar-right/ClausalView.tsx`
  - Added an External Driver Context panel that shows scope, linkage reason, threshold gate, and whether the signal was admitted or omitted.
- `frontend/src/components/layouts/sidebar-right/clausalContextPresentation.test.ts`
  - Added frontend regressions for both admitted and below-threshold external-driver states.
- `backend/api/services/gdelt_phase2_experiments.py`
  - Added explicit, versioned experimental country sets and helpers for second-order-neighbor, alliance, and basing review.
- `backend/api/tests/test_gdelt_phase2_experiments.py`
  - Added tests for second-order review behavior, explicit alliance/basing reference matching, and proof that live GDELT admission still excludes experiment-only matches.
- `agent_docs/design/2026-04-11-gdelt-phase2-scenario-corpus.md`
  - Added review scenarios for second-order-neighbor candidates and alliance/basing support-node candidates.

## Verification

- `cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test`
  - Passed
- `cd backend/api && uv tool run ruff check . && uv run python -m pytest tests/test_gdelt_linkage.py tests/test_gdelt_phase2_experiments.py`
  - Passed, `12 passed`

## Benefits

- Analysts can now see that clausal space weather is an external driver gated by threshold, not local causal proof.
- The frontend no longer drops backend context metadata needed for that distinction.
- GDELT Phase 2 can now evaluate deeper neighbor and support-country ideas against explicit, auditable references without silently widening the live mission-linkage contract.
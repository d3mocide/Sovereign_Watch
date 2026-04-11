# GDELT Phase 2 Scoring Foundation (2026-04-11)

## Issue

The GDELT Phase 2 Option 3 plan called for a first implementation slice that preserves deterministic admission tiers while adding a secondary score and evidence model for admitted events. Before this change, the shared GDELT linkage service admitted events with `linkage_tier` only, which meant all admitted external events were effectively treated as equally relevant by downstream consumers.

## Solution

Implemented the first Option 3 slice by adding a small scenario corpus and extending the shared GDELT linkage service to attach `linkage_score` and `linkage_evidence` to admitted events only. The hard admission model is unchanged. Mission-aware GDELT route responses now pass these fields through so downstream consumers can inspect or rank linked events without altering the raw/global route behavior.

## Changes

- `backend/api/services/gdelt_linkage.py`
  - Added scoring helpers for admitted GDELT events.
  - Added `linkage_score` and `linkage_evidence` to admitted events in `classify_gdelt_linkage()`.
  - Preserved deterministic admission via `linkage_tier`.
  - Added direct-vs-neighbor mission-country distinction for state-actor scoring using the primary mission country.
- `backend/api/routers/gdelt.py`
  - Added `linkage_score` and `linkage_evidence` to mission-aware event feature properties.
- `backend/api/tests/test_gdelt_linkage.py`
  - Added assertions for score and evidence output.
  - Added regression proving direct mission-country actor matches score above first-order neighbor matches.
- `backend/api/tests/test_gdelt_router.py`
  - Added route-level assertions that mission-aware GDELT event payloads expose the new score and evidence fields.
- `agent_docs/design/2026-04-11-gdelt-phase2-scenario-corpus.md`
  - Added the initial labeled scenario corpus for Phase 2 ranking work.

## Verification

- `cd backend/api && uv tool run ruff check .`
  - Passed
- `cd backend/api && uv run python -m pytest tests/test_gdelt_linkage.py tests/test_gdelt_router.py tests/test_ai_router_evaluate.py tests/test_h3_risk_scope.py`
  - Passed, `17 passed`

## Benefits

- The GDELT model can now express relative strength among admitted events without weakening the existing deterministic trust boundary.
- Mission-aware consumers can inspect the machine-readable reason and score for admitted events instead of treating all linked external events as equivalent.
- The next Phase 2 PR can focus on theater-aware chokepoint refinement rather than first creating the scoring contract from scratch.

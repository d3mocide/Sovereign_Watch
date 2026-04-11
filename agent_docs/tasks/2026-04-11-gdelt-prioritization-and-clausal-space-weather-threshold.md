# GDELT Prioritization And Clausal Space-Weather Threshold (2026-04-11)

## Issue

Mission-aware GDELT linkage had already gained `linkage_score`, but downstream mission consumers still treated linked events too uniformly. At the same time, clausal-chain enrichment continued attaching global space-weather context by time window alone, which kept weak external-driver rows riding along with local chains.

## Solution

Applied the next mission-relevance slice in two parts. First, admitted GDELT events are now ordered by descending `linkage_score`, and mission-mode H3 risk dampens low-relevance external sentiment by score instead of treating all linked events equally. Second, clausal-chain space-weather enrichment now follows the approved Option C model: keep the source explicitly `impact_linked_external`, but only attach space-weather context when it clears the mission threshold (`kp>=5`).

## Changes

- `backend/api/services/gdelt_linkage.py`
  - Sorted admitted linked GDELT events by descending `linkage_score` before returning them to mission-aware consumers.
- `backend/api/routers/ai_router.py`
  - Sorted mission-linked GDELT events before regional evaluation alignment.
  - Added shared Kp threshold helpers so clausal and air routes use the same mission-relevance gate.
  - Changed clausal enrichment to omit below-threshold space-weather rows while preserving explicit external-driver scope metadata.
  - Added threshold metadata to attached clausal space-weather context for frontend explainability.
- `backend/api/routers/h3_risk.py`
  - Applied `linkage_score` as a sentiment-strength multiplier in mission mode so weaker linked events contribute less to H3 risk.
- `backend/api/tests/test_gdelt_linkage.py`
  - Added regression proving admitted events are ordered by descending score.
- `backend/api/tests/test_ai_router_evaluate.py`
  - Added regression proving evaluate passes score-ordered linked GDELT events into alignment.
- `backend/api/tests/test_h3_risk_scope.py`
  - Added regression proving higher linkage scores yield stronger mission-mode GDELT risk contribution.
- `backend/api/tests/test_ai_router_clausal.py`
  - Added threshold metadata assertions for admitted space-weather context.
  - Added regression proving below-threshold clausal space-weather context is omitted.
- `agent_docs/ai_research/4-11-26-gaps.md`
  - Updated the gap tracker to reflect shipped GDELT prioritization and thresholded clausal space-weather behavior.

## Verification

- `cd backend/api && uv tool run ruff check .`
  - Passed
- `cd backend/api && uv run python -m pytest tests/test_gdelt_linkage.py tests/test_gdelt_router.py tests/test_ai_router_evaluate.py tests/test_ai_router_clausal.py tests/test_ai_router_air.py tests/test_h3_risk_scope.py`
  - Passed, `27 passed`

## Benefits

- Mission-aware GDELT consumers now prioritize stronger linked events without weakening the deterministic admission contract.
- H3 risk better reflects relative geopolitical relevance instead of letting every admitted external event contribute equally.
- Clausal enrichment preserves important external-driver space-weather context while dropping weak global noise that analysts could misread as local causal evidence.
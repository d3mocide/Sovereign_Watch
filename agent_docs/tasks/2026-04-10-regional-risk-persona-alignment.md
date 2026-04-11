## Issue
Regional risk evaluation used the unified AI service, but it did not follow the same persona-selection pattern as the main AI Analyst flow. The sequence evaluator hardcoded `osint`, while the right-click workflow itself had no explicit mode in the request. That made the regional risk narrative path more brittle and harder to reason about when compared to the working AI Analyst behavior.

## Solution
Added an explicit `mode` field to regional risk evaluation, defaulted the right-click workflow to `tactical`, and passed that through the same persona selector used elsewhere. Also improved malformed-response logging so provider or formatting failures are easier to diagnose.

## Changes
- Updated backend/api/routers/ai_router.py so `EvaluationRequest` accepts `mode` and forwards it into the sequence evaluation engine.
- Updated backend/api/services/sequence_evaluation_engine.py to use `ai_service.get_persona(mode=..., context=...)` instead of hardcoding `osint`.
- Added richer parse-failure logging in backend/api/services/sequence_evaluation_engine.py that includes a raw response snippet.
- Updated frontend/src/App.tsx so the right-click regional risk workflow sends `mode: "tactical"` explicitly.
- Added regression coverage in backend/api/tests/test_ai_router_evaluate.py to verify mode propagation.
- Updated Documentation/Regional_Risk_Analysis.md to reflect the new request contract.

## Verification
- cd backend/api && uv tool run ruff check routers/ai_router.py services/sequence_evaluation_engine.py tests/test_ai_router_evaluate.py
- cd backend/api && uv run python -m pytest tests/test_ai_router_evaluate.py tests/test_gdelt_linkage.py tests/test_gdelt_router.py tests/test_h3_risk_scope.py
- cd frontend && pnpm run lint
- cd frontend && pnpm run typecheck
- Result: backend targeted lint/tests passed; frontend lint/typecheck passed.

## Benefits
Regional risk now talks to the LLM more like the AI Analyst path that is already working well, while still preserving the structured regional-evaluation contract. That should reduce prompt/format mismatch risk and gives clearer logs when the model returns malformed output.

## Issue
The regional risk overlay could show `Completed` while rendering a failed narrative placeholder such as `Evaluation error`. The immediate cause was that sequence evaluation failures produced a synthetic placeholder narrative, and the frontend treated any 200 response as full success.

## Solution
Stopped the backend from emitting `Evaluation error` as a normal narrative payload, preserved heuristic fallback text in the regional risk router when the LLM path fails, and updated the frontend overlay to distinguish full success from partial success.

## Changes
- Updated backend/api/services/sequence_evaluation_engine.py to log full exceptions and return an empty narrative on LLM evaluation failure instead of the `Evaluation error` placeholder.
- Updated backend/api/services/ai_service.py so static AI generation raises on failure instead of returning a fake `Error: ...` response string.
- Updated backend/api/routers/ai_router.py to preserve the heuristic default narrative when LLM evaluation returns no usable narrative.
- Updated frontend/src/App.tsx so the regional risk overlay shows `Partial` with a warning when mission risk is available but the AI narrative path is unavailable.
- Added regression coverage in backend/api/tests/test_ai_router_evaluate.py for the heuristic narrative fallback path.

## Verification
- cd backend/api && uv tool run ruff check routers/ai_router.py services/ai_service.py services/sequence_evaluation_engine.py tests/test_ai_router_evaluate.py
- cd backend/api && uv run python -m pytest tests/test_ai_router_evaluate.py tests/test_gdelt_linkage.py tests/test_gdelt_router.py tests/test_h3_risk_scope.py
- cd frontend && pnpm run lint
- cd frontend && pnpm run typecheck
- cd frontend && pnpm run test
- Result: backend targeted lint/tests passed; frontend lint/typecheck/tests passed.

## Benefits
Operators now get an honest partial-success state instead of a contradictory success panel, and backend AI failures are surfaced through proper exception logging rather than placeholder narrative text.

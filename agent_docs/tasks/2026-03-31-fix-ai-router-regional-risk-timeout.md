# 2026-03-31 - Fix AI Router Regional Risk Timeout

## Issue
Regional risk analysis requests could appear to stall in the UI ("AI_ROUTER: Evaluating...") with no visible completion when the LLM endpoint was slow or unavailable.

## Solution
Added a strict timeout around the optional LLM narrative step in the AI router evaluate endpoint. If the model call exceeds the timeout, the endpoint now falls back to heuristic scoring and still returns a response promptly.

## Changes
- Updated [backend/api/routers/ai_router.py](backend/api/routers/ai_router.py):
  - Imported asyncio.
  - Added `_LLM_EVAL_TIMEOUT_SECONDS = 8.0` constant.
  - Wrapped `SequenceEvaluationEngine.evaluate_escalation(...)` in `asyncio.wait_for(..., timeout=8.0)`.
  - Added timeout-specific warning log and retained heuristic fallback path.

## Verification
- Ran lint:
  - `cd backend/api && uv tool run ruff check routers/ai_router.py`
  - Result: pass
- Ran tests:
  - `cd backend/api && uv run python -m pytest`
  - Result: 57 passed, 1 failed
  - Existing unrelated failure: `tests/test_tracks_validation.py::test_track_history_hours_exceeded` (expected 400, got 503)
- Restarted runtime service:
  - `docker compose restart sovereign-backend`

## Benefits
- Prevents silent-feeling hangs during regional risk analysis.
- Guarantees timely response to the frontend even when LLM infrastructure is degraded.
- Preserves risk scoring via heuristic fallback when narrative generation times out.

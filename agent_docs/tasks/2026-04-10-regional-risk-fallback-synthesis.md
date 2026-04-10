## Issue
Regional risk fallback output no longer contradicted the evidence, but it still read like a compressed copy of the source indicators. In practice, the panel could show a safe one-line summary of GDELT linkage and conflict signals instead of an operator-useful assessment.

## Solution
Reworked the regional risk fallback path so both the router and evaluator use a shared structured narrative formatter. The fallback now produces analyst-style sections with bottom-line judgment, behavioral interpretation, key signals, and confidence instead of a single extractive sentence.

## Changes
- Rebuilt backend/api/services/sequence_evaluation_engine.py so the evaluator prompt explicitly asks for synthesis rather than raw repetition.
- Added shared heuristic fallback formatting in backend/api/services/sequence_evaluation_engine.py with structured section output and linkage interpretation.
- Updated the evaluator consistency guard to replace empty, contradictory, or unstructured elevated-risk summaries with the new structured fallback.
- Updated backend/api/routers/ai_router.py to use the shared fallback formatter so timeout/failure paths render the same analysis shape.
- Expanded backend/api/tests/test_sequence_evaluation_engine.py with coverage for structured fallback content.
- Updated backend/api/tests/test_ai_router_evaluate.py to assert the new tactical fallback shape.

## Verification
- cd backend/api && uv tool run ruff check .
- cd backend/api && uv run python -m pytest
- Result: backend API lint passed and 104 tests passed.

## Benefits
When the model returns nothing useful, operators still get a sectioned assessment that explains what the signals mean for the region instead of a restatement of the underlying metrics. That makes the regional risk panel more usable during degraded model responses and staging validation.

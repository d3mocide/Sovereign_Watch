## Issue
Regional risk evaluation could still emit weak or contradictory narratives after the transport and persona path were fixed. In hotspot scenarios, the panel could show elevated heuristic signals while the LLM summary still said that no significant escalation was detected.

## Solution
Bound the sequence evaluator to the precomputed heuristic evidence, expanded the prompt with explicit escalation indicators and GDELT linkage notes, and added a post-parse consistency guard that rewrites contradictory low-value summaries into an evidence-backed fallback.

## Changes
- Updated backend/api/services/sequence_evaluation_engine.py so evaluate_escalation accepts heuristic risk score, escalation indicators, and GDELT linkage notes.
- Expanded the evaluator context window to include binding heuristic evidence and direct decision rules for contradiction handling.
- Added a consistency guard in backend/api/services/sequence_evaluation_engine.py that rewrites empty or contradictory narratives when the heuristic signal indicates elevated pressure.
- Added backend/api/tests/test_sequence_evaluation_engine.py to cover prompt construction and the consistency guard.
- Updated backend/api/tests/test_ai_router_evaluate.py to match the new heuristic fallback narrative.

## Verification
- cd backend/api && uv tool run ruff check .
- cd backend/api && uv run python -m pytest
- Result: backend API lint passed and 103 tests passed.

## Benefits
Regional risk summaries now stay aligned with the precomputed evidence that already drives the rest of the assessment. That reduces operator-confusing contradictions and provides a safer fallback when the model returns an empty or low-quality narrative.

# 2026-03-31 - Harden AI Analyst Operational Prompting

## Issue
AI Analyst responses drifted into generic/non-operational interpretations (for example, treating target identifiers as marketing campaign metadata) after clause-related changes.

## Solution
Strengthened backend prompt construction for `/api/analyze/{uid}` by adding explicit domain guardrails and richer telemetry context in the user prompt.

## Changes
- Updated [backend/api/routers/analysis.py](backend/api/routers/analysis.py):
  - Added `_infer_track_domain(uid, track_type)` helper to classify targets as AIR, MARITIME, ORBITAL, INFRASTRUCTURE, OSINT_EVENT, or UNKNOWN.
  - Added `_summarize_waypoints(waypoints)` helper to provide compact recent telemetry evidence.
  - Hardened tactical/system personas to:
    - enforce ISR/ops framing,
    - explicitly reject ad/campaign/user-segment/e-commerce interpretations,
    - require `INSUFFICIENT DATA` when evidence is weak.
  - Expanded tactical user prompt from minimal `uid|label|points` to structured context:
    - mode, inferred domain, track type, history points, recent waypoint sample, correlated intel.
  - Updated sitrep/geopolitical/holding personas to require structured operational sections and evidence-grounded conclusions.

## Verification
- Lint:
  - `cd backend/api && uv tool run ruff check routers/analysis.py`
  - Result: pass
- Tests:
  - `cd backend/api && uv run python -m pytest`
  - Result: 57 passed, 1 failed
  - Existing unrelated failure: `tests/test_tracks_validation.py::test_track_history_hours_exceeded` (expected 400, got 503)
- Runtime reload:
  - `docker compose restart sovereign-backend`

## Benefits
- Reduces generic/off-domain LLM drift.
- Produces more mission-relevant analysis tied to actual telemetry context.
- Improves operator trust by forcing explicit uncertainty when data is thin.

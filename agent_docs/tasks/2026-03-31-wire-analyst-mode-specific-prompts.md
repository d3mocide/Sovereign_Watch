# 2026-03-31 - Wire Analyst Mode-Specific Prompts

## Issue
`/api/analyze/{uid}` accepted `mode` (`tactical`, `osint`, `sar`) but prompt behavior was effectively the same for most targets, producing similar outputs across modes.

## Solution
Wired `AnalyzeRequest.mode` into explicit mode-specific persona/instruction templates so Tactical, OSINT, and SAR runs produce distinct analysis framing and outputs.

## Changes
- Updated [backend/api/routers/analysis.py](backend/api/routers/analysis.py):
  - Normalized and validated mode (`tactical|osint|sar`, fallback to `tactical`).
  - Added `persona_by_mode` map with distinct system+instruction prompts:
    - Tactical: classification/behavior/risk framing
    - OSINT: source context/actor intent/regional impact framing
    - SAR: distress indicators/operational action framing
  - Kept specialized overrides while preserving mode intent:
    - GDELT-specific geopolitical path (except SAR)
    - Holding-pattern tactical override
    - Holding-pattern SAR-specific override
  - Updated prompt payload to include normalized mode value.

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
- Tactical, OSINT, and SAR now have truly distinct analysis behaviors.
- Reduces operator confusion from near-identical outputs across modes.
- Improves mission relevance by aligning response structure with selected workflow intent.

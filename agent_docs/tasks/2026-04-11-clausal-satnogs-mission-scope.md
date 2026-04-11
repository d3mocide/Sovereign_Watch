# Clausal SatNOGS Mission Scope (2026-04-11)

## Issue

The clausal-chain enrichment endpoint still attached global SatNOGS signal-loss events to mission-scoped chains. Regional risk and orbital analysis had already been fixed to gate SatNOGS by propagated satellite subpoint, but `/api/ai_router/clausal-chains` still queried the raw global feed and labeled it as pending work.

## Solution

Reused the existing orbital subpoint filtering approach inside the clausal-chain path so SatNOGS events are admitted only when the propagated satellite subpoint intersects the active mission area. The helper was widened to support both H3 cell scoping and radius-based mission queries, since the clausal endpoint supports both spatial modes.

## Changes

- `backend/api/routers/ai_router.py`
  - Generalized `_fetch_aot_relevant_satnogs_events()` to support H3 and radius mission contexts.
  - Updated `get_clausal_chains()` to use mission-scoped SatNOGS filtering in both H3 and radius mode.
  - Added scope/linkage metadata and propagated subpoint coordinates to `satnogs_context`.
- `backend/api/tests/test_ai_router_clausal.py`
  - Updated the H3 regression to verify mission-area SatNOGS scoping.
  - Added a radius-mode regression that proves only the in-radius propagated subpoint is retained.
- `agent_docs/ai_research/4-11-26-gaps.md`
  - Removed the now-closed SatNOGS gating item and refreshed the recommended next actions list.

## Verification

- `cd backend/api && uv tool run ruff check .`
  - Passed
- `cd backend/api && uv run python -m pytest`
  - Passed, `107 passed`

## Benefits

- Clausal-chain context now matches the mission-scoping rules already used by orbital analysis and regional risk.
- Radius-based mission views no longer leak unrelated global SatNOGS signal-loss events into local chain interpretation.
- The backlog doc now points at the remaining real work: GDELT refinement plus geography-aware clausal enrichment for outages and space weather.

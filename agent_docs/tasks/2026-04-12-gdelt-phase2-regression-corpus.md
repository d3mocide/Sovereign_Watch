# GDELT Phase 2A — Labeled Regression Corpus

## Issue

GDELT Phase 2 added event-level relevance scoring (`linkage_score` + `linkage_evidence`) to the linkage service. Phases 2B (scoring helpers), 2C (theater-aware chokepoints), and 2D (score/evidence surfaced to all route consumers) were implemented during prior sessions. The Phase 2A deliverable — a formal 5-scenario regression corpus — was not yet committed, leaving the scoring contract unanchored.

Without this corpus, score tuning looks plausible but remains ungrounded. Any future change to `_score_linked_event()` could silently shift ordering without a failing test.

## Solution

Created `backend/api/tests/test_gdelt_linkage_phase2.py` with five labeled scenarios from the GDELT Phase 2 design plan. Each test documents the intent of the scoring model and proves that score ordering is correct without altering admission decisions. Hard admission tiers remain deterministic.

## Changes

### `backend/api/tests/test_gdelt_linkage_phase2.py` (new)

Five labeled scenarios:

| # | Name | Key assertion |
|---|------|---------------|
| 1 | `test_scenario1_in_aot_conflict_is_admitted_with_maximum_score` | `in_aot` tier → score = 1.0 |
| 2 | `test_scenario2_neighbor_spillover_admitted_but_ranked_below_in_aot` | `state_actor` admitted, ordered after in-AOT; score = 0.80 |
| 3 | `test_scenario3_cable_event_ranks_above_weak_neighbor_noise` | `cable_infra` (0.85) > weak `state_actor` (0.65) |
| 4 | `test_scenario4_theater_aligned_chokepoint_scores_above_non_aligned` | Aligned chokepoint = 0.85; non-aligned = 0.65; both admitted |
| 5 | `test_scenario5_event_with_no_hard_gate_match_is_excluded` | Events with no tier match → `admitted == []` |

### Phases already implemented (no new changes required)

- **Phase 2B** — `_score_linked_event()` in `services/gdelt_linkage.py` attaches `linkage_score` and `linkage_evidence` to every admitted event.
- **Phase 2C** — `_mission_theaters_for_country_code()` + theater comparison in `_score_linked_event()` raises chokepoint score from 0.55→0.75 on theater match.
- **Phase 2D** — `routers/gdelt.py` exposes `linkage_score`/`linkage_evidence` in GeoJSON properties; `routers/h3_risk.py` uses `linkage_score` as a Goldstein sentiment multiplier; `routers/ai_router.py` uses `_sort_gdelt_events_by_linkage_score()` before prompt construction.

## Verification

```bash
cd backend/api && uv tool run ruff check .
cd backend/api && uv run python -m pytest tests/test_gdelt_linkage.py tests/test_gdelt_linkage_phase2.py tests/test_gdelt_router.py tests/test_ai_router_evaluate.py tests/test_h3_risk_scope.py -v
```

Result: **27/27 passed**, ruff clean.

## Benefits

- Locks in the scoring contract — future changes to `_score_linked_event()` that silently shift ordering will now fail a clearly labeled test.
- Completes the full GDELT Phase 2 deliverable as specified in `agent_docs/design/2026-04-11-gdelt-phase2-option3-implementation-plan.md`.
- Each scenario is traceable to the plan's named requirements (Phase 2A Deliverables).

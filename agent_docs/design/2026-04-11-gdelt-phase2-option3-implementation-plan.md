# GDELT Phase 2 Option 3 Implementation Plan (2026-04-11)

## Goal

Implement GDELT Phase 2 using the Option 3 model:
- keep deterministic admission tiers as the hard gate,
- add a secondary relevance score only for admitted events,
- and improve prioritization without weakening analyst auditability.

This plan assumes the current Phase 1 service in [backend/api/services/gdelt_linkage.py](c:/Projects/Sovereign_Watch/backend/api/services/gdelt_linkage.py) remains the trust boundary.

## Non-Goals

This plan does not do the following in the first pass:
- replace deterministic admission with score-based admission,
- add alliance or basing linkage without explicit reference data,
- switch country detection to PostGIS boundaries,
- or add second-order neighbors globally without scenario review.

## Desired Outcome

After this work:
- analysts still see why a GDELT event was admitted,
- admitted events are no longer treated as equally relevant,
- H3 mission risk and analyst narratives can prioritize stronger linked events,
- and the model remains testable and explainable.

## Proposed Contract

Every admitted event keeps:
- `linkage_tier`: deterministic admission reason.

Every admitted event gains:
- `linkage_score`: normalized strength in the range `[0.0, 1.0]`.
- `linkage_evidence`: machine-readable evidence fields.

Suggested `linkage_evidence` shape:
```json
{
  "matched_country_codes": ["UKR", "RUS"],
  "neighbor_depth": 0,
  "matched_cable_country_codes": ["GBR"],
  "matched_chokepoint": "Strait of Hormuz",
  "matched_theater": "EUCOM"
}
```

The field is sparse. Only relevant keys are included.

## Initial Scoring Model

Use score for ranking and weighting only, not admission.

Baseline suggested weights:
- `in_aot`: `1.00`
- `state_actor` direct mission-country match: `0.85`
- `state_actor` first-order neighbor match: `0.65`
- `cable_infra`: `0.70`
- `chokepoint` with theater match: `0.75`
- `chokepoint` without theater match: `0.55`

Optional modifiers within admitted events:
- `quad_class == 4`: `+0.10`, clamp at `1.0`
- `goldstein <= -5`: `+0.05`
- very weak verbal/conflict tone should not override tier, only slightly adjust rank

Reasoning:
- the score should express relative strength among already-admitted events,
- not quietly create a second hidden gate.

## Phase Plan

### Phase 2A

Build the regression corpus first.

#### Deliverables
- `backend/api/tests/test_gdelt_linkage_phase2.py` or extend [backend/api/tests/test_gdelt_linkage.py](c:/Projects/Sovereign_Watch/backend/api/tests/test_gdelt_linkage.py)
- `agent_docs/design/` or `agent_docs/tasks/` scenario note with 3 to 5 labeled mission examples

#### Required scenarios
1. Direct in-AOT conflict.
2. Neighbor-country spillover that should be admitted but ranked below in-AOT.
3. Cable-linked external event that should be admitted and ranked above unrelated state-only noise.
4. Chokepoint event that should be admitted only when theater-aligned.
5. External event that passes no hard gate and must remain excluded.

#### Why first
Without this corpus, score tuning will look plausible but remain ungrounded.

### Phase 2B

Add event-level scoring and evidence to the shared service.

#### Files
- [backend/api/services/gdelt_linkage.py](c:/Projects/Sovereign_Watch/backend/api/services/gdelt_linkage.py)
- [backend/api/tests/test_gdelt_linkage.py](c:/Projects/Sovereign_Watch/backend/api/tests/test_gdelt_linkage.py)

#### Work
- Add a small helper such as `_score_admitted_event()`.
- Extend `classify_gdelt_linkage()` so it also attaches:
  - `linkage_score`
  - `linkage_evidence`
- Preserve `linkage_tier` exactly as today.
- Keep the return shape compatible for current callers that only inspect `linkage_tier` and counts.

#### Acceptance criteria
- Existing Phase 1 tests continue to pass.
- New tests prove score ordering without changing admission decisions.

### Phase 2C

Add theater-aware chokepoint refinement.

#### Files
- [backend/api/services/gdelt_linkage.py](c:/Projects/Sovereign_Watch/backend/api/services/gdelt_linkage.py)
- optionally [backend/api/routers/gdelt_country_codes.py](c:/Projects/Sovereign_Watch/backend/api/routers/gdelt_country_codes.py) if theater tags live better there

#### Work
- Extend `_STRATEGIC_CHOKEPOINTS` entries with theater tags.
- Derive a mission theater tag from the mission country or a static country-to-theater map.
- Do not hard-exclude choke-point events solely on theater mismatch in the first pass.
- Instead, use theater match to raise or lower `linkage_score` and populate `linkage_evidence.matched_theater`.

#### Acceptance criteria
- A theater-aligned chokepoint event ranks above a non-aligned chokepoint event when both are admitted.
- Existing admission remains deterministic and explainable.

### Phase 2D

Surface score and evidence to callers without changing default raw/global GDELT behavior.

#### Files
- [backend/api/routers/ai_router.py](c:/Projects/Sovereign_Watch/backend/api/routers/ai_router.py)
- [backend/api/routers/gdelt.py](c:/Projects/Sovereign_Watch/backend/api/routers/gdelt.py)
- [backend/api/routers/h3_risk.py](c:/Projects/Sovereign_Watch/backend/api/routers/h3_risk.py)
- tests in:
  - [backend/api/tests/test_ai_router_evaluate.py](c:/Projects/Sovereign_Watch/backend/api/tests/test_ai_router_evaluate.py)
  - [backend/api/tests/test_gdelt_router.py](c:/Projects/Sovereign_Watch/backend/api/tests/test_gdelt_router.py)
  - [backend/api/tests/test_h3_risk_scope.py](c:/Projects/Sovereign_Watch/backend/api/tests/test_h3_risk_scope.py)

#### Work
- Ensure mission-aware GDELT route responses include `linkage_score` and optional evidence fields.
- Keep source-scope metadata readable; do not replace tier counts with opaque score summaries.
- In H3 risk, consider using `linkage_score` as a multiplier for admitted GDELT sentiment contribution.
- In `evaluate`, consider sorting admitted GDELT events by descending `linkage_score` before prompt construction.

#### Acceptance criteria
- Global/raw GDELT endpoints remain unchanged when mission mode is omitted.
- Mission-aware routes expose score and evidence.
- H3 risk and evaluate remain stable and understandable.

### Phase 2E

Evaluate second-order neighbors behind the corpus, not by default.

#### Work
- Add an opt-in experimental path in tests or config only.
- Compare false-positive and false-negative deltas against the scenario set.
- Only promote if the gain is clear.

#### Acceptance criteria
- No rollout of second-order neighbors without explicit review of the scenario outcomes.

## Suggested Implementation Order For Next PR

1. Add the scenario corpus.
2. Add `linkage_score` and `linkage_evidence` to admitted events.
3. Add theater-aware chokepoint scoring.
4. Expose the new fields to mission-aware GDELT route consumers.
5. Leave alliance/basing and second-order neighbors out of the first Phase 2 PR.

## Risks

- Score drift: different routes may start interpreting `linkage_score` differently.
- Hidden gating: developers may begin treating low scores as exclusion without updating the contract.
- Analyst confusion: if UI surfaces score without reason/evidence, trust will drop.
- Overfitting: a tiny scenario corpus can help, but it must not be treated as statistical validation.

## Guardrails

- Hard admission remains deterministic.
- Score never replaces tier in logs, route output, or docs.
- Evidence fields must explain score components in machine-readable form.
- Any new data source such as alliance or basing references must be explicit, versioned, and reviewable.

## Verification Plan

Targeted backend verification after implementation:
- `cd backend/api && uv tool run ruff check .`
- `cd backend/api && uv run python -m pytest tests/test_gdelt_linkage.py tests/test_gdelt_router.py tests/test_ai_router_evaluate.py tests/test_h3_risk_scope.py`

If the implementation changes prompt ordering or risk weighting materially, run the full backend API suite as well.

## Recommendation

Use this plan as the next GDELT PR blueprint.

It is intentionally narrow:
- improve prioritization,
- preserve explainability,
- avoid a score-first rewrite,
- and keep the current analyst trust boundary intact.

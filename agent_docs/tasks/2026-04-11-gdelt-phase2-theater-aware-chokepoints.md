# GDELT Phase 2 Theater-Aware Chokepoints (2026-04-11)

## Issue

The first GDELT Phase 2 scoring slice established `linkage_score` and `linkage_evidence`, but chokepoint-linked events still scored the same regardless of whether the chokepoint was strategically aligned with the mission theater. That flattened ranking quality for globally important chokepoints such as Hormuz, Suez, Bab el-Mandeb, and Malacca.

## Solution

Implemented the next Option 3 slice by adding theater metadata to the strategic chokepoint catalog and deriving a coarse mission theater from the primary mission country. Chokepoint-linked events remain deterministically admitted through the existing `chokepoint` tier, but theater-aligned chokepoints now receive a higher secondary score and expose the theater match in machine-readable evidence.

## Changes

- `backend/api/services/gdelt_linkage.py`
  - Added theater tags to the strategic chokepoint definitions.
  - Added `_mission_theaters_for_country_code()` to derive a coarse mission theater set from the primary mission country.
  - Updated chokepoint matching to retain the full chokepoint metadata.
  - Boosted `linkage_score` for theater-aligned chokepoint events while preserving deterministic `linkage_tier` admission.
  - Added `matched_theater`, `chokepoint_theaters`, and `linkage_chokepoint_theaters` metadata for downstream explainability.
- `backend/api/tests/test_gdelt_linkage.py`
  - Added a regression proving theater-aligned chokepoints score above non-aligned chokepoints.
  - Updated the existing chokepoint evidence assertion to include theater metadata.

## Verification

- `cd backend/api && uv tool run ruff check .`
  - Passed
- `cd backend/api && uv run python -m pytest tests/test_gdelt_linkage.py tests/test_gdelt_router.py tests/test_ai_router_evaluate.py tests/test_h3_risk_scope.py`
  - Passed, `18 passed`

## Benefits

- Mission-aware GDELT ranking now distinguishes between generic chokepoint relevance and chokepoints that are actually aligned with the mission theater.
- Downstream consumers retain the deterministic admission contract while gaining stronger explainability for why one chokepoint-linked event outranks another.
- The next GDELT Phase 2 slice can build on a more realistic chokepoint model without revisiting route contracts or linkage-tier semantics.
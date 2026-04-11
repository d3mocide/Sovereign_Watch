# GDELT Review Support Relation Gate (2026-04-11)

## Issue

The new `/test` GDELT linkage review surface exposed a problem in the review-only experimental widening logic: alliance-support matches were being admitted whenever an event actor country appeared in the explicit support-country set, even if the event had no visible relation to the mission itself. For missions such as `ARE`, that caused generic `USA`-coded events to dominate the experimental-only sample and inflated the apparent blast radius.

## Solution

Narrowed the review-only alliance and basing candidate logic so support-country matches now require mission relation evidence. Experimental support candidates still remain outside the live trust boundary, but they must now show either a mission/first-order-neighbor actor relation or an explicit mission-country mention in the headline before they are counted as support-linked review candidates.

## Changes

- `backend/api/services/gdelt_phase2_experiments.py`
  - Added headline normalization and mission-country alias helpers for review-only matching.
  - Added a support-relation gate that checks for mission/neighbor actor linkage or explicit mission-country mention in the headline.
  - Kept second-order-neighbor review behavior unchanged.
  - Preserved the non-rollout contract: these rules only affect `/api/gdelt/linkage-review`, not live admission.
- `backend/api/tests/test_gdelt_phase2_experiments.py`
  - Updated alliance and basing tests to include mission relation evidence.
  - Added a regression proving support-country events are rejected when they lack mission relation context.

## Verification

- `cd backend/api && uv tool run ruff check services/gdelt_phase2_experiments.py tests/test_gdelt_phase2_experiments.py tests/test_gdelt_router.py`
  - Passed
- `cd backend/api && uv run python -m pytest tests/test_gdelt_phase2_experiments.py tests/test_gdelt_router.py`
  - Passed, `11 passed`

## Benefits

- The `/test` review surface now reports a more defensible experimental blast radius for support-country ideas.
- Generic great-power headlines are less likely to be misread as mission-relevant alliance support.
- The experimental review path remains useful for real support-link scenarios without pressuring the live linkage model to widen prematurely.
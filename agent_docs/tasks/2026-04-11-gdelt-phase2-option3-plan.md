# GDELT Phase 2 Option 3 Plan (2026-04-11)

## Issue

The new GDELT Phase 2 decision memo established that the best path is Option 3: preserve deterministic admission tiers and add weighting only among admitted events. A concrete implementation plan was still missing, so the next PR would otherwise need to re-decide sequencing, field contracts, and test scope.

## Solution

Created a dedicated implementation plan focused on the hybrid Option 3 model. The plan defines the target field contract, an initial scoring model, phase boundaries, integration points, risks, and verification steps.

## Changes

- Added `agent_docs/design/2026-04-11-gdelt-phase2-option3-implementation-plan.md`
  - Defines `linkage_score` and `linkage_evidence` as secondary fields on admitted events.
  - Keeps `linkage_tier` as the hard admission reason.
  - Breaks implementation into phases: scenario corpus, scoring, theater-aware chokepoints, route integration, and optional second-order-neighbor evaluation.
  - Lists concrete backend files and tests affected by each phase.

## Verification

- Documentation-only task.
- No code verification suite required.

## Benefits

- The next GDELT PR now has a clear blueprint instead of a high-level recommendation only.
- The plan protects analyst trust by explicitly forbidding a score-first rewrite.
- Backend work can now proceed in narrow, reviewable steps with clear acceptance criteria.

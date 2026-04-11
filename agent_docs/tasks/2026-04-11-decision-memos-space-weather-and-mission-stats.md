# Decision Memos: Clausal Space Weather and Mission Stats (2026-04-11)

## Issue

Two remaining backlog items required product and architecture decisions before more code work could be done:
- Whether clausal-chain space-weather enrichment should remain explicitly global-as-driver or become mission-filtered.
- Whether mission-scoped stats should live in a separate namespace or be folded into the existing global stats dashboard.

## Solution

Produced two design memos grounded in the live backend and frontend implementation. Each memo documents the current state, viable options, pros, cons, impact on the analyst system, and a recommended path.

## Changes

- Added `agent_docs/design/2026-04-11-clausal-space-weather-scope-decision-memo.md`
  - Compared global-driver, geography-aware, and hybrid thresholded models for clausal space-weather enrichment.
  - Recommended the hybrid thresholded model for the current platform maturity.
- Added `agent_docs/design/2026-04-11-mission-stats-namespace-decision-memo.md`
  - Compared separate namespace, filtered existing endpoints, and hybrid mission-only analyst metrics.
  - Recommended keeping `/stats` global and creating a narrow mission-stats layer only for metrics that are analytically meaningful.

## Verification

- Documentation-only task.
- No code verification suite required.

## Benefits

- The remaining backlog is now gated by explicit decisions instead of vague future work.
- Analysts and operators can be considered separately, which reduces the risk of building semantically confusing telemetry surfaces.
- Follow-on implementation work can now be scoped with a clearer contract for both backend and frontend changes.

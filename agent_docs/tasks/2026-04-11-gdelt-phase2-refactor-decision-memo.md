# GDELT Phase 2 Refactor Decision Memo (2026-04-11)

## Issue

The repository already contained a GDELT mission-linkage research note and multiple implementation task logs, but there was no single decision memo in the same format as the new clausal space-weather and mission-stats memos. That left the next GDELT refactor direction implicit rather than clearly framed as a product and architecture choice.

## Solution

Created a dedicated design memo that captures the current Phase 1 state, the remaining Phase 2 gaps, the viable refactor options, the pros and cons of each, and the expected effect on the analyst system.

## Changes

- Added `agent_docs/design/2026-04-11-gdelt-phase2-refactor-decision-memo.md`
  - Documents the current shared linkage service and where it affects analyst outputs.
  - Compares three refactor paths:
    - deterministic tier expansion,
    - full weighted admission scoring,
    - and a hybrid model with deterministic admission plus post-admission weighting.
  - Recommends the hybrid model as the best fit for current platform maturity.

## Verification

- Documentation-only task.
- No code verification suite required.

## Benefits

- The remaining GDELT work is now framed as an explicit decision with concrete tradeoffs instead of a vague Phase 2 label.
- Future implementation can preserve analyst trust by keeping admission auditable while still improving relevance ranking.
- The memo gives a practical next-PR order so the refactor can be staged instead of attempted as a single large rewrite.

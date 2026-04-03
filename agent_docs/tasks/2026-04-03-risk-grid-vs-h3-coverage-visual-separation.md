# 2026-04-03 Risk Grid vs H3 Coverage Visual Separation

## Issue
Risk Grid zoom/resolution tuning appeared ineffective because a separate H3 poller coverage mesh layer was simultaneously visible. The spoke-like fine hexes from coverage masked Risk Grid behavior and created control confusion.

## Solution
Initial hypothesis was to separate visual behavior by suppressing H3 coverage while Risk Grid was enabled. After operator validation confirmed the observed cells were Risk Grid (not debug mesh), the suppression logic was rolled back.

## Changes
- `frontend/src/layers/composition.ts`
  - Added (then reverted) conditional suppression of H3 coverage while Risk Grid is enabled.
  - Final state restored original behavior:
    - `buildH3CoverageLayer(h3Cells, !!filters?.showH3Coverage)`

- `frontend/src/components/widgets/SystemSettingsWidget.tsx`
  - Label clarification change was not retained.

## Verification
- `cd frontend && pnpm run lint && pnpm run test`
- Result: pass (`36` tests passed)

## Benefits
- Captures and preserves a corrected diagnosis in change history.
- Restores expected independent control behavior for coverage mesh and Risk Grid.

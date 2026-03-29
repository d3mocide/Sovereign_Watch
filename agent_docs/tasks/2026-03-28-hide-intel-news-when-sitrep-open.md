# 2026-03-28 - Hide Intel News Widget When SITREP Panel Is Open

## Issue
In Intel map view, opening the SITREP analyst window still left the News widget visible in the right sidebar, causing visual overlap/competition and reducing focus on the active SITREP workflow.

## Solution
Conditionally hide the Intel News widget while the AI analyst panel is open for a SITREP entity.

## Changes
- Updated `frontend/src/App.tsx`:
  - Tightened the Intel right-sidebar render condition for `NewsWidget`.
  - `NewsWidget` now renders only when:
    - `viewMode === "INTEL"`
    - and NOT `(isAIAnalystOpen && selectedEntity?.type === "sitrep")`

## Verification
- Ran targeted frontend verification:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run test`
- Result: pass (`2` test files, `36` tests, `0` failures).

## Benefits
- Keeps operator attention on SITREP analysis when the window is active.
- Prevents right-sidebar crowding during SITREP generation/review.
- Maintains existing Intel News behavior in non-SITREP contexts.

## Issue
The accessibility PR for `MapControls` fell behind the `dev` base branch and could not merge cleanly because it still carried a `.jules/palette.md` task artifact that had been removed from `dev`.

## Solution
Merged the latest `dev` branch into the PR branch, accepted the upstream removal of the stale `.jules/palette.md` file, and preserved the accessibility updates now present on both sides of the merge.

## Changes
- Removed `.jules/palette.md` while resolving the merge conflict so the branch matches the current `dev` tree.
- Kept the `MapControls` toggle-button ARIA updates in `frontend/src/components/map/MapControls.tsx`.
- Accepted the incoming `frontend/src/components/widgets/AnalysisWidget.tsx` accessibility label addition from `dev`.

## Verification
- `cd frontend && corepack pnpm@9.15.9 run lint`
- `cd frontend && corepack pnpm@9.15.9 run typecheck`
- `cd frontend && corepack pnpm@9.15.9 run test`

## Benefits
- Restores mergeability of the stacked PR against `dev`.
- Prevents a deleted generated artifact from re-entering the branch history.
- Preserves the intended accessibility improvements during the merge.

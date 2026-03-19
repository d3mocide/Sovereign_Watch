# 2026-03-16-fix-dashboard-useeffect-dependency.md

## Issue
React Hook `useEffect` in `DashboardView.tsx` has a missing dependency: `mission`.
The linter warns that `mission` should be included in the dependency array or the array should be removed.

## Solution
Update the `useEffect` dependency array to include `mission` to satisfy the linter's exhaustive-deps rule.

## Changes
- Modified `DashboardView.tsx` to include `mission` in the `useEffect` dependency array for fetching RF EmComm sites.

## Verification
- Run `npm run lint` in `frontend` directory.

## Benefits
- Resolves linting warning.
- Ensures the effect re-runs correctly if the mission object changes.

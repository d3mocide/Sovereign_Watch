# 2026-03-28 - Tactical GDELT Reader Alignment

## Issue
The GDELT `VIEW_SOURCE` action in Tactical view still opened a new browser window because the in-app article reader logic had only been wired for Intel view.

## Solution
Extend the shared in-app reader flow to Tactical view so GDELT source actions behave consistently across both Tactical and Intel map states.

## Changes
- Updated `frontend/src/App.tsx`:
  - Preserved article-reader state while in either `INTEL` or `TACTICAL` view.
  - Added shared `articleViewerOverlay` render block.
  - Rendered the overlay in Tactical and Intel branches.
  - Broadened `SidebarRight.onOpenSource` handling from Intel-only to Tactical + Intel.
- Existing `SidebarRight` and `GdeltView` callback plumbing now activates in Tactical as well, instead of falling back to external navigation.

## Verification
- Ran targeted frontend verification:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run test`
- Result: pass (`2` test files, `36` tests, `0` failures).

## Benefits
- Consistent source-review workflow across Tactical and Intel map views.
- Keeps operators inside the application during GDELT article triage.
- Reduces context switching caused by unwanted external windows.

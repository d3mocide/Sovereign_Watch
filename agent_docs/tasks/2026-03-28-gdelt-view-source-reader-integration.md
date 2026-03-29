# 2026-03-28 - GDELT View Source Reader Integration

## Issue
The GDELT SidebarRight `VIEW_SOURCE` action opened publisher pages in a new tab, creating a workflow split from the Intel in-app article reader behavior.

## Solution
Wire GDELT `VIEW_SOURCE` to the same Intel reader flow used by News widget article clicks, while preserving external-link fallback behavior when callback wiring is not present.

## Changes
- Updated `frontend/src/components/layouts/sidebar-right/types.ts`:
  - Added `SourceOpenPayload`.
  - Added optional `onOpenSource` callback to `BaseViewProps`.
- Updated `frontend/src/components/layouts/SidebarRight.tsx`:
  - Added optional `onOpenSource` prop.
  - Threaded callback into shared `baseProps` so domain views can invoke source-open actions.
- Updated `frontend/src/components/layouts/sidebar-right/GdeltView.tsx`:
  - Added `onOpenSource` support.
  - Changed `VIEW_SOURCE` behavior:
    - If callback exists: uses a button that opens in-app reader payload (`url`, `title`, `source`, `pubDate`).
    - If callback absent: falls back to original external anchor behavior.
- Updated `frontend/src/App.tsx`:
  - Passed Intel-scoped `onOpenSource` handler into `SidebarRight`.
  - Handler maps GDELT payloads into existing `activeIntelArticle` state used by the article reader overlay.

## Verification
- Backend API checks:
  - `cd backend/api && python -m ruff check .`
  - `cd backend/api && python -m pytest`
  - Result: pass (`46` tests, `0` failures).
- Frontend checks:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run test`
  - Result: pass (`2` test files, `36` tests, `0` failures).

## Benefits
- Consistent analyst workflow for both RSS and GDELT source review.
- Keeps source triage inside Intel map context.
- Maintains graceful fallback behavior outside Intel wiring contexts.

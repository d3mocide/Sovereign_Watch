# 2026-03-28 - Intel In-App News Article Viewer

## Issue
News links in Intel view opened only in a separate browser tab, forcing context switching away from the tactical map when reviewing OSINT articles.

## Solution
Add an Intel in-app article window that opens when an item is clicked from the News widget, while retaining an external-open fallback for publishers that block iframe embedding.

## Changes
- Updated `frontend/src/components/widgets/NewsWidget.tsx`:
  - Added optional prop `onOpenArticle?: (article: NewsItem) => void`.
  - Added click interception for news item links (compact and full modes):
    - If `onOpenArticle` is provided, prevent default navigation and invoke callback.
    - If not provided, keep existing external-link behavior.
- Updated `frontend/src/App.tsx`:
  - Added Intel article viewer state: `activeIntelArticle`.
  - Wired Intel sidebar `NewsWidget` to open in-app via `onOpenArticle` callback.
  - Added Intel-only floating article viewer overlay with:
    - Header metadata (source + title)
    - External-open button
    - Close button
    - Embedded `iframe` content area
    - Inline note about publisher embed restrictions
  - Added cleanup effect to close article window when leaving Intel view.

## Verification
- Ran targeted frontend verification:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run test`
- Result: pass (`2` test files, `36` tests, `0` failures).

## Benefits
- Keeps analyst workflow inside Intel map view during article triage.
- Reduces context-switch friction while preserving fallback external access.
- Supports progressive enhancement without changing Dashboard behavior.

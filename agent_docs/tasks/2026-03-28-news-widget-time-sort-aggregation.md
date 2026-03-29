# 2026-03-28 - News Widget Time-Only Sorting for Aggregation

## Issue
The News widget feed ordering could cluster items by source ordering from upstream data, reducing cross-domain signal mixing in the visible stream.

## Solution
Apply a client-side sort by publication timestamp only (newest-first), so feed ordering is recency-driven and source-agnostic.

## Changes
- Updated `frontend/src/components/widgets/NewsWidget.tsx`:
  - In `fetchNews`, added a `sortedByTime` array derived from response data.
  - Sorting now uses `Date.parse(pub_date)` descending.
  - Widget state now stores `sortedByTime` instead of raw API order.

## Verification
- Ran targeted frontend verification:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run test`
- Result: pass (`2` test files, `36` tests, `0` failures).

## Benefits
- Produces a true aggregate stream where stories interleave across publishers.
- Improves operational visibility by prioritizing recency over source grouping.
- Preserves existing refresh cadence and widget behavior with minimal code impact.

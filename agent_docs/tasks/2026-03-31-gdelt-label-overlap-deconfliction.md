# 2026-03-31 - GDELT Label Overlap Deconfliction

## Issue
GDELT labels still overlapped heavily in dense regions, causing unreadable text stacks even after switching to class-based labels.

## Solution
Implemented spatial label deconfliction in the GDELT map layer:

- Group nearby events into geographic buckets.
- Rank events in each bucket by significance.
- Render only a limited number of labels per bucket with vertical stacking offsets.
- Collapse hidden labels into a `+N` suffix on the primary label.

## Changes
- Updated `frontend/src/layers/buildGdeltLayer.ts`:
  - Added `GdeltLabelDatum` shape for label metadata.
  - Added deconfliction constants:
    - `LABEL_BUCKET_DEGREES = 0.35`
    - `MAX_LABELS_PER_BUCKET = 2`
  - Added per-bucket priority sort using `abs(goldstein)` and `num_mentions`.
  - Added stacked label offsets with `getPixelOffset`.
  - Added hidden-count summary (`LABEL +N`) on primary labels.

## Verification
- Frontend lint:
  - `cd frontend && pnpm run lint`
  - Result: pass
- Frontend tests:
  - `cd frontend && pnpm run test`
  - Result: pass (36 tests)

## Benefits
- Prevents dense clusters from rendering unreadable text overlays.
- Preserves high-signal labels while still indicating suppressed nearby events.
- Keeps map legibility high without dropping GDELT markers themselves.

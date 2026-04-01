# 2026-03-31 - Use GDELT Event Class Labels on Map

## Issue
GDELT map labels rendered source domains/URLs, which produced noisy overlays and reduced readability in dense regions.

## Solution
Updated GDELT label text selection to prefer semantic event class (`quad_class`) labels and fall back to source domain only when class metadata is unavailable.

## Changes
- Updated `frontend/src/layers/buildGdeltLayer.ts`:
  - Added `gdeltQuadClassLabel()` helper for `quad_class` mapping:
    - `1` → `VERBAL COOP`
    - `2` → `MATERIAL COOP`
    - `3` → `VERBAL CONFLICT`
    - `4` → `MATERIAL CONFLICT`
  - Text labels now use class label first, domain fallback second.
  - Label filtering now allows either a valid class label or readable domain.

## Verification
- Frontend lint:
  - `cd frontend && pnpm run lint`
  - Result: pass
- Frontend tests:
  - `cd frontend && pnpm run test`
  - Result: pass (36 tests)

## Benefits
- Improves map readability and reduces clutter from long/overlapping URL labels.
- Surfaces more useful tactical context directly on the map.
- Preserves fallback behavior for records lacking class metadata.

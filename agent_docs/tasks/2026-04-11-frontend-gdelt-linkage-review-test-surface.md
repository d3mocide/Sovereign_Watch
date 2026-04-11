# Frontend GDELT Linkage Review Test Surface (2026-04-11)

## Issue

The backend had a mission-scoped GDELT linkage review endpoint for comparing the live admitted linkage set against experimental widening candidates, but there was no frontend surface to visualize that comparison. Reviewing the raw JSON made it harder to understand overlap, live-only coverage, and the potential blast radius of second-order or support-country rules.

## Solution

Added a new frontend `/test` route that acts as a dedicated GDELT linkage review surface. It lets an admin run either an H3 mission query or a radius mission query, then visualizes the live linkage set, the experimental candidate set, and the overlap/delta counts side by side.

## Changes

- `frontend/src/api/gdeltLinkageReview.ts`
  - Added the typed client for `/api/gdelt/linkage-review`.
- `frontend/src/components/views/GdeltLinkageReviewView.tsx`
  - Added the new review page with mission controls, summary cards, country-set review blocks, and side-by-side event samples.
- `frontend/src/App.tsx`
  - Added the authenticated `/test` route entry point and lazy-loaded review page.

## Verification

- `cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test`
  - Passed

## Benefits

- Operators can now see exactly what the experimental GDELT rules would add before changing the live trust boundary.
- The overlap, live-only, and experimental-only counts make blast-radius review fast and defensible.
- Query state is reflected in the URL, so review runs can be shared and repeated.
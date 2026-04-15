## Issue

The FIRMS hotspot map indicator rendered as a single oversized scatter circle, which made thermal detections look like generic placeholder blobs instead of deliberate sensor hits. On the flat map this was especially noticeable because the large meter-scaled radius overwhelmed nearby context.

## Solution

Reworked the FIRMS hotspot visualization into a layered thermal beacon made of a restrained heat bloom, a pulsing alert ring, and a compact bright core. This keeps the marker visible and readable without turning each hotspot into a giant painted disk.

## Changes

- Updated `frontend/src/layers/buildFIRMSLayer.ts`
  - Replaced the single `ScatterplotLayer` with three coordinated layers.
  - Added a soft thermal bloom using a smaller meter-based radius.
  - Added a pulsing pixel-based alert ring for motion and detection emphasis.
  - Added a tight core marker for precise visual anchoring and picking.
  - Kept FIRMS confidence/day-night color encoding, but applied it across the layered beacon.
- Updated `frontend/src/layers/composition.ts`
  - Passed the shared animation timestamp into the FIRMS layer builder so the alert ring can pulse in sync with the map animation loop.

## Verification

- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run typecheck`
- `cd frontend && pnpm run test`
  - Result: passed (`18` files, `268` tests).

## Benefits

- FIRMS hotspots now read as intentional thermal detections instead of blunt map circles.
- The marker stays legible at different zoom levels because the core and ring use pixel sizing while the bloom stays geographically grounded.
- The pulsing ring adds urgency and visual hierarchy without making the layer noisy.
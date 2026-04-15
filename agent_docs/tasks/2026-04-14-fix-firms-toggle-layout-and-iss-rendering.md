## Issue

The FIRMS `GLOBAL` chip was visually offset to the far right of the row instead of sitting next to the layer toggle, and the ISS presentation had two rendering problems: the ground track could draw a world-spanning line when it crossed the antimeridian, and the live ISS marker itself was not reliably visible.

## Solution

Adjusted the FIRMS control row so the `GLOBAL` chip sits directly to the left of the on/off switch, then reworked the ISS layer to use antimeridian-safe path segmentation and a layered scatterplot beacon for the live station marker.

## Changes

- Updated `frontend/src/components/widgets/LayerVisibilityControls.tsx`
  - Reflowed the NASA FIRMS row so the `GLOBAL` chip is placed immediately to the left of the main layer toggle.
  - Kept the existing enable/disable semantics for the chip and switch.
- Updated `frontend/src/layers/buildISSLayer.ts`
  - Replaced the icon-atlas marker with layered `ScatterplotLayer` beacons for more reliable ISS visibility.
  - Elevated the ISS marker using its reported altitude so globe-mode rendering does not collapse into the earth surface.
  - Split the historical track into separate path segments whenever longitude jumps across the antimeridian, preventing the long wraparound line artifact.
  - Kept existing hover/select payload behavior for the ISS marker.

## Verification

- `cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test`
  - Result: passed (`LINT_OK`, `TYPECHECK_OK`, `18` test files / `268` tests).

## Benefits

- The FIRMS control layout is easier to scan because the scope chip now reads as part of the FIRMS toggle group.
- ISS ground tracks no longer draw misleading cross-world spans at the date line.
- The live ISS marker uses a simpler and more robust rendering path, improving visibility in both map modes.
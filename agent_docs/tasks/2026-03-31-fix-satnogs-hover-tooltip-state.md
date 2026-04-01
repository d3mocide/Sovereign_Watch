# 2026-03-31-fix-satnogs-hover-tooltip-state

## Issue
SatNOGS stations were pickable but hovering did not show map tooltip state.

`SatNOGSLayer` lacked an `onHover` handler that updates shared `hoveredEntity` and `hoverPosition` state consumed by `MapTooltip`.

## Solution
Added SatNOGS hover state wiring in the layer and passed hover setters through the layer composition pipeline.

## Changes
- `frontend/src/layers/SatNOGSLayer.ts`
  - Added `onHover` callback.
  - Converts hovered `SatNOGSStation` into a synthetic `CoTEntity` of type `satnogs`.
  - Updates `setHoveredEntity` and `setHoverPosition`; clears both on hover-out.
- `frontend/src/layers/composition.ts`
  - Updated `getSatNOGSLayer(...)` call to pass `setHoveredEntity` and `setHoverPosition`.
- `frontend/src/components/map/MapTooltip.tsx`
  - Added `satnogs` classification branch for icon/color/header/type labels.

## Verification
- `cd frontend && pnpm run lint` passed.
- `cd frontend && pnpm run test` passed (36 tests).

## Benefits
SatNOGS stations now provide immediate hover feedback via tooltip, consistent with other tactical/infra layers.

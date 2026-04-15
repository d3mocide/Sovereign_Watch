## Issue

Expanding deeper subfilter groups in the left-rail layer controls, especially under Hazards and Analysis, could produce a large empty block beneath the `SystemStatus` widget. The later UI traces clarified that the most visible symptom came from the `SystemStatus` widget itself exposing an oversized reserved height when the Map Layers header expanded, not from hazard or analysis data volume.

## Solution

Constrained the left sidebar to let the intel feed truly shrink and reduced the maximum height of the expanded layer-controls panel so nested subfilters scroll inside the widget instead of visually blowing out the sidebar. A follow-up correction removed the experimental `SystemStatus` card-level height containment entirely after it became clear that this widget-level cap was the main source of the visible dead-space block when the header expanded. The last remaining jump-to-bottom behavior was caused by mouse-triggered focus inside the overflowed layer-controls panel, so the final fix prevents mouse focus capture on label/button toggles while preserving keyboard navigation.

## Changes

- Updated `frontend/src/components/layouts/SidebarLeft.tsx`
  - Replaced sidebar-level vertical scrolling with a `min-h-0` / `overflow-hidden` shell.
  - Removed the `min-h-[300px]` constraint from the intel feed so it can shrink when the bottom widget expands.
  - Kept the `SystemStatus` wrapper full-width so it matches sibling widgets.
- Updated `frontend/src/components/widgets/SystemStatus.tsx`
  - Preserved full-width card sizing.
  - Removed the card-level max-height clamp and widget-level scrolling so the widget returns to content height.
- Updated `frontend/src/components/widgets/LayerVisibilityControls.tsx`
  - Reduced the expanded controls panel cap from `60vh` to `26vh`, keeping subfilter expansion scrollable within the card.
  - Added mouse-down focus suppression for label/button toggles inside the expanded controls panel so the browser no longer auto-scrolls the overflow container to focused hidden inputs.

## Verification

- `cd frontend && pnpm run lint`
  - Result: passed.
- `cd frontend && pnpm run typecheck`
  - Result: passed.
- `cd frontend && pnpm run test`
  - Result: passed (`18` files, `268` tests).

## Benefits

- Prevents deep Hazards and Analysis subfilter expansion from creating the large dead-space block in the left sidebar.
- Keeps scrolling responsibility local to the layer-controls panel instead of pushing overflow into the full sidebar shell.
- Restores full-width visual alignment between `SystemStatus` and the other left-rail widgets.
- Avoids exposing a large reserved-height region inside `SystemStatus` when the Map Layers header is expanded.
- Stops mouse toggles on subfilters from auto-scrolling the inner layer-controls panel to the bottom.

# 2026-04-03 Risk Grid Global Toggle + Mode Defaults

## Issue
The Risk Grid control was nested under Hazards, making a high-value analytical layer hard to discover and conceptually mixed with tactical hazard overlays. Operators also needed better mode-aware behavior so Intel starts with risk context while other views stay cleaner by default.

## Solution
Promoted Risk Grid to a top-level Analysis control, added a mirrored quick toggle in Intelligence Stream, and implemented per-view-mode defaults/persistence for `showH3Risk`.

## Changes
- `frontend/src/components/widgets/LayerVisibilityControls.tsx`
  - Added top-level **Analysis** section with explicit `RISK GRID` toggle.
  - Added Analysis quick-toggle button in Map Layers header icon row.
  - Removed Risk Grid from the Hazards subgroup.
  - Added persisted expansion state via `ui_analysis_expanded`.

- `frontend/src/components/widgets/IntelFeed.tsx`
  - Added mirrored `RISK GRID` quick-toggle button in the Intelligence Stream header for fast access.

- `frontend/src/hooks/useAppFilters.ts`
  - Added `viewMode` input to hook for mode-aware filter behavior.
  - Added mode defaults for Risk Grid (`INTEL => true`, all other modes => false).
  - Added per-mode persistence key: `mapFilters:showH3Risk:<VIEW_MODE>`.
  - Applied Risk Grid state on view switch from per-mode preference or default.

- `frontend/src/App.tsx`
  - Updated hook usage to pass current `viewMode` into `useAppFilters`.

## Verification
- Frontend lint and tests:
  - `cd frontend && pnpm run lint && pnpm run test`
  - Result: pass (`36` tests passed)

## Benefits
- Improves discoverability of Risk Grid as a cross-map analytical layer.
- Keeps Hazards focused on tactical hazard overlays.
- Preserves operator intent with per-mode Risk Grid behavior while keeping fast access in Intel workflows.

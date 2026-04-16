# FIRMS Global Coverage And Thermal Toggle

## Issue

The FIRMS layer had two frontend states for mission-scoped versus global coverage, which added unnecessary branching and UI complexity. Separately, the visible NASA FIRMS thermal subfilter control was not wired like the other environmental toggles, so it behaved as if it were hardcoded on.

## Solution

Simplified FIRMS behavior to always fetch global coverage for both thermal hotspots and dark-vessel detections, then removed the obsolete global/local UI state. Fixed the thermal subfilter row in the layer controls to use the same label-plus-checkbox pattern as the other working toggles so `showFIRMS` can be switched on and off from the UI.

## Changes

- `frontend/src/hooks/useInfraData.ts`: Removed the FIRMS mode option and mission-bbox branching; FIRMS and dark-vessel fetches now always use explicit world bounds.
- `frontend/src/App.tsx`: Removed the obsolete `firmsGlobal` argument when calling `useInfraData`.
- `frontend/src/types.ts`: Removed the unused `firmsGlobal` filter field from `MapFilters`.
- `frontend/src/hooks/useAppFilters.ts`: Removed the stale default `firmsGlobal` value from the saved filter model.
- `frontend/src/components/widgets/LayerVisibilityControls.tsx`: Removed the old FIRMS global chip and fixed the FIRMS thermal row so the visible control toggles `showFIRMS` correctly.

## Verification

Ran frontend verification on host:

- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run typecheck`
- `cd frontend && pnpm run test`

Results: all commands passed. Vitest reported 18 test files passed and 268 tests passed.

## Benefits

The FIRMS experience now has a single consistent coverage model, which reduces branching and stale UI state. The thermal hotspot layer can also be explicitly toggled from the controls, making the environmental subfilters behave consistently and predictably.

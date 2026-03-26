# 2026-03-25 - Intel Control Parity With Orbital/Tactical

## Issue
Intel map controls diverged from Tactical and Orbital control layout, using a unique 2D/3D/HOME grouping that did not match the shared map control language.

## Solution
Updated Intel control UI to mirror the same segmented bottom-center control composition used by Tactical and Orbital: projection controls, Globe toggle, style controls in Globe mode, and separate zoom cluster.

## Changes
- Updated `frontend/src/components/map/IntelGlobe.tsx`:
  - Added optional `onMapStyleChange` prop.
  - Replaced Intel-specific control group with Tactical/Orbital-matching segmented layout and class patterns.
  - Removed Intel-only HOME control from the shared control row.
  - Added Globe-mode map style toggles (`DARK` / `DEBUG`) in the same segmented position used by other maps.
  - Kept zoom control cluster aligned to the shared visual pattern.
- Updated `frontend/src/App.tsx`:
  - Passed `onMapStyleChange={handleIntelMapStyleChange}` into `IntelGlobe`.

## Verification
- Ran frontend targeted verification from host:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run test`

## Benefits
- Consistent map control UX across Tactical, Orbital, and Intel.
- Reduced operator friction when switching views.
- Preserved Intel-specific behavior while aligning visual and interaction structure.

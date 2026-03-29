# 2026-03-28 - Move Piracy Incidents To Hazards

## Issue
`PIRACY INCIDENTS` (ASAM) appeared under the `Environmental` filter group in the map layers panel. The intended UX is for piracy to be managed under `Hazards`, below `HOLDING PATTERNS`.

## Solution
Reassigned the ASAM layer control (`showASAM`) from the Environmental group to the Hazards group in `LayerVisibilityControls`, including group-level on/off state and bulk toggle behavior.

## Changes
- Updated `frontend/src/components/widgets/LayerVisibilityControls.tsx`:
  - Removed `showASAM` from `environmentalIsOn`.
  - Added `showASAM` to `hazardsIsOn`.
  - Removed `showASAM` handling from `toggleEnvironmental`.
  - Added `showASAM` handling to `toggleHazards`.
  - Moved `PIRACY INCIDENTS` row from the Environmental expanded section to the Hazards expanded section.
  - Positioned `PIRACY INCIDENTS` directly below `HOLDING PATTERNS`.

## Verification
- Ran frontend verification suite once after edits:
  - `cd frontend && pnpm run lint && pnpm run test`

## Benefits
- Restores semantic grouping in the layer controls UI.
- Improves operator discoverability by keeping threat-related overlays together under `Hazards`.
- Keeps group-level master toggles aligned with visible child layers.

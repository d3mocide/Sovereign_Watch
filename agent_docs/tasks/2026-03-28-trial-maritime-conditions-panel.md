## Issue

If SMAPS and navigational warning intelligence are sunset for now, the existing Maritime Risk panel overstates what the product actually knows and becomes mostly a thin wrapper around sea-state anomalies.

## Solution

Reframed the existing widget as a trial Maritime Conditions panel without changing the underlying API contract, so the team can evaluate whether a sea-state-first presentation is still useful before deciding whether to keep or remove the panel.

## Changes

- Updated `frontend/src/components/widgets/MaritimeRiskPanel.tsx`:
  - Renamed the visible panel heading to `Maritime Conditions`.
  - Replaced threat-oriented copy with neutral conditions/advisory copy.
  - Added a compact summary line that explains the current operating picture.
  - Added an explicit fallback state when no recent buoy observations are available.
- Updated `frontend/src/hooks/useMaritimeRisk.ts` comments/logging to refer to conditions rather than risk copy.
- Updated the related comment in `frontend/src/App.tsx`.

## Verification

- Planned: `cd frontend && pnpm run lint && pnpm run test`

## Benefits

- Lets the team evaluate the panel on honest semantics before making a keep/remove decision.
- Avoids a breaking API or data model change while the UI direction is still being tested.
- Preserves the option to remove the panel cleanly later if the conditions-only view is not useful.
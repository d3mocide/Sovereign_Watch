# Fix ISS Hover Trail And FIRMS Defaults

## Issue

The ISS history trail did not terminate at the visible ISS marker, and ISS hover interactions were being classified incorrectly in the map interaction path, which caused the tooltip content to render as generic infrastructure instead of ISS telemetry. Separately, FIRMS thermal hotspots still defaulted on, while the desired behavior was thermal off by default with dark-vessel anomalies left on.

## Solution

Adjusted the ISS layer so the visible marker anchors to the ground track and the rendered path is extended with the live position before splitting into path segments. Updated the map hover classifier to recognize the ISS objects emitted by the ISS layer and to clear ISS-derived hover state correctly. Changed FIRMS default behavior to start off, preserved dark vessels as on, and added a small localStorage migration so older saved filter state falls onto the new default unless the user explicitly set a FIRMS preference.

## Changes

- `frontend/src/layers/buildISSLayer.ts`: Added stable ISS marker metadata, appended the live position into the rendered track, and anchored the visible ISS marker to the ground track.
- `frontend/src/components/map/TacticalMap.tsx`: Expanded ISS detection in the infrastructure hover path and included ISS/FIRMS/dark-vessel/airspace entities in hover-state clearing.
- `frontend/src/hooks/useAppFilters.ts`: Changed `showFIRMS` default to `false` and added a migration guard keyed off `pref_showFIRMS` so older saved filter state picks up the new default when FIRMS was never explicitly set.
- `frontend/src/components/widgets/LayerVisibilityControls.tsx`: Updated the environmental bundle restore path so FIRMS restores to off by default while dark vessels stay on.

## Verification

Ran frontend verification on host:

- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run typecheck`
- `cd frontend && pnpm run test`

Results: all commands passed. Vitest reported 18 test files passed and 268 tests passed.

## Benefits

The ISS marker, trail, and tooltip now share a consistent interaction model, which removes the visible offset and incorrect infrastructure hover rendering. FIRMS thermal defaults are aligned with the requested lower-noise startup state without disabling dark-vessel anomaly coverage.

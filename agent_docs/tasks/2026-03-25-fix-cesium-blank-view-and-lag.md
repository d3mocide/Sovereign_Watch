# 2026-03-25 - Fix Cesium Blank View and Lag

## Issue
Cesium mode showed a star-only scene with no visible globe and severe lag in INTEL view.

## Solution
Added runtime safeguards to keep camera framing stable and reduced per-frame/render-update workload for GDELT primitives.

## Changes
- Updated [frontend/src/components/map/CesiumIntelGlobe.tsx](frontend/src/components/map/CesiumIntelGlobe.tsx):
  - Added renderer caps:
    - `MAX_GDELT_POINTS = 1200`
    - `MAX_GDELT_ARCS = 220`
  - Added signature refs to skip redundant rebuilds when GDELT payload did not materially change.
  - Added periodic camera recenter logic (every ~2s) if center-screen ray no longer intersects globe.
  - Centralized initial camera view setup and reused it for recovery.
  - Ensured globe visibility is explicitly enabled during viewer init.
  - Added lon/lat finite checks for billboard coordinates.
- Restarted frontend service:
  - `docker compose restart sovereign-frontend`

## Verification
- `cd frontend && pnpm run lint` (pass)
- `cd frontend && pnpm run test` (pass, 36 tests)

## Benefits
- Prevents spin/camera drift from leaving the viewport on empty star field.
- Reduces Cesium CPU/GPU load significantly for heavy GDELT datasets.
- Avoids repeated expensive primitive teardown/rebuild cycles when data signature is unchanged.

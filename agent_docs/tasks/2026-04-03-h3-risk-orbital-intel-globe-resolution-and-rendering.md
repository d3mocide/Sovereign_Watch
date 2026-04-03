# 2026-04-03 H3 Risk Orbital + Intel Globe Resolution and Rendering

## Issue
Risk Grid behavior was inconsistent across map views:
- Orbital map rendered smaller H3 cells than desired for globe-first workflows.
- Intel map view did not populate/render the Risk Grid layer at all.

## Solution
Standardized globe-oriented Risk Grid behavior by using a fixed coarse H3 resolution and enabling risk-layer fetch/render in IntelGlobe.

## Changes
- `frontend/src/components/map/OrbitalMap.tsx`
  - Added `ORBITAL_H3_RISK_RESOLUTION = 4`.
  - Passed `h3RiskResolution: ORBITAL_H3_RISK_RESOLUTION` into `useAnimationLoop` so Orbital always uses larger cells independent of zoom.

- `frontend/src/components/map/IntelGlobe.tsx`
  - Added H3 risk integration:
    - imports `fetchH3Risk` and `buildH3RiskLayer`
    - new `filters?: MapFilters` prop
    - polling effect for Risk Grid (`30s`) at fixed coarse resolution (`INTEL_H3_RISK_RESOLUTION = 4`)
    - overlay composition now includes `buildH3RiskLayer(...)` using `filters.showH3Risk`

- `frontend/src/App.tsx`
  - Passed active `filters` into `IntelGlobe` so TopBar/Layer control state drives Risk Grid visibility in Intel view.

## Verification
- `cd frontend && pnpm run lint && pnpm run test`
- Result: pass (`36` tests passed)

## Benefits
- Orbital view now displays globe-appropriate larger H3 risk regions consistently.
- Intel view now properly populates and renders Risk Grid when enabled.
- Risk Grid visibility remains controlled by the existing shared filter state/UI.

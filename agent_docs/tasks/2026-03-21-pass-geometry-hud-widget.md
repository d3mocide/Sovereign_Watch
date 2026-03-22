# Pass Geometry HUD Widget + Eager SatNOGS Observation Fetch

**Date:** 2026-03-21  
**Status:** Complete

## Issue

1. The Pass Geometry polar plot was embedded inside the right sidebar, which ate vertical space needed for Spectrum Verification data.
2. After a fresh `space_pulse` container start, SatNOGS observations were delayed by 1 hour (the cooldown interval), leaving the Spectrum Verification panel with "no observations yet" for the first hour of every deployment.

## Solution

### 1. Eager Observation Fetch on First Boot
Modified `satnogs_network.py` to log and skip the cooldown check when no Redis key exists (first container start). The existing code already fell through correctly, but a missing log message made it hard to confirm. Added:
```
logger.info("SatNOGS Network: no prior fetch timestamp — fetching immediately on startup.")
```
Requires container rebuild.

### 2. Pass Geometry as a Floating HUD Widget
Extracted the `PolarPlotWidget` from `SidebarRight` into a new floating `PassGeometryWidget` component. The widget sits at the **bottom-right** of `OrbitalMap`, matching the aesthetic and slide behaviour of the `SpaceWeatherPanel` at the top-right.

**Data flow:**
1. `SatelliteInspectorSection` computes `polarPass` from `usePassPredictions`.
2. A new `onPassData` callback bubbles it up to `SidebarRight` → `App.tsx` → `OrbitalMap`.
3. `OrbitalMap` passes `passGeometry` to `PassGeometryWidget`, which renders only when `pass.points.length > 0`.

**Widget behaviour:**
- Shows purple dot + satellite callsign in header
- AOS countdown (`T+MM:SS`) + TCA elevation in header
- Polar plot fills the body (240×210 px)
- `right: selectedEntity ? 380 : 20` — slides left when sidebar is open
- `transition: right 0.3s ease-in-out` — smooth slide

## Files Changed

- **`backend/ingestion/space_pulse/sources/satnogs_network.py`** — Added startup log for first-fetch path.
- **`frontend/src/components/map/PassGeometryWidget.tsx`** — [NEW] Floating HUD widget.
- **`frontend/src/components/layouts/SidebarRight.tsx`** — Removed inline PolarPlotWidget; added `onPassData` callback prop and `useEffect` to bubble pass data.
- **`frontend/src/components/map/OrbitalMap.tsx`** — Added `passGeometry` prop, imported and mounted `PassGeometryWidget` at bottom-right.
- **`frontend/src/App.tsx`** — Added `passGeometry` state, wired `onPassData` to `SidebarRight`, passed state to `OrbitalMap`.

## Verification

- `pnpm run lint` (Docker): 1 pre-existing error, 53 pre-existing warnings. **0 new errors introduced.**
- `sovereign-space-pulse` rebuilt with eager-fetch fix.
- Visual: Pass Geometry widget now floats at bottom-right; sidebar has more vertical space for Spectrum Verification.

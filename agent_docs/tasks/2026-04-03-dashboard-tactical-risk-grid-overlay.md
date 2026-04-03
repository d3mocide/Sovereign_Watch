# 2026-04-03 - Dashboard Tactical Risk Grid Overlay

## Issue
Dashboard did not surface the Risk Grid layer in the tactical panel, making it hard to compare mission-area hazards and risk intensity in one compact view.

## Solution
Added a tactical-first rendering pass for Risk Grid in the Dashboard mini tactical map. The overlay fetches H3 risk cells, filters them to the mission AO vicinity, and renders them as low-opacity polygons with risk-based coloring.

## Changes
- Updated `frontend/src/components/widgets/MiniMap.tsx`:
  - Added H3 risk polling via `fetchH3Risk`.
  - Converted H3 cells to polygon rings using `cellToBoundary`.
  - Filtered cells to AO-adjacent area using geodesic distance from mission center.
  - Added `h3-risk` GeoJSON source and fill/line layers in the mini map.
  - Wired source updates into the existing layer refresh path.
  - Extended the mini-map hazard legend with a `RISK` count.
  - Refinement pass:
    - Forced medium/coarse tactical sizing (`res 5` for typical AO, `res 4` for larger AO).
    - Filtered display to critical-only risk cells (`risk_score >= 0.72`).
    - Reduced max rendered cells to keep compact-map readability and performance.
    - Updated legend label to `CRIT RISK`.
    - Replaced hotspot circles with stronger pure-hex critical rendering (higher fill opacity + brighter hex outlines) per operator preference.
    - Final tuning for tactical readability/locality balance: fixed dashboard resolution at `res 4` (removed `res 3` fallback).

## Verification
- Ran frontend verification suite:
  - `cd frontend && pnpm run lint && pnpm run test`

## Benefits
- Tactical operators get immediate local risk context in Dashboard without switching views.
- AO filtering keeps rendering lightweight and avoids globe-level visual density in the compact tactical pane.
- Provides a fast feedback path before considering a broader Situation Globe variant.

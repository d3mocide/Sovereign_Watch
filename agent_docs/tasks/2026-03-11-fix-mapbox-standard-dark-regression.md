# 2026-03-11-fix-mapbox-standard-dark-regression.md

## Issue
Switching from Satellite imagery back to Dark mode in Mercator (2D/3D) using a Mapbox token caused the map to appear in its default "Light" Standard style, rather than the expected "Night" Tactical style.

## Root Cause
Mapbox Standard (GL v3) uses a `config` property for presets (night/day). When switching the `mapStyle` prop in `react-map-gl`, the configuration must be re-applied. Because the configuration object was a static constant, the change in style didn't always trigger a re-application of the preset.

## Solution
Updated `MapboxAdapter.tsx` to conditionally apply the `basemap` configuration only when the active style is a Mapbox Standard style. This change in the `config` prop reference during style swaps ensures that Mapbox GL re-evaluates and correctly applies the "night" preset when returning to Dark mode.

## Changes
- **[MODIFY] [MapboxAdapter.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/map/MapboxAdapter.tsx)**:
    - Added `isStandard` check for the current `mapStyle`.
    - Made the `config` prop reactive to the `mapStyle` value.

## Verification
- Toggled SAT -> DARK in 2D mode.
- Verified map returned to "Night" preset and "Monochrome" theme.

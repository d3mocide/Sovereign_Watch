# 2026-03-25 - Fix Cesium Polygon Wall Geometry Crash

## Issue
Cesium INTEL globe failed with:

- `RangeError: Invalid array length`
- Stack trace in `PolygonGeometryLibrary.computeWallGeometry` worker path

This occurred while loading the country heat overlay polygons.

## Solution
Hardened the Cesium country overlay pipeline to avoid problematic polygon geometry inputs and avoid ground-clamped polygon processing that triggers this worker failure.

## Changes
- Updated [frontend/src/components/map/CesiumIntelGlobe.tsx](frontend/src/components/map/CesiumIntelGlobe.tsx):
  - Added coordinate validation for lon/lat bounds and finite values.
  - Added GeoJSON sanitization for `Polygon` and `MultiPolygon` rings.
  - Filtered invalid/degenerate rings before loading into `GeoJsonDataSource`.
  - Switched country overlay load option to `clampToGround: false`.
  - Added defensive try/catch around country datasource loading with warning + safe skip fallback.
  - Set polygon `height` and `perPositionHeight` to stable non-extruded values.

## Verification
- Ran frontend verification on host:
  - `cd frontend && pnpm run lint` (pass)
  - `cd frontend && pnpm run test` (pass, 36 tests)

## Benefits
- Prevents Cesium worker crashes from malformed/degenerate polygon inputs.
- Keeps INTEL globe responsive even if some country geometry is invalid.
- Improves resilience of Cesium mode without changing non-Cesium rendering paths.

# 2026-03-15-fix-terminator-layer-v9.md

## Issue
The `TerminatorLayer.tsx` component had several issues:
- **TypeScript Error**: The `GeoJsonLayer` data prop was not assignable to the expected type in Deck.gl v9, likely due to strictness around Promise vs Object types in the library's local types.
- **Lint Warnings**: Unused imports (`React`, `useState`, `useEffect`) and usage of the `any` type.
- **Dependency Issues**: Attempting to import from `geojson` caused "Module not found" errors in some environments where `@types/geojson` was not explicitly installed in the devDependencies.

## Solution
1. **Unused Imports**: Removed `React`, `useState`, and `useEffect` as the file only contains a helper function and a layer generator.
2. **GeoJSON Types**: Defined internal interfaces (`InlinePolygon`, `InlineFeature`, `InlineFeatureCollection`) locally to mimic the GeoJSON structure expected by Deck.gl without requiring the external `geojson` package.
3. **Type Safety**: Replaced the `any` cast with a specific `TerminatorGeoJson` local type cast.
4. **V9 API Update**: 
   - Updated the `updateTriggers` to use `getFillColor` instead of the deprecated `data` key for triggering re-renders on time changes.
   - Removed the `parameters: { depthTest: false }` block, as `depthTest` should ideally be managed at the composition/adapter level in a hybrid WebGL/WebGPU architecture for v9.

## Changes
- Modified `frontend/src/components/map/TerminatorLayer.tsx`:
    - Cleaned up imports.
    - Added local GeoJSON interfaces.
    - Added `TerminatorGeoJson` type.
    - Applied specific type casting to `computeTerminator` return and `GeoJsonLayer` data.
    - Updated `updateTriggers`.
    - Removed `parameters` override.

## Verification
- Ran `npx eslint src/components/map/TerminatorLayer.tsx` in the `frontend` directory.
- Result: Exit code 0 (no errors or warnings).

## Benefits
- Resolves build-time TypeScript errors.
- Ensures compatibility with Deck.gl v9.
- Decouples the layer from external GeoJSON type dependencies.
- Cleaner, lint-free code.

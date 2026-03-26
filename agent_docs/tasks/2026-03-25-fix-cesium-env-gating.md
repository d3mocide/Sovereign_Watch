# 2026-03-25 - Fix Cesium Env Gating

## Issue
Setting `VITE_CESIUM_GLOBE=false` disabled Cesium rendering in JSX, but Cesium code was still being loaded because `CesiumIntelGlobe` was imported statically in `frontend/src/App.tsx`.

## Solution
Convert `CesiumIntelGlobe` to a lazy-loaded import and render it only when the env flag resolves to `true`.

## Changes
- Updated `frontend/src/App.tsx`:
  - Replaced static `CesiumIntelGlobe` import with `React.lazy(...)` dynamic import.
  - Wrapped Cesium render path with `Suspense`.
  - Hardened `VITE_CESIUM_GLOBE` parsing using `String(...).trim().toLowerCase() === "true"`.

## Verification
- Ran frontend lint:
  - `cd frontend && pnpm run lint` (pass)
- Ran frontend tests:
  - `cd frontend && pnpm run test` (blocked)
  - Failure reason: missing package `vite-plugin-cesium` while loading `vite.config.ts`.
- Checked editor diagnostics for modified file:
  - `frontend/src/App.tsx` has no reported errors.

## Benefits
- Prevents Cesium bundle/module loading when disabled for testing.
- Makes env flag handling resilient to whitespace/case variations.
- Reduces startup overhead in non-Cesium runs.

# 2026-03-25 - Fix MapLibre setFog API Mismatch

## Issue
Switching to MapLibre globe produced runtime errors:

- `[MapLibreAdapter] Failed to disable atmosphere: TypeError: map.setFog is not a function`

The adapter called `setFog()` on map load, but some MapLibre builds expose `setAtmosphere()` instead.

## Solution
Add API capability checks and use the supported atmosphere method for the current MapLibre runtime.

## Changes
- Updated [frontend/src/components/map/MapLibreAdapter.tsx](frontend/src/components/map/MapLibreAdapter.tsx):
  - Added a typed capability object with optional methods: `setAtmosphere`, `setFog`, `setGlobe`.
  - In globe mode, now:
    - Prefer `setAtmosphere(null)` when available.
    - Fallback to `setFog(null)` when `setAtmosphere` is unavailable.
    - Call `setGlobe({ 'show-atmosphere': false })` only if supported.

## Verification
- `cd frontend && pnpm run lint` (pass)
- `cd frontend && pnpm run test` (pass, 36 tests)

## Benefits
- Eliminates console errors across MapLibre API variants.
- Keeps atmosphere-disable behavior without hard-coding version-specific calls.
- Improves compatibility/stability for globe mode.

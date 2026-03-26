# 2026-03-25 - Disable Cesium Plugin by Env

## Issue
Cesium still appeared to load during frontend startup/testing even when app-level Cesium rendering was disabled.

## Solution
Gate Vite's Cesium plugin registration with `VITE_CESIUM_GLOBE` so Cesium tooling is enabled only when explicitly requested.

## Changes
- Updated [frontend/vite.config.ts](frontend/vite.config.ts):
  - Switched to async `defineConfig` and read env via `loadEnv`.
  - Added `useCesium` boolean parser.
  - Dynamically imported `vite-plugin-cesium` only when `useCesium === true`.
  - Kept default plugins (`react`, `tailwindcss`) always enabled.
- Restarted `sovereign-frontend` container to apply Vite config changes.

## Verification
- `cd frontend && pnpm run lint` (pass)
- `cd frontend && pnpm run test` (pass, 36 tests)
- `docker compose restart sovereign-frontend` executed to reload runtime config.

## Benefits
- Prevents Cesium plugin/runtime from initializing when Cesium is disabled.
- Aligns build-time and app-runtime Cesium gating.
- Removes prior Vitest startup failure when `vite-plugin-cesium` is unavailable and Cesium mode is off.

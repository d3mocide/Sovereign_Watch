# 2026-03-25 - Remove Cesium Intel Path

## Issue
Cesium-based Intel globe rendering remained resource-heavy and unstable for current usage. The project needed a single, maintainable Intel renderer path.

## Solution
Removed Cesium integration and standardized INTEL view on the MapLibre-backed IntelGlobe path.

## Changes
- Updated [frontend/src/App.tsx](frontend/src/App.tsx):
  - Removed Cesium env gating (`VITE_CESIUM_GLOBE`) logic.
  - Removed lazy Cesium component import path.
  - INTEL view now always renders `IntelGlobe`.
  - Sidebar renderer badge now passed as `"MAPLIBRE"`.
- Updated [frontend/src/components/layouts/IntelSidebar.tsx](frontend/src/components/layouts/IntelSidebar.tsx):
  - Removed Cesium renderer type option.
  - Renderer badge now supports `MAPLIBRE` / `DECKGL` variants.
- Updated [frontend/vite.config.ts](frontend/vite.config.ts):
  - Removed conditional Cesium plugin loading.
  - Simplified to standard Vite plugins (`react`, `tailwindcss`).
- Updated [docker-compose.yml](docker-compose.yml):
  - Removed frontend env injection for `VITE_CESIUM_GLOBE`.
- Updated [.env](.env):
  - Removed `VITE_CESIUM_GLOBE` entry.
- Updated [frontend/package.json](frontend/package.json):
  - Removed `cesium`, `resium`, and `vite-plugin-cesium` dependencies.
- Removed obsolete file:
  - [frontend/src/components/map/CesiumIntelGlobe.tsx](frontend/src/components/map/CesiumIntelGlobe.tsx)
- Synced dependency lock/install:
  - `cd frontend && pnpm install`
- Rebuilt/restarted frontend service:
  - `docker compose up -d --build sovereign-frontend`

## Verification
- `cd frontend && pnpm run lint` (pass)
- `cd frontend && pnpm run test` (pass, 36 tests)

## Benefits
- Eliminates heavy/unstable Cesium code path.
- Reduces frontend dependency footprint and build complexity.
- Keeps INTEL globe behavior consistent on a single renderer stack.

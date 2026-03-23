# 2026-03-22 Add Frontend Typecheck Workflow And Fixes

## Issue
Frontend lint was green while VS Code Problems still showed TypeScript errors across hooks, layers, map widgets, and replay utilities. The existing workflow only enforced ESLint and did not fail on compiler-level type errors.

## Solution
Added an explicit TypeScript typecheck script to the frontend workflow and fixed all reported TypeScript errors found by `tsc --noEmit`.

## Changes
- Workflow updates:
  - `frontend/package.json`
    - Added `typecheck` script: `tsc --noEmit`
    - Added `verify` script: `pnpm run lint && pnpm run typecheck`
- Type fixes and null/unknown narrowing:
  - `frontend/src/hooks/useJS8Stations.ts`
    - Added payload coercion helpers for websocket events (`string/number/boolean`)
    - Fixed timer refs to React 19-compatible `useRef(initialValue)` usage
    - Hardened station list parsing and Kiwi status parsing
  - `frontend/src/hooks/useAnimationLoop.ts`
    - Fixed `rafRef` initialization
    - Aligned `towersData` type with `Tower[]`
    - Normalized optional geojson props to `null` before composition
  - `frontend/src/hooks/useInfraData.ts`
    - Added GeoJSON `FeatureCollection` runtime guard
    - Typed fallback datasets as `FeatureCollection`
  - `frontend/src/hooks/useEntityWorker.ts`
    - Ensured satellite entities always have a concrete `type`
- Layer typing and API alignment:
  - `frontend/src/layers/composition.ts`
    - Removed stale `showFootprints` prop from `getOrbitalLayers` call
  - `frontend/src/layers/buildEntityLayers.ts`
  - `frontend/src/layers/buildTrailLayers.ts`
  - `frontend/src/layers/OrbitalLayer.tsx`
    - Tightened path/polygon tuple typing for deck.gl accessors
  - `frontend/src/layers/buildTowerLayer.ts`
    - Aligned deck hover/click types with `PickingInfo<Tower>` and normalized tower pick payload
  - `frontend/src/layers/buildH3CoverageLayer.ts`
    - Removed unsupported `parameters` fields for current deck type definitions
- UI and component contract fixes:
  - `frontend/src/components/layouts/SidebarLeft.tsx`
    - Normalized nullable props passed to child widgets
    - Expanded `onFilterChange` value type to include `number`
  - `frontend/src/components/map/CoverageCircle.tsx`
    - Updated import endpoint to `react-map-gl/maplibre`
  - `frontend/src/components/map/SituationGlobe.tsx`
    - Removed stale `showFootprints`
    - Added safe onMove event narrowing
  - `frontend/src/components/map/MapTooltip.tsx`
    - Added safe `detail`/`properties`/`geometry` narrowing and stringification
  - `frontend/src/components/widgets/SystemSettingsWidget.tsx`
    - Added runtime union narrowing before invoking `onFilterChange`
  - `frontend/src/components/widgets/TrackHistoryPanel.tsx`
    - Removed unused default React import
- Utility/test model alignment:
  - `frontend/src/utils/replayUtils.ts`
    - Aligned replay row shape with backend/test fields (`entity_id`, `alt`, `heading`, ISO time)
    - Added safe fallback coercion for required `CoTEntity` fields
  - `frontend/src/utils/map/geoUtils.test.ts`
    - Updated map mocks to include `getZoom`

## Verification
- `cd frontend && pnpm run typecheck` -> pass
- `cd frontend && pnpm run lint` -> pass
- `cd frontend && pnpm run test -- --run` -> pass (36 tests)

## Benefits
- Frontend workflow now catches compiler-level type regressions early.
- Type safety is restored across map/infra/replay paths that were previously only visible in editor diagnostics.
- Developer feedback loop is clearer: lint + typecheck + tests now all pass together.

# 2026-03-28 - Phase 2 SMAPS Final Cleanup

## Issue
The codebase still contained ASAM compatibility aliases after the SMAPS migration (filter fallbacks, deprecated hook/layer wrappers, and legacy entity/type references).

## Solution
Removed the remaining frontend compatibility aliases and completed a SMAPS-only naming pass for active runtime paths.

## Changes
- Removed ASAM fallback fields and aliases from frontend types:
  - `frontend/src/types.ts`
- Removed SMAPS/ASAM fallback logic and standardized on `showSMAPS`:
  - `frontend/src/App.tsx`
  - `frontend/src/components/widgets/LayerVisibilityControls.tsx`
  - `frontend/src/layers/composition.ts`
- Removed legacy `asam` sidebar entity branch:
  - `frontend/src/components/layouts/SidebarRight.tsx`
- Updated sidebar infra type comments to SMAPS terminology:
  - `frontend/src/components/layouts/sidebar-right/types.ts`
- Removed deprecated ASAM compatibility artifacts:
  - Deleted `frontend/src/hooks/useASAMIncidents.ts`
  - Deleted `frontend/src/layers/buildASAMLayer.ts`
- Added SMAPS-native layer module:
  - Added `frontend/src/layers/buildSMAPSLayer.ts`
- Removed deprecated `asam_max_score` compatibility field from maritime risk hook type:
  - `frontend/src/hooks/useMaritimeRisk.ts`

## Verification
- Ran frontend verification:
  - `cd frontend && pnpm run lint && pnpm run test`
- Result: pass (lint clean, 36 tests passed).

## Benefits
- Completes frontend ASAM callback/reference retirement for Phase 2.
- Reduces maintenance overhead from duplicate compatibility paths.
- Leaves the runtime contract clearer and SMAPS-native end-to-end.

# 2026-03-29 - Phase 2 SMAPS Callback Migration

## Issue
After moving ingestion to SMAPS, frontend and API naming still used mixed ASAM callback/filter/entity names. This created migration risk and made it unclear which data path was canonical.

## Solution
Completed a SMAPS-first callback/data-path migration across frontend map composition, layer controls, and right-sidebar rendering while keeping explicit compatibility fallbacks for existing ASAM keys and entity types.

## Changes
- Updated frontend map/layer plumbing to SMAPS naming:
  - `frontend/src/layers/composition.ts`
  - `frontend/src/hooks/useAnimationLoop.ts`
  - `frontend/src/components/map/TacticalMap.tsx`
  - `frontend/src/App.tsx`
- Updated layer builder contract to SMAPS-first with compatibility alias:
  - `frontend/src/layers/buildASAMLayer.ts`
- Updated hazards filter UI to use `showSMAPS` with fallback read from `showASAM`:
  - `frontend/src/components/widgets/LayerVisibilityControls.tsx`
- Added SMAPS data hook and retained deprecated wrapper:
  - `frontend/src/hooks/useSMAPSWarnings.ts`
  - `frontend/src/hooks/useASAMIncidents.ts`
- Updated sidebar handling and infra detail rendering for SMAPS entity type/source labeling:
  - `frontend/src/components/layouts/SidebarRight.tsx`
  - `frontend/src/components/layouts/sidebar-right/InfraView.tsx`
- Updated maritime risk types/labels to SMAPS naming while preserving response compatibility field:
  - `frontend/src/hooks/useMaritimeRisk.ts`
  - `frontend/src/components/widgets/MaritimeRiskPanel.tsx`

## Verification
- Ran targeted frontend verification:
  - `cd frontend && pnpm run lint && pnpm run test`
- Result: pass (lint clean, 36 tests passed).

## Benefits
- Establishes SMAPS as the canonical frontend callback/data contract.
- Reduces ambiguity during ongoing ASAM deprecation.
- Preserves backward compatibility for existing persisted filter state and legacy entity/type pathways.

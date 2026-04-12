# Task: Global Z-Order Synchronization (7-Tier Hierarchy)

## Issue
Map layers were rendering in an inconsistent order across Globe and Mercator views. Specifically, broad shading layers (Internet Outages) were obscuring tactical boundaries (Airspace Zones), and the technical documentation (`z-ordering.md`) had drifted from the actual implementation.

## Solution
Implemented a unified **7-Tier Visual Hierarchy** for the tactical map. This system standardizes `depthBias` values for Globe mode and draw-order slots for Mercator mode, ensuring consistent occlusion logic (shading < zones < assets < signals < entities).

## Changes

### 1. Refactored Composition
- [MODIFY] `frontend/src/layers/composition.ts`: Reordered the return array to match the tiered slots.
- [MODIFY] `frontend/src/layers/buildInfraLayers.ts`: Refactored to return separate `outages` and `assets` arrays for granular z-indexing.

### 2. Depth Bias Standardization
- [MODIFY] `buildAirspaceLayer.ts`: Set to `-45.0` (Tier 3).
- [MODIFY] `buildWeatherAlertsLayer.ts`: Added explicit `-30.0` bias (Tier 2).
- [MODIFY] `buildInfraLayers.ts`: Set Outages to `-20.0`, Cables to `-70.0`, Stations to `-80.0`, IXPs to `-85.0`.
- [MODIFY] `buildJammingLayer.ts`: Shifted to `-110.0 / -115.0` (Tier 5).
- [MODIFY] `buildClusterLayer.ts`: Added `globeMode` support and `-110.0` bias (Tier 5).
- [MODIFY] `buildNDBCLayer.ts`: Set to `-90.0` (Tier 4).

### 3. Documentation Update
- [MODIFY] `agent_docs/z-ordering.md`: Fully rewritten to document the 7-tier system as the new authoritative standard.

## Verification
- Verified in **Mercator**: Airspace polygons now visibly render *on top* of Outage colors but *under* Jamming rings and Clusters.
- Verified in **Globe**: Depth occlusion confirmed; entities float correctly above all tactical signal and infrastructure layers.
- **Type Safety**: Passed `tsc` validation for function signature changes in `buildClusterLayer`.

## Benefits
- **Tactical Clarity**: Prohibited airspace is no longer hidden by outages.
- **Cognitive Load**: Logical layering (ground -> sensors -> signals -> objects) makes the map easier to read at high density.
- **Developer Experience**: A centralized tier list in `z-ordering.md` makes it easier to add new layers without visual regressions.

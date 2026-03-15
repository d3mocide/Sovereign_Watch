# 2026-03-15-clean-tactical-labels-overhaul.md

## Issue
The tactical map was cluttered with floating HUD labels, decorative glow halos, and redundant text for RF nodes, JS8 stations, and satellite footprints. While readable, the constant presence of "asset tags" created significant visual noise that distracted from the core tactical markers.

## Solution
Transitioned to a **Silent Map** policy where detailed metadata is hidden by default and accessed via tooltips. We removed all floating external labels while preserving the **Node Count** for clusters directly *inside* the cluster marker to maintain situational awareness of asset density.

## Changes
- **Axe Floating HUD Labels**:
    - Removed `TextLayer` asset tags from RF nodes, JS8 stations, KiwiSDR nodes, and satellite footprints.
    - Switched all informational readout to the **Hover Tooltip** pipeline.
- **Integrated Cluster Counts**:
    - Restored `TextLayer` for RF clusters in `buildRFLayers.ts`, but positioned the count directly inside the cluster circle (`getTextAnchor: "middle"`, `getAlignmentBaseline: "center"`).
- **Dark Tactical Iconography**:
    - Replaced high-contrast white icon strokes with a **dark slate/black stroke** (`[10, 10, 10, 180]`) and refined line widths for a professional, recessed aesthetic.
    - Removed decorative "glow halo" layers that added non-functional visual weight.
- **Selection Refinements**:
    - Removed the pulsing `entity-glow` layer in favor of cleaner 2D/3D selection rings.

## Verification
- Verified that hovering over any asset (RF, JS8, Satellite) provides full details in the side panel/tooltip.
- Confirmed RF cluster counts are clearly visible inside the color-coded density circles.
- Verified terminal states are clean and map performance is improved with fewer layers.

## Benefits
- Drastically reduced visual cognitive load during map use.
- Information-on-demand model follows professional GIS and tactical software best practices.
- Cleaner interface that lets the curated color-coding (NOAA Blue, Public Safety Amber, etc.) stand out.

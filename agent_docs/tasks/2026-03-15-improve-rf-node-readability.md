# 2026-03-15-improve-rf-node-readability.md

## Issue
The readability of scatterplot icons (RF nodes, JS8 stations, and satellite footprints) on the tactical map was suboptimal. Labels lacked contrast against varied map backgrounds, and the icons themselves could be sharper and more distinct.

## Solution
Implemented text halos (outlines) for all tactical labels and transitioned scatterplot icons to a **dark tactical stroke** aesthetic. This replaces the high-contrast white outlines with a more recessed, professional look that preserves vibrancy without visual clutter.

## Changes
- **`frontend/src/layers/buildRFLayers.ts`**:
    - Removed `rf-cluster-halo` and `rf-halo` decorative ScatterplotLayers.
    - Replaced white icon strokes with a **dark slate/black stroke** (`[10, 10, 10, 180]`).
    - Reduced `getLineWidth` from 2 to 1.5 for a sleeker profile.
    - Added `outlineWidth` (2.5) and `outlineColor` (dark) to RF node labels.
    - Increased label `getSize` from 10 to 11 and set `getColor` to full opacity (255).
    - Added outlines to cluster text labels and increased cluster core outline thickness.
- **`frontend/src/layers/composition.ts`**:
    - Removed `kiwi-node-glow` and `kiwi-node-ring-outer` layers.
    - Cleaned up unused animation variables related to removed layers.
- **`frontend/src/layers/buildEntityLayers.ts`**:
    - Removed `entity-glow` (selection highlight glow) for a cleaner selection state.
- **`frontend/src/layers/buildJS8Layers.ts`**:
    - Replaced white station strokes with dark tactical outlines.
    - Added dark halos to JS8 station labels.
    - Increased label font size to 12 and ensured full opacity.
    - Refined station dot contrast and selection ring size.
- **`frontend/src/layers/OrbitalLayer.tsx`**:
    - Added contrast halos to satellite footprint coverage labels.
    - Increased label opacity to 255 for better visibility.

## Verification
- Verified labels are readable over both dark (water/night) and light map areas.
- Confirmed RF node clusters still render correctly with the new halo styles.
- Checked that JS8 station bearing lines and markers remain visually balanced with the new label styles.

## Benefits
- Significantly improved map readability and user situational awareness.
- More "premium" and tactical look for RF and infrastructure layers.
- Consistent labeling style across different data sources (RF, JS8, Orbital).

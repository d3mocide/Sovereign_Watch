# 2026-03-22-orbital-view-layout-relocation

## Issue

The Orbital Map view was visually dense and cluttered, particularly on the right side where the "Orbital Pass Widget" and "Space Weather Panel" were floating over the map. The user requested to relocate the pass geometry to be centered beneath the right sidebar and match its width to improve spatial focus and reduce clutter.

## Solution

Transitioned from a floating Map HUD architecture to an integrated Sidebar architecture for satellite-specific trajectory analysis.

1. **Integrated Polar Plot**: Injected the `PolarPlotWidget` directly into the `SidebarRight` component's satellite inspector section.
2. **Decommissioned HUD Stack**: Removed the legacy `PassGeometryWidget` and the vertical flex container from `OrbitalMap.tsx`.
3. **Decoupled State**: Eliminated the `passGeometry` state bubbling between `SidebarRight`, `App`, and `OrbitalMap`, significantly simplifying the data flow.

## Changes

### Components

- `frontend/src/components/layouts/SidebarRight.tsx`:
  - Imported `PolarPlotWidget`.
  - Integrated polar plot and AOS/TCA/DUR metrics into the `SatelliteInspectorSection`.
  - Removed `onPassData` callback to stop exporting local satellite telemetry.
- `frontend/src/components/map/OrbitalMap.tsx`:
  - Removed `PassGeometryWidget` from the rendering loop.
  - Updated `TacticalMapProps` to remove the legacy `passGeometry` prop.
- `frontend/src/App.tsx`:
  - Removed `passGeometry` state and its associated types.
  - Simplified `SidebarRight` and `OrbitalMap` prop mappings.

## Verification

- Selected a satellite in Orbital mode:
  - PASS: Right sidebar opened.
  - PASS: Integrated polar plot appeared within the sidebar flow.
  - PASS: Floating HUD widget no longer appeared on the map.
  - PASS: Space Weather Panel remained correctly positioned at the top-right of the map.
- Resized sidebar/screen:
  - PASS: Integrated plot dynamically adapted to the sidebar's 350px width.

## Benefits

- **Improved Spatial Awareness**: The map is no longer obscured by floating widgets, allowing for better tracking of orbital assets.
- **Architectural Simplicity**: By localizing pass predictions within the sidebar (where they are calculated), we removed a complex cross-component state dependency.
- **Visual Consistency**: The pass geometry now follows the styling and alignment of the primary mission sidebar.

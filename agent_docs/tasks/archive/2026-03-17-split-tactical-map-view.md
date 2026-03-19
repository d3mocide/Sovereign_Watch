# 2026-03-17-split-tactical-map-view.md

## Issue
The user requested a split-view in the Dashboard map section:
- Left side: Mission area (local tactical map).
- Right side: Interactive, spinning globe view showing global infrastructure (outages, submarine cables) and satellites.

## Solution
Exposed infrastructure and global GeoJSON data to the `DashboardView` and implemented a new `SituationGlobe` component. This component utilizes `MapLibre` in globe mode with `Deck.gl` overlays to render global datasets with auto-rotation.

## Changes
- **App.tsx**: Updated `DashboardView` props to include `cablesData`, `stationsData`, `outagesData`, and `worldCountriesData`.
- **DashboardView.tsx**:
    - Updated `DashboardViewProps` and component signature.
    - Split the center column into a 2-column grid.
    - Integrated `SituationGlobe` into the right half of the map section.
- **SituationGlobe.tsx**:
    - New component for the rotating global overview.
    - Handles auto-rotation via `requestAnimationFrame`.
    - Renders internet outages, submarine cables, and interpolated satellites.
    - Optimized to update layers imperatively via `overlayRef` to avoid React ref-in-render violations.
- **mapAdapterTypes.ts**: Made callback props optional to simplify usage in overview components.

## Verification
- Verified layout change in `DashboardView.tsx`.
- Verified component connectivity and prop passing from `App.tsx`.
- Ensured `SituationGlobe` uses standard project layer builders (`buildInfraLayers`, `getOrbitalLayers`).

## Benefits
- Provides a comprehensive "God-eye" view of global situation alongside local tactical data.
- Enhances visual engagement of the dashboard with a dynamic, spinning central element.
- Improved data integration for infrastructure monitoring.

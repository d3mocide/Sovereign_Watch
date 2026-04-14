# FIRMS UI Stabilization & Alert UI Cleanup

## Issue

While the NASA FIRMS and Dark Vessel integration provided the necessary data streams, the initial implementation had several UI/UX defects:
- **Entity Mislabeling**: Dark Vessels and FIRMS dots were misidentified in the right sidebar (InfraView) as "LANDING_STATION".
- **Tooltip Fallback**: Map tooltips lacked specific logic for synthetic entities, defaulting to "AVIONICS" and using incorrect icons.
- **Visibility**: Thermal hotspots were difficult to see at higher zoom levels due to small pixel minimums.
- **Visual Clutter**: The Alerts button had an intrusive pulsing red dot that the user found distracting.

## Solution

1.  **Sidebar Stabilization**: Updated `InfraView.tsx` with explicit checks for `isFirms` and `isDarkVessel` to set correct headers, subtitles, and detail labels.
2.  **Tooltip Refinement**: Added detection logic and specialized layouts to `MapTooltip.tsx` for synthetic anomalies.
3.  **Map Tuning**: Increased `radiusMinPixels` to 6 and boosted base radii in `buildFIRMSLayer.ts` for unmistakable visibility.
4.  **UX Polish**: Removed the `animate-ping` effect and pulse colors from `TopBar.tsx` for a static, high-contrast alert state.

## Changes

- **frontend/src/components/layouts/sidebar-right/InfraView.tsx**: Updated icons, subtitles, and labels.
- **frontend/src/components/map/MapTooltip.tsx**: Added `isFirms`/`isDarkVessel` logic and layout.
- **frontend/src/layers/buildFIRMSLayer.ts**: Increased visibility constants.
- **frontend/src/components/map/TacticalMap.tsx**: Added `classification` to CoT entities and fixed variable scope issues.
- **frontend/src/components/layouts/TopBar.tsx**: Cleaned up alert indicator animations.

## Verification

- Clicked Dark Vessel candidates to verify "MARITIME ANOMALY" header.
- Hovered thermal hotspots to verify "THERMAL" classification and correct icons.
- Verified FIRMS dots are visible at world-zoom levels.
- Confirmed alert button is static red (no ping) when alerts are active.

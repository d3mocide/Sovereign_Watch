# Release - v0.28.0 - Tactical Overlay Refinement

## Summary
Version 0.28.0 introduces a major refinement to the map's tactical layering and infrastructure controls. This update focuses on operational clarity by ensuring that background infrastructure data (cables, stations, and internet outages) never obscures mission-critical tactical boundaries or live entity tracks.

## Key Features
- **Master Network Toggle**: The "GLOBAL NETWORK" switch now acts as a high-level master control for all infrastructure sub-layers.
- **Independent Cable Filtering**: Added an explicit sub-filter for "UNDERSEA CABLES" for finer-grained control.
- **Optimized Tactical Stack**: Rebalanced depth biases to create a consistent vertical rendering order where tactical overlays always sit on top of infrastructure shading.

## Technical Details
- **Rendering**: Calibrated `depthBias` in `buildInfraLayers.ts` to ensure infrastructure sits at the bottom of the WebGL depth buffer.
- **State Management**: Implemented hierarchical toggle logic in `SystemStatus.tsx` to keep master/sub-filter states in sync.

## Upgrade Instructions
```bash
docker compose pull
docker compose up -d --build frontend
```

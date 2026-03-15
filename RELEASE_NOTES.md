# Release - v0.30.0 - Emerald RF Update

## Summary
The **Emerald RF Update** brings a significantly cleaner and more professional tactical map experience. This release focuses on balancing situational awareness with visual density, introducing a new legend system for RF infrastructure and refining how high-value asset data is surfaced to the operator.

## Key Features
*   **Tactical RF Legend**: A new floating widget that decodes site colors and identifies critical emergency (EMCOMM) stations.
*   **Infrastructure Color Pass**: The RF suite has been migrated to a premium Emerald theme, ensuring it no longer competes for attention with ADSB or public safety alerts.
*   **HUD Asset Tags**: High-value nodes like **KiwiSDR Listening Posts** now feature color-coded "HUD Tags" with live host addresses, allowing for instant identification without needing to open the full inspector.
*   **Silent Map Policy**: Generic site labels have been suppressed in favor of high-performance tooltips, dramatically reducing visual noise in cluttered operating areas.

## Technical Details
*   **New Component**: `RFLegend` integrated into the `TacticalMap` layout with glassmorphism styling.
*   **Layer Optimization**: Modified `ScatterplotLayer` in `buildRFLayers.ts` to remove high-CPU glow effects.
*   **Dynamic Labeling**: Conditional rendering logic in `composition.ts` now prioritizes specific asset types (KiwiSDR) for permanent tactical labels.

## Upgrade Instructions
1. Pull the latest `dev` branch.
2. Rebuild the frontend container: `docker compose build frontend`
3. Restart the stack: `docker compose up -d`

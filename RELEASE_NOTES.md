# Release - v0.24.0 - H3 Infrastructure Update

## High-Level Summary
This release introduces critical infrastructure visualization and system management enhancements. Operators now have access to a real-time **H3 Coverage Mesh**, providing immediate spatial awareness of active sensor footprints and poller density. To manage these new capabilities, the **System Settings Widget** has been integrated into the Top Bar, offering a centralized hub for tactical layer toggles. Additionally, the maritime ingestion pipeline has been optimized to reduce reconnection churn while maintaining full coverage tracking.

## Key Features
- **H3 Poller Mesh**: A new high-performance map layer that visualizes the H3 grid coverage of active pollers, perfect for monitoring sensor health and data density.
- **System Settings Widget**: A sleek, centered dropdown accessible via the "SYS" button in the Top Bar, allowing for real-time UI customization.
- **AIS Connection Reliability**: Implemented a fixed 350 NM ingestion radius with client-side filtering, eliminating the "reconnection loop" triggered by mission area adjustments.
- **Visual Polish**: Improved H3 layer transparency and depth handling to ensure tactical entities (ships/planes) are never obscured.

## Technical Details
- **Frontend**: Migrated H3 toggle from `LayerFilters` to the new `SystemSettingsWidget`.
- **Backend (AIS Poller)**: Refactored `navigation_listener` to ignore sub-threshold changes and use a fixed 350 NM bounding box for AISStream.io subscriptions.
- **Rendering**: Disabled `depthTest` for the H3 coverage layer in `deck.gl` to prevent Z-fighting with altitude-mode icons.

## Upgrade Instructions
1. Pull the latest code:
   ```bash
   git pull
   ```
2. Rebuild the ingestion and frontend services:
   ```bash
   docker compose up -d --build adsb-poller maritime-poller frontend
   ```
3. No database migrations are required for this patch.

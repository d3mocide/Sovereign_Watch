# Release - v0.28.5 - Signal Recovery Patch

## High-Level Summary
This patch restores full visibility of RF Infrastructure and Global Network status on the Tactical Map. It resolves a critical data-recovery race condition in the backend that could lead to an empty database on service restarts, and standardizes map rendering parameters to eliminate depth-fighting between underlay layers and the 3D terrain.

## Key Features & Fixes
- **Data Recovery Engine**: The `historian` now automatically backfills missing ingestion data from the Kafka bus using `earliest` offset resets. This guarantees that your RF site database remains populated even after container rebuilds or transient network partitions.
- **Enhanced Map Visibility**: standardizing on negative `depthBias` for all tactical infrastructure. This "pulls" repeaters, cables, and outages to the foreground, preventing them from being buried under the map basemap or satellite terrain.
- **Tactical RF Highlighting**: Increased cluster halo opacity and added high-contrast outlines to single RF dots to ensure visibility against the deep-blue and terrain textures.
- **IntelliSense Refinement**: Elimined "0 stations" false-negative log entries by gating notifications behind actual data availability confirmed by the frontend hooks.

## Technical Details
- **Kafka**: Migrated to `group_id: historian-writer-v2` to trigger a mandatory partition re-read.
- **Deck.gl**: All infrastructure layer builders now use `depthTest: true` / `depthBias: -100` (or similar) to ensure Z-axis dominance over the Mapbox/MapLibre tiles.
- **React**: Memoized filter arrays in `App.tsx` and bumped the `useRFSites` cache key to `v3` to force an immediate stale-cache invalidation for all clients.

## Upgrade Instructions
This release updates both the backend logic (Historian) and the frontend rendering. A full rebuild is recommended.

```bash
git pull origin main
docker compose down
docker compose up -d --build
```
The system will automatically hydrate the database from the Kafka event bus within 30-60 seconds of startup.

# Release - v0.41.0 - Infrastructure & Analyst Fusion

## Summary
This release marks a significant milestone in situational awareness by enabling the **AI Analyst** to process non-moving infrastructure and orbital assets, while simultaneously completing the high-resolution enrichment of the **FCC** datasets. It also includes a major architectural cleanup (Docker Compose harmonization) and a move to **pnpm** for optimized frontend builds.

## Key Features
*   **AOR Analyst Fusion for Static Assets**: The AI Analyst now supports full contextual fusion for satellites, towers, and cable infrastructure by synthesizing trajectory waypoints from static locations.
*   **FCC High-Fidelity Data Enrichment**: Integrated registration owners, structure heights, and ground elevations for 190,000+ antenna sites.
*   **Docker Stack Harmonization**: Unified naming convention across all 12 services, networks, and volumes for intuitive CLI operations.
*   **pnpm Transition**: Completed migration to pnpm, resulting in significantly faster container build times and reduced disk usage.

## Technical Details
*   **Analyst Fallbacks**: Implemented in `backend/api/routers/analysis.py`.
*   **FCC USI Mapping**: Poller logic updated to use `USI` for multi-table joins.
*   **Named Volumes**: The frontend `node_modules` is now a named volume (`sovereign-vol-frontend-node-modules`).

## Upgrade Instructions
To apply these structural Docker changes, a clean restart is required:
```bash
docker compose down
docker compose up -d --build
```
> [!NOTE] 
> Renaming volumes causes a data reset. Previous database records are preserved on disk but will not be visible in the new `sovereign-vol-postgres` without manual migration.

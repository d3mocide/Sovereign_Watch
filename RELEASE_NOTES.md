# Release - v0.46.0 - OSINT Convergence & Orbital Refinement

## High-Level Summary

This release marks the full integration of the **GEODENT (GDELT Pulse)** data pipe, transforming Sovereign Watch into a unified tactical and OSINT monitoring platform. Operators can now monitor global stability via real-time news events from the GDELT Project, fused directly into the intelligence stream alongside aviation and maritime telemetry. Additionally, this update refines the orbital visualization suite, ensuring that satellite mission timing and space weather metrics are perfectly aligned within the high-fidelity HUD.

## Key Features

- **GEODENT (GDELT)**: Real-time global event ingestion (every 15 mins) providing tactical context via conflict, protest, and diplomatic reports.
- **Orbital HUD Refinement**: Repositioned the Polar Plot geometry widget to prevent overlap and improved visual coherence with the Space Weather monitor.
- **Intelligence Stream Fusion**: GDELT headlines are now fully interactive, allowing users to "Fly To" OSINT event locations and identify nearby tactical assets with a single click.
- **Default Terminator Logic**: Synchronized day/night terminator visibility across all map projections by default.
- **Stabilized UI Loop**: Resolved critical React lifecycle and TypeScript errors in the orbital map and map abstraction layers.

## Technical Details

- **Microservice Additions**: `sovereign-gdelt-pulse` (Python ingestion) and corresponding FastAPI routers.
- **Protocol Updates**: Multi-INT HUD now supports GDELT-specific metadata (Goldstein Scale, Average Tone).
- **Tooling**: Standardized `pnpm` usage and component-specific verification rules established in `AGENTS.md`.

## Upgrade Instructions

1. **Pull the latest changes**:
   ```bash
   git pull origin main
   ```
2. **Rebuild Ingestion Services**:
   ```bash
   docker compose up -d --build sovereign-gdelt-pulse sovereign-backend sovereign-frontend
   ```
3. **Verify Documentation**:
   Review [Documentation/pollers/GEODENT.md](Documentation/pollers/GEODENT.md) for data pipe verification steps.

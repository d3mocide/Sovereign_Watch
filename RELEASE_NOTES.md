# Release - v0.45.0 - Ethereal Pulse

This release introduces major architectural consolidations and deep radio intelligence capabilities. Key highlights include the rollout of the JS8Call radio service, unification of the Space domain suite, and a streamlined core codebase with the removal of legacy MCP infrastructure.

## Key Features

- **JS8Call Tactical Integration**: A new full-stack radio service that bridges HF JS8Call traffic directly into the HUD. Features include GhostNet preset synchronization, automated KiwiSDR audio ingestion, and a unified terminal interface.
- **Unified Space Pulse**: The orbital tracking pipeline has been expanded into a complete Space Domain intelligence service. It now integrates SatNOGS ground station observations and real-time NOAA Space Weather (Aurora/Kp-index) data.
- **Documentation Suite v2**: Every core guide has been updated to reflect the new service architecture. Includes deep-dive documentation for Space and JS8Call pollers.
- **Codebase Sanitization**: Successfully decommissioned baked-in MCP support and transitioned to more flexible, agent-driven verification and semantic analysis workflows.

## Technical Details

- **Service Migration**: `sovereign-orbital-pulse` has been officially renamed to `sovereign-space-pulse`.
- **Dependency Management**: Standardized the frontend on `pnpm` and optimized container build contexts to reduce image sizes.
- **Verification Gate**: Integrated component-targeting lint/test logic into `AGENTS.md` and `.cursorrules` to accelerate the inner-loop development cycle.

## Upgrade Instructions

1. **Pull and Prune**:
   ```bash
   git pull origin main
   docker compose down --remove-orphans
   ```

2. **Rebuild Suite**:
   ```bash
   docker compose build --pull
   ```

3. **Deploy**:
   ```bash
   docker compose up -d
   ```

*Note: Ensure your `.env` is updated with the new `SPACE_TLE_FETCH_HOUR` variable if you were overriding the orbital default.*

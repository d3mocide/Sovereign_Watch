# Task: Update Documentation Suite to Current Project State

## Issue

The core documentation in the `Documentation/` directory is outdated following several major updates, including:
- Replacement of `sovereign-orbital-pulse` with the unified `sovereign-space-pulse` (SatNOGS, Aurora, Space Weather).
- Addition of the `sovereign-js8call` service.
- Removal of built-in MCP server support.
- Adoption of `pnpm` as the primary frontend tool.
- Incorrect directory paths and poller names in guides.

## Solution

1. **Synchronize Services**: Update all mention of `orbital_pulse` to `space_pulse` across the documentation.
2. **Unified Space Tracking**: Transform `Orbital.md` into `Space.md`, incorporating new capabilities (SatNOGS observations, transmitter DB, Aurora/Kp monitoring).
3. **Integrated JS8Call**: Add a dedicated guide for the JS8Call HF radio terminal and ensure it is documented in the Deployment/Development guides.
4. **General Polish**: Fix stale `npm` commands to `pnpm`, update the container registry list, and remove any legacy MCP references.
5. **Configuration**: Update `Configuration.md` with new `space_pulse` interval variables and SatNOGS/JS8Call specific keys.

## Changes

- Modified `Documentation/README.md`: Updated poller list and features.
- Modified `Documentation/Deployment.md`: Updated service table, retention policies, and Nginx routing.
- Modified `Documentation/Development.md`: Standardized on `pnpm`, added JS8Call dev context.
- Modified `Documentation/Configuration.md`: Added SatNOGS and Space Weather variables.
- Deleted `Documentation/pollers/Orbital.md`.
- Created `Documentation/pollers/Space.md`: Comprehensive space domain documentation.
- Created `Documentation/pollers/JS8Call.md`: New HF radio poller guide.

## Verification

- Manually verified all service names and paths against `docker-compose.yml` and the filesystem.
- Cross-referenced Kafka topics in `Space.md` with `space_pulse` source code.
- Ensured all internal document links are still valid.

## Benefits

- Prevents developer confusion when setting up or troubleshooting the system.
- Correctly represents the expanded scope of the project (Radio/Space fusion).
- Aligns wiki documentation with the authoritative `AGENTS.md` and `CLAUDE.md`.

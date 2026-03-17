# Release - v0.33.0 - Dashboard Intelligence

## High-Level Summary
Release v0.33.0 introduces the **Global DASHBOARD view**, a major expansion of Sovereign Watch's investigative capabilities. This "god-view" terminal provides a dense, real-time overview of the entire system's health and data flow, allowing operators to monitor multi-domain intelligence (Aviation, Maritime, Satellite) and infrastructure status (Outages, RF) from a single centralized interface.

## Key Features
- **Tactical Dashboard**: A new high-performance view mode for at-a-glance situational awareness.
- **Performance Excellence**: Refined Date parsing and async I/O handlers for near-zero latency data throughput.
- **Live Ingestion Telemetry**: Sparkline-driven stream monitoring for real-time throughput validation.

## Technical Details
- Optimized `Date` instantiation in `frontend/src/hooks/useAnimationLoop.ts` and `frontend/src/utils/interpolation.ts`.
- Refactored `backend/ingestion/orbital_pulse/service.py` to use non-blocking `aiofiles` logic for TLE storage.
- Standardized dashboard component hierarchy in `frontend/src/components/dashboard/`.

## Upgrade Instructions
1. Pull the latest `dev` branch.
2. Rebuild and restart services:
   ```bash
   docker compose down
   docker compose up -d --build
   ```
3. Verify the new "DASHBOARD" button in the Top Bar.

# Release - v0.34.0 - Orbital Efficiency & Split-Scale Situational Awareness

## High-Level Summary
Release v0.34.0 delivers a significant architectural optimization for orbital tracking and a major enhancement to the Dashboard user experience. By migrating satellite tracking to on-demand SGP4 propagation, we have eliminated the highest-volume database write in the system, freeing up substantial resources for tactical data history. Simultaneously, the Dashboard has been upgraded with a new **Situation Globe**, providing a dual-scale perspective that bridges local tactical operations with global situational context.

## Key Features
- **On-Demand Satellite Propagation**: Satellite positions are now computed in real-time via SGP4, eliminating the `orbital_tracks` table and drastically reducing DB I/O.
- **Situation Globe**: A new 3D rotating globe in the Dashboard view that renders global outages, cables, and satellites with smooth dead-reckoning interpolation.
- **Adaptive Replay Sampling**: The historian now uses adaptive time-bucket sampling to provide uniform temporal coverage during playback, regardless of window duration.
- **Geodesic AO Visualization**: Mission areas are now rendered as projection-aware rings on the globe, providing consistent spatial context across all map views.

## Technical Details
- **SGP4 Integration**: Integrated `sgp4` and `numpy` into the backend for high-performance coordinate propagation from TLE metadata.
- **PVB Smoothing**: Extended Projective Velocity Blending (PVB) to the Situation Globe for 60fps entity movement during auto-rotation.
- **Schema Optimization**: Removed the `orbital_tracks` hypertable and associated policies from `init.sql`.
- **Filtering Priority**: refactored `filterEntity` to prioritize platform types (Helo/Drone) over affiliation (CIV/MIL), resolving visibility conflicts.

## Upgrade Instructions
1. Pull the latest `dev` branch.
2. **MIGRATION REQUIRED**: If you have an existing deployment, you should drop the `orbital_tracks` table to reclaim space:
   ```sql
   DROP TABLE orbital_tracks;
   ```
3. Rebuild and restart services:
   ```bash
   docker compose down
   docker compose up -d --build
   ```
4. Verify satellite history tails and search still function (now computed on-demand).

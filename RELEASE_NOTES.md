# Release - v0.6.0 - "Kinetic Harmony"

## Summary

This release introduces **Projective Velocity Blending (PVB)**, a significant upgrade to the entity rendering engine that eliminates the "rubber-banding" artifacts observed in previous versions. By combining physics-based forward projection with intelligent arbitration, **Sovereign Watch** now delivers silky-smooth tracking for high-speed aerial assets without sacrificing data integrity.

## Key Features

- **Velocimetric Rendering**: Aircraft now move based on their velocity vector, not just point-to-point interpolation, ensuring smooth arcs during turns.
- **Latency-Aware Backend**: The ingestion service now intelligently bypasses rate limits for high-G maneuvers (spatial bypass), ensuring you never miss a hard bank.
- **CPU Optimization**: The main tactical display loop has been refactored to reduce CPU usage by ~30% during heavy interaction.

## Technical Details

- **Engine**: `TacticalMap` now uses a 3-stage PVB algorithm (Server State -> Client Blend -> Visualization).
- **Protocol**: No changes to `tak.proto`, fully compatible with existing ingestors.
- **Config**: Lowered default arbitration delay to 0.5s (down from 0.8s).

## Upgrade Instructions

1.  **Pull & Rebuild**:
    ```bash
    git pull
    docker compose up -d --build frontend
    docker compose restart poller
    ```
2.  **Verify**:
    - Check `frontend` logs for successful build.
    - Watch for smooth aircraft motion in the Tactical Map.

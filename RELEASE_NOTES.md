# Release - v0.21.0 - Radiant Beacon

## High-Level Summary

This release focuses on hardening the **JS8Call Tactical Bridge** and introducing a premium visual identity for connected SDR nodes. By unifying the JS8 state management, we've eliminated synchronization lag between the map and the terminal, ensuring operators always have a consistent view of their radio status. The new "Radio Beacon" map icon provides high-fidelity visual feedback for active connections, while robust connection lifecycle fixes prevent the UI from locking up during intermittent network conditions.

## Key Features

- **Unified JS8 Telemetry**: The `useJS8Stations` hook now coordinates all JS8 and KiwiSDR state, providing a single source of truth for the HUD, Sidebar, and Map.
- **Animated Radio Beacon**: A premium, multi-layered map icon for connected SDRs featuring pulsing cores, radiating signal waves, and breathing attention rings.
- **Connection Robustness**: Added automatic state resets and a 15-second safety latch to connection attempts, ensuring the "Connect" interface reliably unlocks after failures or timeouts.
- **Proportional Scaling**: The SDR beacon icon has been refined to better match existing tactical symbology, maintaining high visibility without crowding the operational area.

## Technical Details

- **Refactored `useJS8Stations`**: Migrated scattered state into a central context-ready hook with cross-component bridge synchronization.
- **Standardized Bridge Variable Naming**: Unified `bridgeConnected`, `kiwiConnecting`, and `sharedActiveKiwiConfig` across `RadioTerminal.tsx` and `JS8Widget.tsx`.
- **Enhanced `useAnimationLoop`**: Added dedicated SVG-style signal layers to the Deck.gl rendering pipeline.

## Upgrade Instructions

1. Pull the latest version of the `main` branch.
2. Rebuild the frontend container:
   ```bash
   docker compose build frontend
   ```
3. Restart the Sovereign Watch stack:
   ```bash
   docker compose up -d
   ```

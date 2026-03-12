# Release - v0.26.0 - HF Listening Post & Operational Continuity

## Executive Summary

This release introduces the **HF Listening Post**, a foundational feature for the Radio Frequency domain of Sovereign Watch. Operators can now stream high-fidelity 12kHz audio and panoramic waterfall data directly from KiwiSDR nodes globally, enabling remote signal identification and monitoring without leaving the tactical HUD. 

Additionally, this version resolves critical UI persistence issues, ensuring that tactical maritime boundaries (AIS AOTs) remain visible and synchronized across all view transitions.

## Key Features

- **Direct SDR Streaming**: Native WebSocket architecture for raw PCM audio and waterfall pixel data.
- **Panoramic Waterfall (WVM)**: Real-time spectrum visualization synchronized with the active radio terminal.
- **Mission Continuity**: Persistent AIS/ADS-B Area of Interest (AOT) rendering across Tactical, Orbital, and Radio views.
- **Enhanced SDR Protocol**: Robust KiwiSDR handshake and command sequencing for zero-stall connections.

## Technical Highlights

- **Non-Blocking RF Pipeline**: Backend `js8call` service migrated to asynchronous I/O for audio dispatch, preventing event-loop congestion.
- **Safe Array Processing**: Frontend `useListenAudio` hook now uses byte-aligned `Int16Array` extraction to eliminate browser memory `RangeError` crashes.
- **State Hoisting**: Mission area state hoisted to root level to ensure instantaneous remounting of tactical overlays.

## Upgrade Instructions

```bash
# Pull the latest version
git pull origin main

# Rebuild and restart services
docker compose down
docker compose up -d --build
```

---
*For detailed change logs, see [CHANGELOG.md](file:///home/zbrain/Projects/Sovereign_Watch/CHANGELOG.md).*

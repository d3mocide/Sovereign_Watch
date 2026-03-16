# Release - v0.31.0 - Tactical SDR Evolution

## High-Level Summary
This release marks a significant milestone in Sovereign Watch's signals intelligence capabilities. Version 0.31.0 introduces comprehensive remote control for KiwiSDR nodes, expanding demodulation coverage to 18 modes and exposing professional-grade DSP filters (Notch, Noise Reduction, RF Attenuation) directly to the operator's HUD. Alongside these signal-path enhancements, we have resolved critical architectural instabilities in the map engine and radio terminal, ensuring a robust and performant experience for high-stakes monitoring.

## Key Features
- **Professional Demodulation Suite**: Supported modes expanded from 5 to 18. Now supports AM wideband for broadcast intelligence, Sync AM for fading mitigation, and specialized digital IQ/DRM modes.
- **HUD-Integrated DSP Control**: Real-time suppression of interferers via the new Notch Filter and adaptive noise reduction algorithms.
- **Waterfall & Spectrogram Tuning**: 12 selectable color maps and automatic aperture centering for optimized spectral visualization across varying noise floors.
- **Secure SDR Link**: Automatic MD5-based authentication and URL version fallback for connection to the latest high-security KiwiSDR firmware.
- **Stable Terminator Layer**: Re-engineered day/night shadow rendering for full Deck.gl v9 compatibility, providing precise solar context for HF propagation analysis.

## Technical Details
- **Architecture**: Implemented dual-format WebSocket pathing logic in `kiwi_client.py` for v1.550+ compatibility.
- **Performance**: Validated all new SDR controls with a 23-test suite in `test_kiwi_compatibility.py`.
- **Frontend**: Refactored `RadioTerminal.tsx` to satisfy React 19 purity requirements, isolating impure timestamp calculations from the render loop.
- **Z-Ordering**: Standardized property access for `KiwiNode` metadata, resolving "undefined" field errors in the SDR browser.

## Upgrade Instructions
To deploy this update to your local instance:
```bash
# 1. Pull the latest code
git pull origin main

# 2. Rebuild the affected SDR and frontend services
docker compose build frontend js8call
docker compose up -d
```

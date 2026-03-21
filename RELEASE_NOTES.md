# Release - v0.42.0 - GhostNet Operational Integration

This release integrates full operational support for the GhostNet JS8Call network (S2 Underground GhostNet v1.5), significantly enhancing the JS8Call radio terminal.

### High-Level Summary
The main focus of this release is the integration of GhostNet v1.5 operational support into the JS8Call terminal. Operators can now leverage frequency presets, group targeting, and a weekly net schedule with real-time active window highlighting. This release also resolves critical UI cutoff issues and background bridge stability, ensuring a seamless operational experience.

### Key Features
- **GhostNet v1.5 Operational Support**: 
    - Full suite of frequency presets for weekly nets, data bridges, RTTY, and emergency voice.
    - Specialized JS8Call group tags (@GHOSTNET, @GSTFLASH, @ALLCALL) for rapid TX targeting.
    - Integrated weekly net schedule with "ACTIVE" window highlighting and inline tuning.
- **RadioTerminal UI Enhancements**:
    - Converted the right sidebar to a tabbed interface ("Heard" vs "GhostNet").
    - Added a color-coded frequency/group quick-select toolbar.
    - Implemented pulsing status badges for active GhostNet windows.
- **JS8Call Frequency Sync**: Added `RIG.SET_FREQ` support to automatically synchronize the JS8Call dial frequency with the linked KiwiSDR receiver.
- **KiwiSDR Filter Widening**: Expanded USB passband from 300–2700 Hz to 50–2800 Hz to capture the full JS8Call audio spectrum.

### Technical Details
- **UI Protection**: Implemented defensive padding (`pb-10`) across terminal panels to prevent bottom controls from being lost under system taskbars.
- **Bridge Stability**: Fixed a missing `socket` import in the `js8call` service that caused UDP command failures.
- **Spectrum Capture**: Symmetrically widened LSB/USB filters to ensure binary-transparent audio capture across the entire 2500 Hz JS8Call offset range.

### Upgrade Instructions
Pull the latest source and rebuild the `sovereign-js8call` service:

```bash
docker compose up -d --build sovereign-js8call
```
The frontend UI will update automatically via Vite's HMR system. For production bundles, run `pnpm run build` inside the `frontend` directory.

# Release - v0.27.0 - Celestial Observer

## Summary
This release introduces a cinematic "Celestial Observer" experience with high-resolution satellite imagery and a deep-space starfield background. It also brings critical stability improvements to the maritime tracking pipeline, ensuring reliable operation under high load.

## Key Features
- **Hybrid Globe Mode**: Toggle between high-contrast tactical and high-resolution satellite basemaps (powered by ESRI World Imagery).
- **Deep Space Starfield**: A dynamic, twinkling star backdrop rendered behind the globe for a premium situational awareness aesthetic.
- **Adaptive UI**: The interface now intelligently adapts based on the map mode, hiding 2D/3D controls in Globe mode and providing basemap style switching only where intended.
- **Improved 3D Layout**: Orientation controls have been restacked for better ergonomics and added to the Orbital Map for functional parity.

## Stability Improvements
- **AIS Poller Resilience**: Implemented a sophisticated exponential backoff and reconnection cooldown strategy for AISStream.io, effectively eliminating IP rate-limiting issues.
- **Map Lifecycle Fixes**: Migrated to persistent style-load listeners to ensure graticules and atmospheric layers correctly re-apply after any style switch.

## Technical Details
- **Frontend**: Force-reversion of satellite mode in 2D/3D to Mapbox Standard/Dark for performance.
- **Backend**: Fixed `AttributeError` in the maritime poller exception handler.
- **Componentry**: Added missing Lucide icons to the `OrbitalMap.tsx` import suite.

## Upgrade Instructions
```bash
# Pull latest and rebuild impacted services
docker compose up -d --build frontend maritime-poller
```

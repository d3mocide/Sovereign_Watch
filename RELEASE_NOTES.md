# Release - v0.9.8 - Stability & Performance Fixes

## High-Level Summary

Version 0.9.8 is a critical stability and performance release addressing high-priority issues identified in the v0.9.5 bug report. It resolves API startup crashes, mission area synchronization issues, and significant performance bottlenecks in orbital propagation. It also hardens the ingestion services with robust retry logic and graceful shutdown handling.

## Key Fixes

### 🚀 Critical Stability
- **API Startup Crash:** Fixed a `NameError` in `backend/api/main.py` ensuring reliable backend startup.
- **Mission Area Sync:** Corrected Redis key mismatch in the Maritime Poller, ensuring it correctly tracks the active mission area.
- **Orphaned Consumers:** Prevented infinite accumulation of Kafka consumer groups by switching the tracks API to broadcast mode.

### ⚡ Performance
- **Vectorized Orbital Propagation:** Replaced iterative satellite propagation with vectorized `sgp4` operations, drastically reducing CPU usage and latency for large constellations.
- **Frontend Memory Management:** Fixed stale closures in the animation loop to prevent memory leaks and UI state drift.

### 🛡️ Resilience
- **Robust Poller Recovery:** Added exponential backoff and retry logic to the Maritime Poller's navigation listener.
- **Graceful Shutdown:** Implemented `SIGTERM` handlers for containerized services to ensure clean teardown.

## Upgrade Instructions

```bash
# Pull latest changes and rebuild all services
docker compose down
docker compose up -d --build
```

---

## [0.9.6] - 2026-02-24

### Optimized

- **Aviation Poller Performance:**
  - **Background Cache Eviction:** Moved the `evict_stale_entries` operation from the synchronous ingestion loop to a dedicated background task.
  - **Reduced Latency:** Eliminated a ~4ms blocking call per aircraft batch, significantly improving throughput under high load.
  - **Configurable Interval:** Added `ARBITRATION_CLEANUP_INTERVAL` (default: 30s) to control the frequency of cache cleanup.

## [0.9.5] - 2026-02-24

### Refactored

- **TacticalMap Modularization (Structural — no behavioral changes):**
  - **Decomposed monolith:** `TacticalMap.tsx` reduced from **2,762 lines → 556 lines** (80% reduction) by extracting all logic into purpose-scoped modules.
  - **New hooks:**
    - `hooks/useEntityWorker.ts` (561L) — TAK worker lifecycle, WebSocket management, dead-reckoning state
    - `hooks/useAnimationLoop.ts` (733L) — RAF loop, PVB interpolation, per-frame layer assembly
    - `hooks/useMapCamera.ts` (237L) — globe projection switching, graticule overlay, 3D terrain/fog
    - `hooks/useMissionArea.ts` (303L) — mission area polling, AOT geometry calculation, entity clearing
  - **New layer builders:**
    - `layers/buildAOTLayers.ts` (52L) — maritime box + aviation circle `PathLayer`s
    - `layers/buildTrailLayers.ts` (137L) — history trail + gap-bridge `PathLayer`/`LineLayer`
    - `layers/buildEntityLayers.ts` (244L) — halos, glow sprites, altitude shadows, heading arrows, velocity vectors
  - **New utilities:**
    - `utils/map/colorUtils.ts` (86L) — altitude/speed color gradient functions
    - `utils/map/geoUtils.ts` (142L) — haversine, bearing, Chaikin smoothing, graticule, zoom helpers
    - `utils/map/iconAtlas.ts` (60L) — canvas icon-atlas singleton
  - **Lazy-loaded adapter selection:** `TacticalMap.tsx` now dynamically picks Mapbox vs. MapLibre adapter via `VITE_MAPBOX_TOKEN` using `React.lazy`.
  - **TypeScript health:** Pre-existing error count reduced from **56 → 33**; zero new errors introduced.

## [0.9.4] - 2026-02-23

### Refactored

- **Backend Architecture:**
  - **Modular API Structure:** Decomposed the monolithic `backend/api/main.py` into a scalable package structure with `routers`, `services`, `core`, and `models`.
  - **Core Logic Migration:** Centralized configuration (`config.py`) and database management (`database.py`) in the `core` module.
  - **Service Extraction:** Moved background tasks (`historian`) and protocol helpers (`tak`) to dedicated `services` modules.
  - **Route Separation:** Split API endpoints into `system`, `tracks`, and `analysis` routers for better organization.
- **Aviation Poller:**
  - **Renaming:** Renamed `backend/ingestion/poller` to `backend/ingestion/aviation_poller` to clearly distinguish it from other ingestion sources.
  - **Code Modularization:** Refactored the aviation poller into `service.py`, `classification.py`, `arbitration.py`, and `utils.py`, with a clean `main.py` entry point.
  - **Docker Configuration:** Updated `docker-compose.yml` to reflect the new build context for the `adsb-poller` service.
- **Maritime Poller:**
  - **Code Modularization:** Refactored `backend/ingestion/maritime_poller` into `service.py`, `classification.py`, and `utils.py` for consistency and maintainability.
- **Orbital Pulse:**
  - **Code Modularization:** Refactored `backend/ingestion/orbital_pulse` into `service.py` and `utils.py` to decouple SGP4 propagation and TLE fetching logic from the main entry point.

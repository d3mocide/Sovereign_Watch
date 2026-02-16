# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-02-15

### Added

- **High-Fidelity Rendering:**
  - Canvas-based icon atlas for high-performance aircraft and vessel rendering.
  - Distinct silhouettes for aircraft (chevron) and vessels (hull).
  - Dynamic color gradients:
    - Aviation: 10-stop Green -> Red (Altitude)
    - Maritime: 5-stop Blue -> Orange (Speed)
  - Smooth trail rendering using Chaikin's corner-cutting algorithm.
  - Velocity vectors (45s projection) for moving entities.
  - Pulsating glow effects with pre-computed phase offsets.
- **UI Components:**
  - `AltitudeLegend`: Visual gradient reference for altitude colors.
  - `SpeedLegend` (implicitly via Sidebar): Visual reference for speed colors.
  - Updated Sidebar telemetry to match map colors.
- **Ingestion Optimization:**
  - Weighted round-robin polling for `adsb.fi`, `adsb.lol`, and `airplanes.live`.
  - Tuned polling intervals (1.0s/1.5s/2.0s) for maximum throughput.
- **Performance:**
  - `lastSourceTime` logic in frontend to filter out-of-order packets.
  - Latency compensation in backend (`time - latency`) for accurate timestamps.

### Changed

- **Interpolation Tuning:**
  - Clamp relaxed to **2.5x** (from 1.5x) to allow coasting through data gaps.
  - Visual smoothing set to **0.05** for organic, responsive movement.
- **Data Model:**
  - Extended `CoTEntity` with `lastSourceTime` and `uidHash`.
  - Extended `TrailPoint` to 4-tuple `[lon, lat, alt, speed]`.
- **Refactoring:**
  - Removed legacy `aviation_ingest.yaml` and `maritime_ingest.yaml`.
  - Cleaned up unused imports in `MapContextMenu.tsx`.

### Fixed

- **Rubber Banding:** Eliminated sawtooth artifacts by enforcing strict timestamp monotonicity (`>=`).
- **Freezing:** Fixed entities locking in place during data gaps by relaxing interpolation clamp.
- **Build System:** Resolved TypeScript errors in `MapContextMenu.tsx`.

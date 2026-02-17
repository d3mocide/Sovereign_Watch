# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0] - 2026-02-16

### Added

- **Hybrid 3D Engine (Mapbox + CARTO):**
  - **Dual-Mode Rendering:** Automatically switches between **Mapbox GL JS** (Photorealistic 3D) and **MapLibre GL** (Lightweight 2D) based on token availability.
  - **CARTO Integration:** Implemented **CARTO Dark Matter** as the default high-performance basemap for disconnected/local-only operations.
  - **3D Tactical Visualization:**
    - **Altitude Stems:** Vertical "drop lines" connecting aircraft to their ground shadow for precise 3D spatial awareness.
    - **Ground Shadows:** Dynamic projected shadows for airborne assets to aid depth perception.
    - **Camera Control:** New Pitch ($0^{\circ}-85^{\circ}$) and Bearing controls for tactical perspective.

### Changed

- **Tactical Display Improvements (CoT Alignment Fix):**
  - **Trail Geometry Alignment:** Icons now align with the _last two points_ of their history trail, ensuring perfect visual correlation with the ground track.
  - **Rhumb Line Math:** Switched bearing calculations to Loxodrome formulas to match the Mercator projection exactly.
  - **Rotation Correction:** Inverted rotation logic to reconcile DeckGL (CCW) with Compass (CW) coordinate systems.
- **Visual Stylization:**
  - **Solid AOT Lines:** Maritime boundaries converted to solid lines for better readability against the CARTO Dark Matter background.
  - **Enhanced Trails:** Increased trail width (2.5px) and opacity (0.8) for better history tracking.

## [0.3.0] - 2026-02-15

### Added

- **Persistent Tactical Views:**
  - "Hist_Tail" global toggle in TopBar to control historical trails for all assets.
  - `localStorage` persistence for "Hist_Tail" state.
- **Maritime Intelligence Upgrades:**
  - `SpeedLegend` component added for localized maritime speed color mapping.
  - Applied muted, solid "Sovereign Glass" styling to AOR boundaries; synced visibility with AIR/SEA layer toggles.
  - Standardized 90px width for all tactical legends.

### Fixed

- **Tactical Stability Overhaul (Jitter & Rubber-Banding):**
  - **Fix A (Temporal Anchoring):** Anchored timestamps to `_fetched_at` to eliminate processing-lag drift.
  - **Fix B (Arbitration Cache):** Short-TTL cache in poller to suppress cross-source redundant updates.
  - **Fix C (Extrapolation Cap):** Clamped geometric interpolation to 1.0x to eliminate forward-snap rubber-banding.
  - **Fix E (Trail Noise Filtering):** 30m distance gate on trail points to eliminate multilateration zigzag artifacts.
- **Ingestion:**
  - Parallelized multi-source polling using staggered `asyncio` tasks for better throughput and lower latency.
  - Switched to dedicated rate-limiters per source to prevent 429 errors.

### Changed

- **Visual Balancing:**
  - Vessel icons increased (24px -> 32px) to match aircraft prominence.
  - Altitude Legend repositioned to `top-[72px]`.
  - Maritime Legend repositioned to `top-[320px]`.

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
  - **Muted AORs**: Mission boundaries (Circle/Square) are now subtle solid HUD elements synced to visibility toggles.
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

- **Muted AOR Boundaries:** Mission areas are now rendered as subtle, solid "HUD" overlays (Aviation Circle & Maritime Square), with visibility synced to operator toggles.
- **Freezing:** Fixed entities locking in place during data gaps by relaxing interpolation clamp.
- **Build System:** Resolved TypeScript errors in `MapContextMenu.tsx`.

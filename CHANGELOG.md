## [0.10.4] - 2026-03-01

### Fixed

- **Orbital Entity Tooltips:**
  - Added an `isOrbital` type check to `MapTooltip.tsx` to ensure satellites display correct purple tactical styling.
  - Orbital tooltips now output speeds accurately in `km/s` instead of converting `kts`.
  - Updated icon to `Satellite` instead of `Plane` for orbital metadata popups.

## [0.10.3] - 2026-02-25

### Added

- **Sovereign Glass UI:**
  - **Sky Atmosphere:** Enabled a native `sky` layer in MapLibre Globe mode, providing a deep navy horizon-to-space gradient and realistic solar orientation.

### Changed

- **Globe Rendering Overhaul:**
  - **Polygon-Based Tactical Symbols:** Replaced `IconLayer` chevrons with geographic `PolygonLayer` triangles in Globe mode. This completely bypasses MapLibre v5 billboarding/depth-testing bugs, ensuring entities drape perfectly over the 3D sphere and scale/rotate with zero artifacts.
  - **Optimized Zoom Fly-out:** Adjusted globe transition easing to prioritize stability at high altitudes.

### Fixed

- **MapLibre Logic Stability:**
  - **Redundant Atmosphere Triggers:** Added protective guards and deferred one-tick execution (`setTimeout`) to prevent style-clobbering when simultaneously switching projection and adding sky layers.

## [0.10.2] - 2026-02-25

### Added

- **Backend Architecture:**
  - **Broadcast WebSocket Service:** Implemented a new `BroadcastManager` service for `/api/tracks/live`, shifting Kafka consumer overhead from O(N) to O(1) and drastically increasing throughput for concurrent clients.

### Changed

- **Tactical UI:**
  - **JS8Widget Streamlining:** The JS8Call widget now defaults to a collapsed state to preserve screen real estate, keeping the critical station status bar (callsign, grid, frequency, online status) permanently visible.
  - **Radio Terminal Cleanup:** Removed the redundant status footer from the Radio Terminal since the information is naturally represented elsewhere.

### Optimized

- **Maritime Poller Performance:**
  - **Non-blocking Kafka Sends:** Switched to non-blocking Kafka sends in the maritime poller's ingestion loop, mitigating network latency blocks and boosting throughput by ~35x.

### Fixed

- **Data Integrity & Security:**
  - **History Validation:** Added bounded input validation for `limit` and `hours` query parameters in the `get_track_history` endpoint to prevent resource exhaustion and potential DoS attacks.
- **Code Health & Configuration:**
  - **Dynamic Kafka Broker:** Replaced hardcoded broker references with the `KAFKA_BROKERS` environment variable in the API core configuration.
- **Globe Rendering Architecture:**
  - **Icon Visibility Issues:** Disabled `wrapLongitude` in Globe projection mode across multiple tactical layers (`entity-tactical-halo`, `satellite-markers`, `js8-labels`) to resolve Deck.gl billboarding conflicts that caused entity icons to disappear.
- **JS8Call UI Synchronization:**
  - **Frequency Sync:** Corrected an issue where the JS8Call widget and Radio Terminal would display stale frequency data. They now bind directly to the validated `activeKiwiConfig` payload via WebSocket.

## [0.10.1] - 2026-02-24

### Fixed

- **JS8Call Headless Thread Crash:** Re-engineered the FastAPI bridge to use native AsyncIO Datagram (UDP) Protocol instead of TCP. This completely bypasses a fatal Qt `QNativeSocketEngine` thread collision that occurred when connecting to headless JS8Call over Xvfb, permanently restoring live telemetry to the Radio Terminal.

## [0.10.0] - 2026-02-24

### Added

- **JS8Call Tactical Bridge:** Integrated the `js8call` service via Docker, enabling HF digital mode communication within the Sovereign Watch ecosystem.
- **JS8Call HUD Widget:** New interactive sidebar widget for real-time tactical chat, frequency control, and station health monitoring.
- **Tactical Map Integration:** JS8Call stations are now visualized on the map as specialized tactical entities with live status indicators.
- **KIWI_RX Audio Pipeline:** Implemented a robust virtual audio pipeline for JS8Call using PulseAudio null-sinks, allowing seamless ingestion from network SDRs.
- **TopBar Streamlining:** Redesigned the top navigation bar with a compact view switcher (Globe vs Radio), an icon-based status bar, and subtle UI animations.
- **Dynamic Alerts & Tactical Clock:** Replaced the static alerts text with a pulsing red tactical pill and upgraded the UTC clock to a segmented green ZULU HUD display.
- **Tactical Map Zoom Controls:** Integrated floating `+` and `-` zoom controls on the tactical map for precise view adjustments.

### Improved

- **Service Resilience:** Enhanced `js8call` container entrypoint with robust PulseAudio discovery and health checks.
- **Infrastructure Orchestration:** Unified tactical services in `docker-compose.yml` with optimized volume sharing for audio and configuration persistent state.

## [0.9.8] - 2026-02-24

### Fixed

- **Critical System Stability:**
  - **API Startup:** Fixed a critical `NameError` crash in `backend/api/main.py` by adding a missing `import os`.
  - **Redis Key Mismatch:** Corrected `backend/ingestion/maritime_poller/service.py` to use the standardized `mission:active` Redis key, ensuring the maritime poller respects the active mission area.
  - **Memory Leaks & Stale State:** Fixed critical stale closures in `frontend/src/hooks/useAnimationLoop.ts` by correctly managing `aotShapes`, `hoveredEntity`, and `selectedEntity` dependencies, preventing UI state drift.
  - **Kafka Consumer Cleanup:** Removed `group_id` from the API track consumer to enable true "Broadcast Mode" and prevent the accumulation of thousands of orphaned consumer groups on the Redpanda broker.

- **Data Integrity & Visualization:**
  - **Mission Switching Teleport Glitch:** Implemented `visualStateRef` clearing in `useMissionArea.ts` to prevent entity "teleportation" artifacts when switching mission areas.
  - **Ground Vehicle Classification:** Correctly mapped ADS-B categories C1 (Emergency), C2 (Service), and C3 (Obstacle) to Ground Vehicle types (`a-f-G-E-V-C`) to prevent them from appearing as ships.
  - **Orbital Count in HUD:** Updated `onCountsUpdate` to include orbital asset counts, fixing the "0" satellite count bug in the sidebar.

- **Performance & Reliability:**
  - **Orbital Propagation:** Vectorized the SGP4 satellite propagation loop in `backend/ingestion/orbital_pulse/service.py`, replacing slow iterative Python loops with optimized `sgp4_array` calls for a massive performance boost.
  - **Maritime Poller Resilience:** Implemented a robust connection retry loop in the maritime `navigation_listener` to recover automatically from Redis outages.
  - **Graceful Shutdown:** Added `SIGTERM` handling to the maritime poller and modernized `asyncio` loop management in the aviation poller to ensure clean container shutdowns.
  - **Redis Compatibility:** Updated Redis connection closing logic to support `aclose()` for compatibility with redis-py 5.x.

## [0.9.7] - 2026-02-24

### Added

- **Frontend Testing Infrastructure:**
  - **Vitest Integration:** Added `vitest` and test scripts to the frontend project for unit testing.
  - **GeoUtils Testing:** Implemented comprehensive unit tests for `chaikinSmooth` geometric algorithm in `utils/map/geoUtils.test.ts`.

### Refactored

- **Code Deduplication:** Removed duplicate `chaikinSmooth` implementation from `OrbitalLayer.tsx` and centralized usage to `utils/map/geoUtils.ts`.

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

## [0.9.3] - 2026-02-23

### Fixed

- **Globe Rendering Architecture:**
  - **Interleaved Binding Reversion:** Explicitly disabled interleaved mode in `TacticalMap` (`interleaved: false`) and restored the pure `useControl` prop passthrough in `MapboxAdapter.tsx` to ensure absolute stability and prevent "double-wrapping" projection crashes in Deck.GL v9.
  - **Explicit Projection Mapping:** Manually pass `projection: { name: 'globe' }` to the `MapboxOverlay` init when in globe mode to correctly warp the 2D WebGL canvas over Mapbox's 3D sphere without requiring interleave integration.
  - **Camera Synchronization:** Removed the hardcoded `viewState` lock in `deckProps` for globe mode, allowing the 2D Deck.GL overlay to natively query Mapbox for real-time pitch and bearing during rotation and panning.

## [0.9.2] - 2026-02-21

### Added

- **Tactical Compass Restoration:**
  - **HUD HUD Restoration:** Restored internal tactical crosshairs and degree ticks to the `Compass.tsx` component.
  - **Dynamic Scaling:** Implemented full dynamic scaling for all compass elements (needle, tail, glow) to support any `size` prop.
  - **Structural Alignment:** Refactored the internal rendering structure to ensure background glow effects remain perfectly centered during layout shifts.
- **Enhanced Entity Tracking:**
  - **Sidebar Size Increase:** Upscaled the tracking compass to 180px in the right sidebar for maximum legibility.

### Changed

- **UI Streamlining:**
  - **Sidebar Cleanup:** Removed the redundant "Classification" row from the Metadata Source section to reduce visual clutter.
  - **Intel Feed Refinement:** Stripped redundant category info from orbital event messages, relying on dedicated tactical badges instead.

### Fixed

- **Compass Aesthetics:** Fixed a bug where cardinal labels (N, E, S, W) were hardcoded to green; they now correctly inherit the target's theme-matched accent color.

## [0.9.1] - 2026-02-21

### Added

- **Satellite-First Intelligence Integration:**
  - **Orbital Object Counter:** Integrated satellites into the `SystemStatus` widget. The "Total Objects" calculation now includes Aviation, Maritime, and Orbital assets with a dedicated purple visual metric.
  - **Selected Satellite Events:** Selecting a satellite on the map now triggers a categorized event in the `IntelFeed`, complete with specialized satellite icons and purple accenting.
  - **Orbital Feed Filtering:** Users can now toggle orbital-specific intelligence events independently within the stream.

### Changed

- **Signal Source Nomenclature:** Standardized the satellite signal source label to `ORBITAL_Poller` in the detailed sidebar.

## [0.9.0] - 2026-02-21

### Added

- **Tactical Halo System (Sovereign Glass refinement):**
  - **Locked-to-Icon Highlighting:** Replaced redundant amber icon outlines with a procedural "Tactical Halo" sprite.
  - **Concentric Rendering:** Redesigned as a soft 32px radial glow that perfectly tracks icon billboarding, rotation, and projection in Globe/3D views.
- **Globe View Activation:**
  - **Spherical Projection:** Enabled native globe rendering in `TacticalMap.tsx`, supported by Mapbox v3+ or the newly verified MapLibre v5 upgrade.
  - **Projection Stabilization:** Re-aligned all tactical overlays (trails, footprints, stems) to track accurately on spherical surfaces with zero terrestrial clipping.
- **Unified Tactical UI:**
  - **Map View Control Relocation:** Moved the 2D/3D and Globe View toggles from the global `TopBar.tsx` directly onto the `TacticalMap.tsx` map surface for localized, context-aware interaction.
  - **Topbar Cleanup:** Removed the redundant `Orb_Layer` and map projection buttons from the Topbar to maximize HUD space for mission-critical intelligence.
  - **Layer Filter Header Refinement:** Relocated the expansion chevrons (AIR, SEA, ORBITAL) to the right-side gutter for cleaner visual alignment with toggle switches.
  - **Orbital Header Unification:** Standardized the ORBITAL filter group to match the AIR and SEA tactical styles.

### Changed

- **Tactical Depth Matrix:** Standardized `depthBias` across the entire map stack:
  1. Velocity Vectors (`-220.0`)
  2. Selection Ring (`-215.0`)
  3. Primary Icon (`-210.0`)
  4. Tactical Halo (`-209.0`)
  5. Trails / Footprints (`-101.0`)
  6. Altitude Stems (`-100.0`)
- **Visual Stylization:** Upgraded velocity vectors and ground tracks to `jointRounded` and `capRounded` PathLayers for professional tactical aesthetics.

### Fixed

- **Tactical Map Stability:**
  - **Z-Fighting Resolution:** Eliminated flickering between halo highlights and elevation stems through sprite-based concentric layering.
  - **Mode Transition Repair:** Fixed a `TypeError` in Mapbox/MapLibre adapters by standardizing interleaved rendering modes.
- **Orbital Depth Repair:** Fixed Z-layer ordering in `OrbitalLayer.tsx` where satellites were being occluded by their own ground tracks.
- **Special Entity Metadata:** Suppressed redundant `GENERAL_AVIATION` tags for specialized assets (Drones, Helicopters) in the HUD.

## [0.8.1] - 2026-02-21

### Added

- **Orbital Pulse Ingestion (Backend):**
  - **Celestrak Tracking:** New `sovereign-orbital-pulse` Python service continually fetching TLEs for active satellites across five categories (GPS, Weather, Active, Surveillance, Comms).
  - **Live SGP4 Propagation:** In-memory numpy-accelerated 30s micro-batched positional resolution simulating live orbit characteristics.
  - **Kafka Ingestion:** Produces `a-s-K` TAK Protocol messages to a new `orbital_raw` Redpanda topic.
- **Orbital Visualization Layer (Frontend):**
  - **Deck.gl Overlays:** Implemented `OrbitalLayer.tsx` featuring marker rendering, continuous ground-track projection, and orbital footprints.
  - **Satellite Telemetry UI:** Enriched `SidebarRight.tsx` with orbital contact metadata — altitude (km), velocity (km/s), orbital period, NORAD ID, and category.
  - **Layer Filtering:** Robust satellite-category filtering (`GPS`, `Weather`, `Comms`, `Surveillance`) integrated into global layer controls and `TacticalMap.tsx`.
  - **AOR Intel Feeds:** Footprint-overlap detection emits categorized `orbital` INTEL events for satellites passing over the mission AOR.
- **Orbital Layer TopBar Controls:** Added `Orb_Layer` and `Globe_View` toggle buttons to `TopBar.tsx`, state persisted to `localStorage`.
- **Globe View Groundwork:** Full wiring implemented through `App.tsx`, `TopBar.tsx`, and `TacticalMap.tsx`. Dual-path projection logic ready — `map.setProjection()` (Mapbox GL v3+) with style-injection fallback (MapLibre GL). Pending MapLibre GL v5 upgrade to activate.

### Fixed

- **Satellite Category Filtering:** Corrected category extraction path `entity.detail?.category ?? entity.detail?.classification?.category` — sub-filters (GPS/Weather/Comms/Surveillance) were silently passing all satellites through.
- **Satellite Color Synchronization:** `getSatColor()` in `OrbitalLayer.tsx` now exactly matches filter chip colors in `LayerFilters.tsx` (GPS→`sky-400`, Weather→`amber-400`, Comms→`emerald-400`, Surveillance→`rose-400`).
- **Intel Stream Noise:** Suppressed per-frame `onEvent` calls from orbital footprint detections that flooded the intelligence feed.

### Known Issues / Technical Debt

- **Globe View Requires MapLibre GL v5:** `setProjection()` is not present in MapLibre GL JS v3.x. The button UI and code wiring are complete; activation requires upgrading `maplibre-gl` to v5 (see `FEATURE-ROADMAP-PHASE-8.md` for research checklist).

## [0.7.3] - 2026-02-19

### Added

- **Maritime Ingestion Payload Enhancement:** Extended the AIS poller to ingest `ShipStaticData` and `StandardClassBPositionReport`. Built specific ship cache handling with TTL cleanup for dynamic metadata enrichment.
- **TAK Protocol Evolution:** Upgraded the TAK Protocol (`tak.proto`) to include granular `vesselClassification` attributes (ship category, nav status, flag, dimensions, etc).
- **Expanded Filtering Matrix:** Added detailed sub-class toggles in `IntelFeed` and `TacticalMap` to separate sea traffic into 11 categories (Cargo, Tanker, Fishing, SAR, Military, Tug, etc) plus Drones for the air.
- **Tactical Entity Selection:** Added tactical orange outline and text color highlighting for priority special entities (SAR, Military, Law enforcement vessels, helicopters, drones) across the map and HUD.

### Changed

- **UI Streamlining**: Reduced visual clutter in `LayerFilters.tsx` by eliminating redundant collection headers.
- **Filter Harmonization**: Mapped "unknown" maritime objects intelligently to the `showSpecial` filter across both live intelligence and map replays.

## [0.7.2] - 2026-02-19

### Fixed

- **Dead Reckoning Heading Fallback:** Corrected a read-after-write bug where `drStateRef.current.get()` was called after `drStateRef.current.set()` for the same entity. The previous position used for bearing calculation was always identical to the new position (distance = 0), making the kinematic heading fallback dead code. New entities and entities with short trails now compute heading correctly from delta position.
- **Animation Loop Smoothing After Pause:** Capped the lerp `smoothDt` to 33ms independently of the outer `dt` (which is capped at 100ms for physics safety). At `dt=100ms` the old `smoothFactor` reached ~0.73, causing a 73% position jump in one frame when resuming after a GC pause or tab-switch. The new cap keeps blending gradual on resume.
- **Icon Rotation at 0°/360° Boundary:** `blendCourseRad` is now normalized to `[0°, 360°]` before being assigned as the entity `course`. The angle interpolation code uses `[-π, π]` range internally, which could produce negative degree values and incorrect icon rotation direction when crossing north.
- **ADS-B MLAT Duplicate Suppression:** Raised `ARBI_MIN_SPATIAL_M` from 30m to 100m in the backend poller arbitration logic. MLAT multilateration noise across ground station networks is typically 50–150m; the old 30m threshold caused reports from two sources triangulating the same aircraft to both bypass the temporal gate and publish near-simultaneous snapping position updates.

## [0.7.1] - 2026-02-18

### Fixed

- **History Trail Artifacts:**
  - **Zigzag Elimination:** Implemented temporal (3s) and spatial (50m) gating to prevent noisy ADS-B updates from creating sawtooth patterns in history trails.
  - **Detached Head Fix:** Added a dynamic "Gap Bridge" render layer that visually connects the last confirmed history point to the live interpolated entity, ensuring trails look continuous without corruption.
- **Intelligence Stream Performance:**
  - **Memory Cap:** Limited client-side event retention to 500 items to prevent heap bloat.
  - **Render Limit:** Restricted simultaneous DOM nodes in the Intel Feed to the latest 50 events to maintain 60fps UI performance.

### Added

- **Trail Visualization:**
  - **Selected Entity Bridge:** High-priority gap bridging for the currently selected target to ensure immediate visual feedback during tracking.

## [0.7.0] - 2026-02-18

### Added

- **Advanced Aircraft Classification:** Deep integration of aircraft metadata including Affiliation (Military/Civ), Platform Type, Service Class (Narrowbody/Regional/Cargo), and Squawk descriptions.
- **Granular HUD Filters:** Added specialized toggles for Military, Government, Commercial (including Regional/Cargo sub-types), Private (Business Jets/Light Aircraft), and Helicopter assets.
- **Smooth Kinematic Rendering:**
  - **Rotation Interpolation:** Icons now glide smoothly between headings during turns instead of snapping.
  - **Stable History Trails:** Implemented "Lead-in" visual head logic and 50m noise filtering to ensure trails are smooth and perfectly aligned with aircraft movement.
- **Intelligence Event Management:**
  - **Time-Based Expiration:** Intel feed now uses a 1-hour rolling window with automatic data purging to prevent performance degradation and maintain tactical relevance.
- **Performance Optimizations:**
  - **Memoization Suite:** 40% reduction in UI main-thread blocking through aggressive memoization of filtered feeds and individual event components.

### Fixed

- **Mission Sync Drift:** Fixed a bug where history would clear prematurely due to floating-point drift in coordinate polling.
- **Layer Z-Fighting:** Resolved visual artifacting between overlapping global and selected history trails.
- **React Hook Errors:** Corrected import scopes to resolve `ReferenceError` during rapid selection updates.

## [0.6.1] - 2026-02-17

### Added

- **Live Search Tracking:** Search results now refresh every 2 seconds to show real-time Lat/Lon coordinates for moving entities.
- **FE-06** | Track Summary | Frontend | **DONE**. Real-time AIR/SEA/ORBITAL counts with color-coded indicators.

### Changed

- **Tactical Zoom Defaults:**
  - Search Result Zoom: Adjusted from 14 to **12**.
  - Intel Stream Zoom: Adjusted from 14 to **12**.
- **Entity Selection:** Standardized selection handlers to strictly disable "Follow Mode" effectively when context switching.

### Fixed

- **Follow Mode:**
  - **Soft Lock Fix:** Fixed "soft lock" issues where manual interaction wouldn't reliably break the camera lock.
  - **Easing Conflict:** Restored `isEasing` checks to prevent camera conflicts during fly-to operations.
  - **Grace Period:** Increased grace period to 3s to improve lock-on reliability for distant targets.

## [0.6.0] - 2026-02-17

### Added

- **Projective Velocity Blending (PVB):**
  - **Rendering Engine Upgrade:** Replaced legacy dead reckoning with a physics-based velocity projection system.
  - **Zero Rubber-Banding:** Algorithms now project _forward_ from the last known visual state, eliminating backward correction jumps.
  - **Smooth Transitions:** 3-step interpolation (Server Projection -> Client Projection -> Blend) ensures fluid motion for high-speed assets.

### Changed

- **Performance Tuning:**
  - **Animation Loop:** Optimized `TacticalMap` render loop to use refs, eliminating ~30Hz cleanup/setup cycles during selection updates.
  - **Backend Arbitration:**
    - Reduced `ARBI_MIN_DELTA_S` from 0.8s to 0.5s for lower latency.
    - Added 30m spatial bypass to instantly capture fast maneuvers (high-G turns) that would otherwise be rate-limited.

### Fixed

- **Motion Artifacts:**
  - Fixed "backward snapping" when new packets arrived with slightly older timestamps or different latency profiles.
  - Fixed stationary entity drift by implementing strict speed clamping (< 0.5 m/s).

## [0.5.0] - 2026-02-16

### Added

- **Historian Service (Backend):**
  - **TimescaleDB Integration:** Persistent storage for all Kafka track messages.
  - **Search API:** `GET /api/tracks/search` for fuzzy-finding entities by callsign/Hex/Type.
  - **Replay API:** `GET /api/tracks/replay` for retrieving historical track segments.
  - **Batch Ingestion:** Robust protobuf decoding and batch writing to DB.
- **Frontend Interaction Suite:**
  - **Search Widget:** Sidebar component for searching live and historical entities.
  - **Replay System:** "Time Travel" controls to playback historical situations (1h, 6h, 12h, 24h windows).
  - **Follow Mode:** "Center View" functionality to lock camera on a moving target.
  - **Live Updates:** Real-time property updates for selected entities in the sidebar.
  - **Unified 3D Centering:** Implemented `getCompensatedCenter` to ensure the camera focus remains on the aircraft chevron rather than the ground, accounting for pitch and altitude.
- **Synchronized Telemetry:** Sidebar numbers now update at 30Hz in perfect lockstep with the map's interpolated camera movement.
- **Intelligent Zoom Defaults:** The "Center" action now uses **Zoom 12** as its tactical default and respects manual zoom levels within the 12-18 range.

### Changed

- **Follow Mode Refinement:** Reduced centering flight duration to 1.0s for faster target acquisition.
- **Tracking Stability:** Removed random throttle from selected entity updates and refined interaction checks to prevent drift.

### Fixed

- **Critical Stability:**
  - **ADSB Poller:** Fixed crash loop caused by malformed Airport OPS messages.
  - **Mission Radius:** Fixed custom coverage radius resetting to default on reload.
  - **App Props:** Removed duplicate React props causing build warnings.
- **UI/UX:**
  - **Replay Controls:** Compacted UI to prevent obscuring the map.
  - **Follow Mode:** Fixed "rubber-banding" and loop errors in camera logic.
  - **Trail Sync:** Fixed "disconnected tail" artifacts during high-speed movement.

### Known Issues

- **CoT Tracking:** Native Cursor-on-Target tracking is currently non-functional (scheduled for future fix).
- **Jitter/Rubber-Banding:** Small occurrences of "rubber-banding" observed on certain ADSB CoT feeds; investigation ongoing.

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

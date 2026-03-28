# Changelog

## [0.55.1] - 2026-03-28

### Fixed

- **Frontend TypeScript Smoke Failure**: Extended `InfraProperties` to inherit `Partial<NDBCBuoyProperties>` so buoy fields (`buoy_id`, `wvht_m`, `wtmp_c`, `wspd_ms`, `wdir_deg`, `atmp_c`, `pres_hpa`) are properly typed and `tsc --noEmit` passes cleanly.

## [0.55.0] - 2026-03-28

### Added

- **NDBC Ocean Buoy Ingestion Loop**: Added a new infra poller loop that ingests NOAA NDBC latest observations on a 15-minute cadence with ETag-aware fetch behavior.
- **NDBC Parsing and Validation Pipeline**: Added `parse_ndbc_latest_obs()` plus strict coordinate and missing-field guards for robust parsing of space-delimited NDBC payloads.
- **Buoy API Surface**: Added `/api/buoys/latest` with dual-path delivery: Redis fast-path for world views and bbox-scoped PostGIS query path for viewport requests.
- **Buoy Geospatial Layer**: Added a Deck.gl Scatterplot buoy layer with wave-height radius encoding, water-temperature color ramp, hover telemetry, and click-through sidebar integration.
- **Buoy Frontend Data Hook**: Added `useNDBCBuoys()` with 500ms viewport debounce and 15-minute refresh to align with poll cadence.
- **Buoy UI Controls and Views**: Added map filter support (`showBuoys`), Environmental layer integration, buoy-specific tooltip routing, and buoy right-sidebar telemetry cards.
- **NDBC Unit Tests**: Added parser test coverage for headers, invalid rows, missing measurements, coordinate bounds, and field extraction edge cases.

### Changed

- **Infra Hover Routing**: Extended infra hover classification to include buoy entities so buoy IDs and telemetry flow correctly into tooltip and sidebar surfaces.
- **Buoy Interaction UX**: Updated buoy hover-clear behavior to prevent sticky tooltip state when cursor exits buoy marks.
- **Buoy Render Baseline**: Tuned buoy marker minimum screen footprint for reliable visibility across zoom levels.

### Fixed

- **Buoy Tooltip Misclassification**: Fixed map tooltip fallback behavior that could label buoy hovers as avionics.
- **Buoy Sidebar Data Density**: Fixed sparse buoy detail cards by exposing collected oceanographic measurements directly in the right sidebar.

### Technical Details

- New `ndbc_obs` hypertable supports upserted buoy observations with deduplication via conflict handling.
- Added hypertable lifecycle policies: 1-day chunking, compression, and 30-day retention.
- Added `ndbc_hourly_baseline` continuous aggregate to support Phase 3 Z-score-style anomaly workflows.
- Latest-observation viewport queries use station-level latest-row selection semantics and recent-time windows.

## [0.54.0] - 2026-03-28

### Added

- **Mini Tactical Hazard Overlays**: Added live GPS integrity and holding-pattern overlays to the Tactical Overview mini-map, including a compact hazard legend with critical-hold count indicators.
- **Holding Severity UX Parity**: Added severity badges and severity metadata to both the Holding sidebar view and tactical map tooltip so operator context is consistent across surfaces.

### Changed

- **Holding Detection Policy Tightening**: Upgraded the aviation holding detector to stricter defaults with bounded env-config parsing, directional consistency scoring, and duration gating to reduce ambiguous detections.
- **Holding Alert Routing**: Reworked hold event routing so non-critical detections are sent to Intel Feed while critical patterns remain alert-channel events.
- **Hazards Control Visual Language**: Updated Hazards top-level control styling from purple to amber to align with tactical hazard semantics.
- **GPS Integrity Zone Readability**: Reduced jamming zone radii in map rendering for less visual clutter at mission zoom levels.
- **News Feed Source Set Refresh**: Updated default RSS source set to BBC World, Reddit News, and Al Jazeera for broader and more reliable feed coverage.

### Fixed

- **Holding Pattern False Positives**: Tightened detector gating to require a full-turn threshold (`360°`), sustained circling duration, and directional consistency, and corrected rolling-window turn recomputation so stale turns no longer inflate current detections.
- **Holding Pattern Test Reliability**: Updated OpenSky limiter test fixtures to match separate bbox/watchlist limiter internals and restored full aviation poller test pass.
- **Holding Tooltip Runtime Fault**: Fixed tooltip severity initialization ordering that could trigger runtime errors when rendering holding entities.

### Technical Details

- New holding detector knobs include directional consistency minimums and stricter minimum pattern duration thresholds with explicit env clamping.
- `buildHoldingPatternLayer` now maps `turns_completed` to amber/orange/red ramp with `>=5` turns rendered as red critical severity.
- `MiniMap` now polls `/api/jamming/active` and `/api/holding-patterns/active` every 30s and renders overlay sources/layers locally for tactical overview parity.
- Holding API documentation now includes `directional_consistency` in response property definitions.

## [0.53.0] - 2026-03-28

### Added

- **App.tsx Domain Hook Extraction**: Broke the former monolithic `App.tsx` into cohesive state hooks: `useViewMode`, `useSidebarState`, `useIntelEvents`, `useAppFilters`, `useEntitySelection`, and `useReplayController`.
- **Holding Pattern Layer Toggle**: Added a dedicated holding-pattern visibility toggle in Layer Visibility Controls alongside Aurora and GPS Integrity Zones.

### Changed

- **App Shell Maintainability**: Reduced `App.tsx` from 1,140 lines to 594 lines by moving domain logic into focused hooks with clearer responsibilities and state boundaries.
- **Layer Taxonomy Rename**: Renamed the map layer category from "Environmental" to "Hazards" and aligned internal naming (`envIsOn`/`envExpanded`/`toggleEnv` to hazard equivalents), UI copy, and ARIA labels.
- **Holding Patterns Default Visibility**: Added `showHoldingPatterns: true` to `DEFAULT_FILTERS` so behavior is explicitly enabled by default.
- **Refactor Tracking**: Updated `agent_docs/frontend-refactoring-report.md` to mark the `App.tsx` extraction milestone as complete.
- **Situational Globe Spin Calibration**: Set the default globe auto-rotation speed to the preferred slower baseline equivalent to the previous 25% control setting.

### Fixed

- **Holding Pattern Alert Spam**: Changed deduplication key from `${hex_id}-${p.time}` to `hex_id` so each circling aircraft triggers a single alert per `seenHoldingRef` session window.

### Technical Details

- `useViewMode`: View mode state with localStorage persistence.
- `useSidebarState`: Open/close orchestration for all five overlay panels.
- `useIntelEvents`: Event feed management with throttled `addEvent` and hourly cleanup.
- `useAppFilters`: Filter persistence, hash synchronization, and computed domain filters (`orbitalFilters`, `tacticalFilters`, `activeServices`, `rfParams`).
- `useEntitySelection`: Selection/follow/history behavior including NORAD resolution and live update callbacks.
- `useReplayController`: Replay loading, binary-search frame lookup, and rAF playback loop.
- `useAnimationLoop` performance path now uses a stable `onHover` callback reference and caches `Array.from(js8StationsRef.current.values())` behind a size change check.

## [0.52.0] - 2026-03-27

### Added

- **AI Analyst Panel Overhaul**: Implemented "Tactical Premium" UI/UX with glassmorphism, CRT-style scanlines, and a dynamic radar-style "Awaiting Tasking" animation.
- **Maneuver Mode Integration**: Consolidated "Tactical", "OSINT", and "SAR" selectors into a high-fidelity tabbed interface in the Analyst Panel's footer.
- **Unified Control Bar**: Merged Scan Window (Lookback) and Execution (Run/Halt) controls into a unified tactical control bar for better visual hierarchy.
- **Animated View Transitions**: Upgraded all Right Sidebar views (Aircraft, Ship, Satellite, Infra, GDELT, Holding) with an animated rotating close button and refined hover interactions.
- **Holding Pattern Visualization**: Introduced a new `HoldingPatternLayer` using Deck.gl to render amber-pulsed tactical zones for non-standard flight maneuvers detected by the ADSB poller.
- **Health history sparklines**: Added a Redis-backed 12-minute bitmask history for system poller health indicators, providing immediate diagnostic context for connectivity issues.

### Changed

- **Intel Globe Unification**: Consolidated Intel Map controls (style, projection, spin) into the shared `MapControls` HUD and refactored `IntelGlobe` for imperative 60FPS rotation via `map.jumpTo()`.
- **Strategic SITREP Logic**: Refactored situational context transmission to support high-density strategic reporting across disparate OSINT sources (GDELT, Infrastructure, etc.).
- **Map Interaction Refinement**: Silenced the standard right sidebar for 'sitrep' entities to favor the dedicated Strategic Intelligence Report panel.

### Fixed

- **Analysis Engine Hardening**: Resolved a critical 500 error regression caused by undecoded Redis data (bytes vs string) during model selection.
- **Telemetry Resolution Reliability**: Added defensive guarding for "orphaned" tracks in the analyst backend, ensuring graceful failures instead of server crashes when metadata is missing.
- **Rotation Jitter**: Eliminated frame-stutter on global planetary globes by moving to an imperative animation loop that bypasses React re-render overhead.

### Technical Details

- Canonical poller IDs (`adsb`, `maritime`, etc.) unified across Historian, Health, and Throughput APIs.
- Environment variable support (`HOLDING_RADIUS_NM`, etc.) added to `docker-compose.yml` for runtime threshold adjustment.
- Deck.gl layer composition updated to support reactive GeoJSON refs for low-latency tactical overlays.

## [0.51.0] - 2026-03-26

### Added

- **`useMapBase` Shared Hook**: Centralized map initialization and state management across Tactical, Orbital, and Intel views. Supports dynamic adapter selection (MapLibre/Mapbox), style resolution, and URL hash synchronization.
- **`MapControls` Shared Component**: A unified, stateless bottom-center HUD for map interactions (zoom, projection, globe toggle, style picker).
- **Centralized Map Styles**: Extracted map style constants and lazy-loaded adapters into `mapStyles.ts` for improved consistency and reduced bundle bloat.

### Changed

- **Map Component Refactoring**: TacticalMap and OrbitalMap now consume `useMapBase` and `MapControls`, eliminating ~220 lines of duplicated boilerplate per component.
- **IntelGlobe Performance Optimization**: Refactored the animation loop to use an inline ref-sync pattern, eliminating 60 React `setState` calls per second and improving rendering stability.
- **Animation Loop Robustness**: Updated `useAnimationLoop` with ref-sync for all volatile props, ensuring the stable rAF loop always reads the latest values without effect restarts.
- **Interpolation Refinement**: Added `baseAlpha` support to `interpolation.ts` and `EntityPositionInterpolator.ts` for improved satellite alpha blending on satellite imagery.

### Technical Details

- Map adapter selection is now reactive to the presence of a valid Mapbox token.
- URL hash synchronization is standardized across all mapping views for consistent sharing of coordinates and zoom levels.
- Ref-sync pattern in `useAnimationLoop` decouples React render cycles from high-frequency WebGL updates.

## [0.50.0] - 2026-03-26

### Added

- **Interactive Dashboard MVP**: Introduced a low-latency, high-performance system monitoring interface accessible via the `/stats` route.
- **Tactical Alert System**: Reactive notification badge in the header that monitors terminal logs for `[WARN]` entries, providing real-time situational awareness.
- **Collapsible Log Terminal**: Interactive command log bar with state-driven height transitions, default-collapsed startup, and auto-scroll behavior.
- **Dedicated Networking Tab**: Consolidated all high-bandwidth telemetry and throughput charts into a focused networking view.
- **Batched Telemetry API**: New `/api/stats` FastAPI router providing moving window aggregations (15-minute buckets) from TimescaleDB to reduce front-end processing load.
- **ECharts Visualization**: Integrated Apache ECharts for rendering real-time signal activity across Aviation, Maritime, and Orbital domains with interactive legend and tooltip support.
- **Container Health Monitoring**: Dedicated sidebar list with status ribbons and uptime pips, providing high-density tactical tracking of all system pollers.
- **Lazy-Loaded Routing**: Implemented React route split using `React.lazy` and `Suspense` for the Dashboard, ensuring the primary Tactical HUD remains lightweight.
- **CSV Payload Export**: Added client-side CSV export functionality for all batched telemetry data.

### Changed

- **Frontend Navigation Architecture**: Refactored `main.tsx` into a lazy-loaded root orchestrator and replaced fixed-positioning hacks with native flexbox flow to resolve 'ghost footer' anomalies.
- **Signal Activity Chart FIDELITY**: Removed cumulative data stacking in Apache ECharts to ensure global activity trends accurately reflect per-domain throughput rather than mirrored sums.
- **Tactical UI De-cluttering**: Removed inactive 'Support', 'Lockdown', and 'Network Logs' links, and deprecated the legacy floating terminal bubble to maximize screen real estate.

### Fixed

- **Telemetry 'Cliff' Effect**: Added server-side filtering to `/api/stats/activity` to exclude the current, incomplete 15-minute time bucket, ensuring charts no longer crash to zero at the rightmost edge.
- **Dashboard Layout Drift**: Resolved a 64px offset issue caused by fixed-header padding-top, pinning the tactical terminal perfectly to the bottom of the viewport.
- **Entity Identity Synchronization**: Updated poller health displays and dashboard node status to accurately reflect user-defined node identifiers (`NODE-01`).

### Technical Details

- Telemetry aggregation uses TimescaleDB `time_bucket` on the `tracks` hypertable via a 24-hour moving window.
- Dashboard assets are code-split into a separate JavaScript chunk, loaded only when accessing `window.location.pathname === '/stats'`.

---

## [0.49.0] - 2026-03-25

### Added

- **Intel Render Mode Switching**: Added persistent Intel 2D/3D render mode controls with MapLibre projection switching and UX parity behavior.
- **Intel In-Map Control Parity**: Intel now mirrors Tactical/Orbital bottom-center control composition (projection, globe toggle, style segment, zoom cluster).
- **Intel Arc Visual Clarity Enhancements**: Introduced segmented 3D arc rendering with endpoint emphasis and improved directional readability.
- **Intel Task Documentation Set**: Added task logs in `agent_docs/tasks/` covering Cesium gating, MapLibre restoration, API compatibility fixes, and Intel UI parity work.

### Changed

- **Intel Globe Architecture**: Standardized Intel on a MapLibre-backed rendering path and removed Cesium-specific map path branching.
- **Intel Style Set Simplification**: Reduced Intel map style options to focused operational presets (`dark`, `debug`) for more consistent operator workflows.
- **MapLibre Compatibility Handling**: Updated globe atmosphere/fog handling to support MapLibre API differences across versions.
- **Country Heat Depth Ordering**: Tuned globe depth bias so heat tint remains behind Intel icon/text overlays.

### Fixed

- **MapLibre Globe API Mismatch**: Fixed runtime compatibility issue where `setFog` was not always available by using guarded fallback logic.
- **Intel Globe Blank/Degraded Rendering Cases**: Resolved Cesium-path regressions and restore issues by consolidating to MapLibre globe behavior.
- **Intel Control Divergence**: Removed Intel-only control variance and aligned interaction affordances with Tactical/Orbital for consistent operator muscle memory.

### Removed

- **Cesium Intel Renderer Path**: Deleted `frontend/src/components/map/CesiumIntelGlobe.tsx` and removed associated build/config gating from active frontend flow.

### Technical Details

- Intel globe now uses imperative Deck overlay updates (`MapboxOverlay.setProps`) with MapLibre projection control.
- Globe-specific style hygiene includes label layer stripping for reduced map clutter in Intel mode.
- Arc and heat layers received depth/ordering refinements to improve near-surface readability on globe projection.

## [0.48.0] - 2026-03-25

### Added

- **GPS Integrity Jamming Detection Sidebar**: New right-sidebar `JammingView` component for deep analysis of detected GPS integrity zones, including confidence trends and affected track counts.
- **Jamming Confidence Sparkline**: Added confidence trend visualization in jamming detail view with 24-hour history filtering and trend delta calculation.
- **Jamming AI Analysis Context**: Extended analysis router with Redis-backed fallback for `jamming-<h3>` entities, enabling AI analyst processing of GPS integrity detections.
- **Jamming Layer Visibility Controls**: Exposed GPS Integrity Zones toggles in both tactical environmental controls and orbital quick-filter pills, with default display support.
- **Poller Health Endpoint (`/api/config/poller-health`)**: New backend endpoint providing real-time operational health for 12 poller types across 5 categories (Tracking, Orbital, Environment, Intel, RF, Infrastructure) with stale-detection and credential validation.
- **System Health Display**: Enhanced `SystemHealthWidget` to show per-poller status indicators (healthy, stale, error, no-credentials, pending) with human-readable timestamps.
- **Entity Processing Engines**: Extracted animation loop concerns into dedicated modules: `EntityFilterEngine.ts` for live filtering/staleness, `EntityPositionInterpolator.ts` for satellite frame processing.
- **Layer Visibility Controls Component**: Extracted tactical map layer toggles into `LayerVisibilityControls.tsx` for improved maintainability.
- **OpenSky Watchlist Rate Limiting**: Added separate `OPENSKY_WATCHLIST_RATE_LIMIT_PERIOD` environment variable to decouple watchlist query pacing from bbox queries for independent testing.
- **Retry-After Header Handling**: OpenSky client now parses and honors OpenSky's `Retry-After` response header (RFC 7231) for rate-limit compliance.
- **Poller Error Tracking**: All ingestion pollers now log errors to Redis with throttled heartbeat writes (30s minimum interval) for health monitoring.

### Changed

- **OpenSky Client Architecture**: Refactored `OpenSkyClient` to use separate `AsyncLimiter` instances for bbox and watchlist queries, enabling independent rate-limit testing.
- **System Status Widget**: Refactored into focused orchestration layer (`SystemStatus.tsx`) with delegated responsibilities to `LayerVisibilityControls.tsx`, `IntegrationStatus.tsx`.
- **Entity Filter Pipeline**: Consolidated entity filtering logic into `EntityFilterEngine` for consistent staleness checks and interpolation across all entity types.
- **Intelligence Feed Rendering**: Implemented 1-second per-category throttle for feed events with critical alerts bypassing throttle for operational visibility.
- **Search Widget Accessibility**: Improved input labeling and clear-action semantics in `SearchWidget.tsx`.

### Fixed

- **OpenSky Cooldown Escalation**: Fixed penalty state tracking to escalate cooldown window when repeated 429 responses occur after previous cooldown expires (prevents hammering during sustained rate limiting).
- **System Health Widget Clipping**: Resolved overflow and visual clipping issues in `SystemHealthWidget` health list rendering.
- **Trail Smoothing TypeScript**: Resolved type-inference regression in trail smoothing utility (`trailSmoothing.ts`).
- **Filter Coverage Consistency**: Brought all filter presets (Orbital Only, Map Layers, Clear All) into alignment by including orbital-related flags (`showSatNOGS`, `showH3Coverage`, `showTerminator`).

### Technical Details

- Jamming detection now generates entity records eligible for AI analysis without manual synthesis by querying Redis active zones.
- Poller health monitoring validates both Redis state (last fetch times) and environment credentials; stale thresholds vary by data source (5 min for real-time, 30 days for reference).
- OpenSky separate limiters share the same OAuth2 token and cooldown state but allow independent rate-limit testing (e.g., bbox @ 22s, watchlist @ 120s for testing).
- Entity processing engines improve code organization and testability by separating animation loop concerns from main render pipeline.
- All error logging follows consistent key naming pattern (`<poller>:error`) for centralized health monitoring.

### Dependencies

- Dependency audit tool (`tools/audit-deps.sh`) now standard for all CI security checks; scans 6 Python projects via uv and 1 JavaScript project via pnpm audit.
- Frontend pnpm overrides pin vulnerable dependencies (flatted, fast-xml-parser) to known-safe versions.

## [0.47.2] - 2026-03-24

### Added

- **Filter Preset Expansion**: Added two new System Settings quick presets in `frontend/src/components/widgets/FilterPresets.tsx`: **Orbital Only** and **Map Layers**.
- **Listening Post Modular Assets**: Added `frontend/src/components/js8call/kiwi/RadioModeConfig.ts` and `frontend/src/components/js8call/kiwi/WaterfallColorMaps.ts` to isolate mode/waterfall configuration.
- **Watchlist State Management**: Added `frontend/src/hooks/useWatchlist.ts` and `frontend/src/components/widgets/WatchlistManager.tsx` to separate watchlist behavior from monolithic settings rendering.

### Changed

- **System Settings Architecture**: Refactored `frontend/src/components/widgets/SystemSettingsWidget.tsx` into a slimmer orchestration layer by delegating watchlist and preset responsibilities to focused modules.
- **Listening Post Composition**: Refactored `frontend/src/components/js8call/ListeningPost.tsx` to consume extracted KiwiSDR configuration modules.
- **Search Widget Accessibility**: Improved search semantics with explicit input labeling and clearer action accessibility in `frontend/src/components/widgets/SearchWidget.tsx`.

### Fixed

- **Filter Coverage Consistency**: Included previously unmanaged orbital-related flags (`showSatNOGS`, `showH3Coverage`, `showTerminator`) in preset management so "Clear All" and preset application paths remain coherent.

## [0.47.1] - 2026-03-24

### Added

- **Alert Engine Modules**: Added domain-specific alert engines in `frontend/src/alerts/` for aviation emergency squawk and maritime distress-state detection with consistent alert message composition.
- **Event Filter Modules**: Added reusable event filter utilities in `frontend/src/filters/` for aviation, maritime, and orbital feed filtering paths.
- **Dashboard Widget Components**: Added extracted widget components in `frontend/src/components/widgets/` (`MiniMap`, `StreamStatusMonitor`, `OutageAlertPanel`, `RFSiteSearchPanel`, `TrackSparkline`) to isolate UI concerns.
- **Worker/Utility Modules**: Added `frontend/src/workers/WorkerProtocol.ts`, `frontend/src/utils/trailSmoothing.ts`, and `frontend/src/utils/EventCategorizer.ts` to centralize worker lifecycle, trail smoothing, and event styling logic.

### Changed

- **Entity Worker Architecture**: Refactored `frontend/src/hooks/useEntityWorker.ts` to import alert engines, trail smoothing, and worker protocol helpers instead of maintaining inline implementations.
- **Logic Drift Risk in Duplicated Paths**: Reduced risk of behavioral drift and inconsistent emergency/distress handling by consolidating previously duplicated inline logic into single-source modules.

## [0.47.0] - 2026-03-24

### Added
- **Intelligence Feed Throttling**: Implemented a 1-second rate-limiting throttle for 'new' and 'lost' entity events in `App.tsx` to reduce visual noise during high-traffic periods, while ensuring critical alerts remain immediate.
- **Orbital Assets Theming**: Updated `PassPredictorWidget` and the dashboard orbital passes grid to use a unified purple color theme (`text-purple-400`, etc.) for intelligence-related satellites.

### Changed

- **Global Situation View**: Removed country and place labels from the Global Situation globe for a cleaner, purely tactical overview focused on infrastructure and sensors.

### Fixed

- **Dashboard UI Corruption**: Resolved JSX syntax errors and component fragmentation in the dashboard's orbital pass elements resulting from the theming transition.

## [0.46.4] - 2026-03-23

### Added

- **Local CI Dry-Run Helper**: Added `tools/run-ci-checks.ps1` to run workflow-equivalent checks locally (all jobs, selected jobs, or changed-file-derived jobs), with optional dependency installation and pass/fail summary output.
- **Tooling Documentation**: Added `tools/README.md` and integrated the CI dry-run workflow into the development guide for faster pre-push validation.

### Changed

- **Agent/Developer Execution Policy**: Standardized guidance to **host-first** for lint/tests/static analysis and **docker-first** for runtime/parity checks, while keeping ingestion runtime changes container-rebuild-required.
- **Dev Environment Standardization**: Updated active docs and agent guidance to align on `pyproject.toml` + `uv.lock` dependency management and Ruff-based Python tooling.
- **VS Code Workspace Settings**: Aligned settings for Pylance + Ruff workflows and modernized JS/TS SDK setting keys.

### Fixed

- **CI Workflow Dependency Gaps**: Added missing test dependencies in `.github/workflows/ci.yml` (including `uvicorn`, `pyyaml`, `protobuf`, and poller-specific runtime libs such as `aiohttp`/`psycopg2-binary`) so job environments match test imports.
- **JS8Call Test Stability**: Removed manual network exploration scripts from pytest discovery by renaming them out of `test_*.py`, preventing collection-time external HTTP/WebSocket failures.
- **Backend API Test Import Robustness**: Hardened dependency stubs in API tests so collection is resilient in lightweight local environments.
- **Poller Test Compatibility**: Updated async test helpers (`rf_pulse` and `gdelt_pulse`) for Python 3.14 event-loop behavior (`asyncio.run`), eliminating `no current event loop` failures.

## [0.46.3] - 2026-03-23

### Added

- **SidebarRight View Modules**: Added focused domain view components under `frontend/src/components/layouts/sidebar-right/` (`JS8View`, `RepeaterView`, `TowerView`, `InfraView`, `GdeltView`, `SatelliteView`, `ShipView`, `AircraftView`).
- **Shared Sidebar Types**: Added `frontend/src/components/layouts/sidebar-right/types.ts` with shared contracts (`BaseViewProps`, `SatelliteViewProps`, `AircraftViewProps`, `InfraDetail`, `InfraProperties`).

### Changed

- **SidebarRight Architecture**: Converted `SidebarRight.tsx` into a lightweight orchestrator that routes by `entity.type` and renders each view with `key={entity.uid}` for deterministic local state reset.

### Fixed

- **GDELT Actor1 API Omission**: Restored missing `actor1` in GeoJSON properties returned by `backend/api/routers/gdelt.py`.
- **GDELT Actor1 Frontend Mapping**: Added `actor1` to GDELT layer interfaces and feature-to-point mapping in `frontend/src/layers/buildGdeltLayer.ts`.
- **Tooltip Goldstein/Tone Mismatch**: Corrected GDELT tooltip `TONE (GS)`/`STATUS` logic in `frontend/src/components/map/MapTooltip.tsx` to use `goldstein` thresholds (with `?? 0` fallback), aligning displayed status with map color encoding.

## [0.46.2] - 2026-03-22

### Added

- **GDELT Enrichment Pipeline**: Expanded GDELT ingestion/storage/API/frontend contracts to carry actor, country, event class, and media-intensity metadata end-to-end.
- **GDELT Analyst Fallback**: Added direct GDELT event fallback and geopolitical persona/context enrichment for Analyst mode when `gdelt-*` entities are selected.
- **Domain Label Toggle**: Added independent UI toggle for GDELT domain tags in the Global Event Tracking control.

### Changed

- **GDELT UID Stability**: Replaced headline-derived identifiers with `event_id`-based UIDs across composition/layer selection paths.
- **GDELT Label Rendering**: Improved domain tag readability, guarded malformed numeric host artifacts, and defaulted label rendering to OFF.
- **GDELT Schema Parsing**: Updated poller SOURCEURL handling to follow the current feed shape using last-column extraction to tolerate upstream column drift.

### Fixed

- **Sidebar Source Crash**: Prevented empty/malformed GDELT source links from opening invalid local URLs by adding explicit URL validation and disabled fallback state.
- **Historian Insert Typing**: Fixed GDELT `event_date` SQL type inference failure in historian upsert path.
- **Missing GDELT Columns**: Added/validated migrations for enriched fields in `gdelt_events`, eliminating runtime API query failures.
- **Domain Tag Artifacting**: Removed floating/blank tag boxes caused by malformed domain values and invalid URL extraction.

## [0.46.1] - 2026-03-22

### Changed

- **Frontend Verification Workflow**: Added a dedicated TypeScript compiler gate to frontend scripts (`typecheck`) and a combined verification command (`verify`) so lint and type safety are validated together.
- **Type Contracts Hardened**: Tightened runtime/compile-time boundaries across map callbacks, websocket payload handling, GeoJSON ingestion fallbacks, and deck.gl layer builders.

### Fixed

- **TypeScript Stability Sweep (Bug Squash)**: Resolved compiler diagnostics across tactical/orbital map components, infrastructure tooltip rendering, JS8 status ingestion, replay utilities, and layer composition typing.
- **Map Event Handling Robustness**: Added safe unknown-event narrowing in map adapters and move/load handlers to prevent property access regressions.
- **Deck Layer Accessor Compatibility**: Corrected path/polygon accessor and pick-info typing mismatches for deck.gl v9 strict type definitions.

## [0.46.0] - 2026-03-22

### Added

- **GEODENT (GDELT Pulse) Integration**: Full implementation of the OSINT data pipe for real-time global event tracking.
  - **Ingestion Poller**: High-concurrency GDELT 2.0 pulse service extracting events via rolling 15-minute windows.
  - **Intelligence Stream Support**: Real-time fusion of OSINT headlines with tactical tracks (Aviation/Maritime) in the right sidebar.
  - **Dashboard Analytics**: Integrated Goldstein Scale (stability impact) and Average Tone metrics for global situational awareness.
- **Orbital Map Refinements**:
  - **Polar Plot HUD**: Repositioned and synchronized the orbital pass geometry widget for improved visual alignment in the HUD stack.
  - **Layout Optimization**: Repositioned Space Weather and Pass Geometry widgets to eliminate overlap and provide a cleaner vertical stack on the right sidebar.

### Changed

- **Documentation Standard**: Standardized documentation across `README.md`, `Configuration.md`, and `UI_Guide.md` to support the GEODENT data pipe.
- **Terminator State**: Enabled the day/night terminator toggle by default across all map projections for improved temporal awareness.

### Fixed

- **OrbitalMap Stabilization**: Resolved multiple TypeScript and syntax errors in `OrbitalMap.tsx`, ensuring proper event handling and camera synchronization.
- **Map Adapter Resilience**: Fixed Deck.gl and MapLibre compatibility issues related to WebGPU/WebGL2 feature detection and property access.

## [0.45.0] - 2026-03-22

### Added

- **JS8Call Radio Service**: Integrated a dedicated microservice for HF radio intelligence.
  - **Headless Terminal**: Python-based runner for headless JS8Call support via virtual audio routing.
  - **KiwiSDR Audio Bridge**: Automated audio ingestion from global WikiSDR nodes for remote signal processing.
  - **Tactical Terminal UI**: High-fidelity React terminal component for real-time monitoring and GhostNet participation.
  - **UDP Control Bridge**: Synchronized frequency and status between the frontend and the underlying JS8Call instance.
- **Space Pulse Unified Ingestion**: Expanded the orbital tracker into a comprehensive Space Domain situational awareness suite.
  - **SatNOGS Integration**: Cross-referencing mission telemetry with SatNOGS ground station observations.
  - **Space Weather Monitor**: Real-time tracking of Aurora GeoJSON and Kp-index risk metrics directly on the tactical HUD.
- **Dynamic Documentation Suite**: Newly created `Space.md`and`JS8Call.md` guides covering detailed poller logic and integration instructions.

### Changed

- **Documentation Overhaul**: Synchronized `README.md`, `Deployment.md`, `Development.md`, and `Configuration.md` with the current service architecture.
- **Service Naming Standardization**: Migrated from `sovereign-orbital-pulse`to`sovereign-space-pulse` across all configurations and environment variables (`SPACE_TLE_FETCH_HOUR`).
- **Tactical Verification Logic**: Updated `AGENTS.md`and`.cursorrules` to implement targeted, component-specific verification to reduce development overhead.
- **Frontend Tooling**: Formalized `pnpm` as the primary package manager for all UI development tasks.

### Removed

- **Model Context Protocol (MCP) Support**: Decommissioned baked-in MCP server infrastructure, including wrappers, bridges, and isolated Docker services, to streamline the codebase.

## [0.44.0] - 2026-03-21

### Added

- **SatNOGS Integration**: Implemented deep integration with the SatNOGS network for enhanced satellite situational awareness.
  - **Transmitter Catalog**: Added `SatNOGSDBSource` to track expected satellite frequencies and modes.
  - **Ground Observation Tracking**: Added `SatNOGSNetworkSource` to pull live ground-station observations for spectrum verification.
  - **Verification API**: New backend endpoints for cross-referencing live telemetry with historical SatNOGS observations.
- **Orbital Pass Geometry HUD**: Introduced a high-fidelity floating polar plot for satellite overpasses.
  - **Real-time Visualization**: Displays current and projected satellite trajectories relative to the ground station.
  - **Metadata Integration**: Instant visibility of AOS (Acquisition of Signal), TCA (Time of Closest Approach), and Maximum Elevation in a single-line header.
  - **Next Pass Footer**: Dynamic countdown and parameters for the subsequent orbital pass.
- **Spectrum Verification Panel**: Dedicated UI for real-time frequency analysis and transmitter confirmation, relocated for better accessibility above Positional Telemetry in the right sidebar.

### Changed

- **Space-Pulse Consolidation**: Merged `orbital_pulse`, `space_weather_pulse`, and `SatNOGS`ingestion into a single, high-concurrency`SpacePulseService`, reducing operational overhead.
- **InfraPoller Modernization**: Full async rewrite of the infrastructure poller, migrating to `httpx`, `redis.asyncio`, and `asyncio.to_thread` for improved throughput and reliability.
- **UI Refinement**:
  - Moved the SatNOGS Network toggle to the `OrbitalCategoryPills` header for better functional grouping.
  - Centered the `KpIndexWidget`in the`TopBar` for improved visual balance between view modes and status monitors.
  - Themed the Pass Geometry and Space Weather widgets with `Sovereign Glass` aesthetics and domain-specific purple (`#a855f7`) accents.
  - Extract Spectrum Verification logic into a dedicated component for better maintainability.

## [0.43.2] - 2026-03-21

### Changed

- **UI Refinement**: Removed the global \`AIEngineWidget\` from the \`TopBar\` to declutter the interface, as AI functionality is now fully integrated into the Analyst Panel.
- **AI Analyst**: Disabled auto-run when launching the Analyst Panel. The AI will now enter a "READY FOR INPUT" state, waiting for manual interaction before executing a query.

## [0.43.1] - 2026-03-21

### Fixed

- **Aurora Visualization Distortion**: Fixed a critical rendering issue where NOAA aurora data points near the poles (beyond ±85° latitude) would render as giant screen-filling blobs in 2D Web Mercator mode. Points are now filtered out when not in Globe mode to maintain visual scale.

## [0.43.0] - 2026-03-21

### Added

- **Space Weather & Geomagnetic Intelligence**: Integrated the NOAA SWPC data streams for global situational awareness.
  - **Auroral Oval Visualization**: Added a real-time, 3D animated Auroral Oval layer to the Situation Globe and Orbital views, enabling live tracking of the Northern and Southern Lights.
  - **Kp-Index & Risk Metric**: Added a persistent, tactical `KpIndexWidget` to the main Top Bar, providing instant readings of the planetary K-index (Kp) and GPS degradation risks across all screens.
  - **Jamming Forecaster**: Introduced active RF jamming and GNSS degradation zones layered with the global atmospheric intelligence.

### Changed

- **Environmental Filter Suite**: Created a new centralized header toggle group for "ENV" (Environmental) filters, consolidating Space Weather layers alongside Global Network and RF infrastructure switches.
- **Orbital Map Interface**: Embedded Environmental filters directly into the Orbital view's object panel, sitting flush left of the total tracked object counts.

## [0.42.2] - 2026-03-21

### Changed

- **RF Mapping Refinement**: Removed clustering logic for RF sites, ensuring all sites render as individual points in both 2D and 3D views for maximum tactical granularity.
- **Global Network Layer Integration**: Synchronized the "FCC TOWERS" layer with the Global Network master toggle, allowing users to toggle cables, outages, and towers with a single click in the sidebar or header.

### Fixed

- **RF Service Filter Logic**: Resolved a bug where disabling all RF service sub-filters (Ham, NOAA, PSB) would default to displaying all repeaters; the layer now correctly clears when no filters are selected.
- **Tower Rendering Alignment**: Standardized `ScatterplotLayer`formatting in`buildTowerLayer.ts` to ensure consistent depth-testing and pickable properties.

## [0.42.1] - 2026-03-21

### Changed

- **Roadmap & Backlog Modernization**: Integrated strategic research findings for GDELT (Global Database of Events, Language, and Tone), SIGINT Jamming (ADS-B integrity analysis), and Space Weather (NOAA SWPC) into the technical roadmap.
- **Documentation Pruning**: Performed a massive cleanup of obsolete `agent_docs/tasks/archive/` files (over 17k lines removed) to reduce repository clutter and improve agent token efficiency.
- **Strategic Features Added to Backlog**:
  - GDELT Events Pulse (GeoJSON news mapping).
  - SIGINT Jamming Pipeline (NIC/NACp inference).
  - Space Weather Pulse (Kp-index/Auroral Oval).
  - Multi-INT HUD (Polymarket/News Grid/DEFCON).
  - RF Band Plan context (Offline SQLite lookup).

### Fixed

- **Roadmap Consistency**: Updated `COMPLETED_ARCHIVE.md` status for FCC Tower datasets and standardized task IDs across documentation.

## [0.42.0] - 2026-03-21

### Added

- **GhostNet v1.5 Operational Support**: Integrated full operational support for the GhostNet JS8Call network.
  - **Frequency Presets**: Added `GHOSTNET_FREQ_PRESETS` for weekly nets, data bridges, RTTY, and emergency voice.
  - **Group Targeting**: Added `GHOSTNET_GROUPS` (@GHOSTNET, @GSTFLASH, @ALLCALL) for rapid TX targeting and monitoring.
  - **Weekly Schedule**: Integrated the full weekly schedule with real-time active window highlighting and inline tuning.
- **RadioTerminal UI Enhancements**:
  - **Tabbed Sidebar**: Converted the right sidebar to a tabbed interface with "Heard" and "GhostNet" tabs.
  - **Quick-Select Toolbar**: Added frequency and group quick-select buttons with color-coded operational categories.
  - **Active Net Highlighting**: Implemented pulsing "ACTIVE" badges for live net windows based on current UTC time.
- **JS8Call Frequency Sync**: Added `RIG.SET_FREQ` UDP command support to keep JS8Call dial frequency in perfect sync with the KiwiSDR receiver.

### Changed

- **KiwiSDR Filter Widening**: Expanded USB passband (300–2700 Hz → 50–2800 Hz) to capture the full JS8Call audio spectrum and ensure maximum decode bandwidth.
- **Default TX Target**: Updated default transmit target to `@GHOSTNET` for immediate network readiness.

### Fixed

- **UI Cutoff Protection**: Implemented defensive padding in `ListeningPost`and`RadioTerminal` to prevent bottom controls from being clipped by system taskbars.
- **JS8Bridge Stability**: Resolved a critical missing `socket` import in the bridge server that caused UDP command failures.

## [0.41.4] - 2026-03-20

### Changed

- **RadioReference Dynamic Coverage**: Replaced hardcoded `_STATE_IDS`targeting the Pacific Northwest entirely. Utilizing a dynamic FIPS state coordinate mapping inside the ingest container,`RADIOREF_STATE_IDS="AUTO"` now naturally discovers boundaries that correlate to your active Area of Tactical Operations parameters (`CENTER_LAT`/`CENTER_LON`), pulling all required regional nodes gracefully.
- **RF Map Capacity**: Increased default spatial query limits on `/api/rf/sites` from 5,000 to 15,000 active nodes, preventing artificial circular rendering cutoffs within large AOR spheres.
- **Map Range Presets**: Adjusted bounding radius widget settings in `SystemStatus.tsx` to center closer to optimal visual rendering thresholds (150, 300, 600 NM) and removed the oversized 2000 NM filter constraint.

## [0.41.3] - 2026-03-20

### Changed

- **AI Analyst Theming**: Synchronized the property card `AnalysisWidget`button styling and the`AIAnalystPanel` modal to accurately inherit domain-specific accent colors (e.g., Orange for FCC Towers, Teal for Repeaters, Cyan for Infrastructure, and Indigo for JS8Call).

### Fixed

- **FCC Tower Ingestion Identifiers**: Resolved a bug in `infra_poller/main.py`where FCC tower parsing defaulted to the static row indicator`"REG"` instead of the Unique System Identifier (USI). This fix ensures metadata fields such as Owner and Elevation accurately map to their exact registered structure during database ingestion.

## [0.41.2] - 2026-03-22

### Fixed

- **FCC Tower Distribution**: Resolved an issue where tower scatter plots appeared in "patches" or "clusters" due to database physical storage order. By introducing a sort by random UUID and increasing the default budget to 10,000 points, the map now provides a representative geographic sample across the entire viewport.

## [0.41.1] - 2026-03-21

### Fixed

- **RadioReference Sync Deferral**: Resolved an issue where `RadioReference`sync was incorrectly deferred when`RF_RR_FETCH_HOUR`was set to`-1`. The poller now correctly bypasses hour gating when disabled.
- **FCC Download Resilience**: Improved `infra_poller`download logic for the FCC Antenna Structure Registration (ASR) dataset. Reduced chunk sizes from 8MB to 1MB and enabled progress logging at`INFO` level to provide better visibility during long-running downloads.

## [0.41.0] - 2026-03-20

### Added

- **AI Analyst Infrastructure Fallbacks**: Enabled analysis for satellites, towers, RF sites, and cables without track data by synthesizing a single-waypoint history from their static locations.
- **FCC High-Fidelity Data Enrichment**: Integrated three separate FCC datasets to populate previously missing `owner`, `height`, and `ground elevation` fields for over 195,000 antenna structures.
- **Immediate Sync support**: Added support for `POLL_FCC_START_HOUR=-1` to trigger immediate data refreshes during deployment or configuration.

### Changed

- **Docker Stack Harmonization**: Standardized all Docker service, container, network, and volume names with a persistent `sovereign-` prefix for simplified CLI management and resource tracking.
- **Frontend pnpm Standardization**: Formally adopted `pnpm`as the sole package manager for the React HUD, removing redundant`package-lock.json` files and improving build parity.
- **Environment Template Synchronization**: Updated `.env.example` to include missing variables for PostgreSQL database names and poll-timing for all ingestion services.

### Fixed

- **FCC Identity Persistence**: Switched the `infra_poller` join logic to use the Unique System Identifier (USI), resolving registration mapping inconsistencies across the FCC ASR schema.

## [0.40.1] - 2026-03-20

### Added

- **MCP Readiness Health Check**: Added `tools/mcp-language-server/check.sh`to verify host prerequisites (`bash`, Node/npm,`typescript-language-server`, `pyright-langserver`), pinned bridge binary presence, and Graph-it-Live entrypoint discovery with explicit remediation steps.
- **MCP Agent Efficiency Playbook**: Added `agent_docs/mcp-agent-playbook.md` with a token-efficient tool selection order (symbol tools first, file/dependency second, impact graph third, broad search last).

### Changed

- **MCP Runtime Wiring (Portability Pass)**:
  - Standardized `.mcp.json`to wrapper-based startup for`graph-it-live`, `pyright`, and `tsserver`.
  - Added `tools/mcp-language-server/run-graph-it-live.sh` for cross-host Graph-it-Live entrypoint resolution.
  - Simplified `run-pyright.sh`and`run-tsserver.sh` to local pinned bridge execution with deterministic repo-root resolution and explicit missing-binary guidance.
- **Verification Guidance Consolidation**:
  - Added a shared Verification Decision Gate in `AGENTS.md`and`CLAUDE.md` clarifying host-first inner-loop checks versus Docker-required parity checks.
  - Updated `Documentation/Development.md`MCP setup guidance to align with universal`bash` + wrapper workflow and readiness checks.

### Fixed

- **FCC Tower Interaction Semantics**:
  - Corrected tower hover/click normalization so FCC towers are no longer treated as generic undersea infrastructure.
  - Added dedicated tower tooltip/sidebar rendering paths with orange visual identity and FCC metadata (`fcc_id`, owner, tower type, status, height, elevation).
  - Preserved existing undersea cable and outage behavior while clearing tower hovers correctly as infrastructure-derived entities.

## [0.40.0] - 2026-03-20

### Added

- **FCC Infrastructure Ingestion (Development Preview)**: Integrated the FCC Antenna Structure Registration (ASR) dataset into the global infrastructure map.
  - **New Data Source**: High-fidelity ingestion of over 195,000 unique tower and antenna structures from the official FCC archive.
  - **Interactive Mapping**: Towers are rendered as interactive orange icons with detailed registration metadata and interactive tooltips.
  - **Filtering Support**: Added a dedicated "FCC TOWERS" toggle to the Map Layers panel under the "GLOBAL NETWORK" section.

### Changed

- **Infrastructure Polling Architecture**: Overhauled the `infra-poller` service with persistent, Redis-backed scheduling to improve performance and reduce upstream API load.
  - **Weekly Cooldowns**: Transitioned FCC Towers and Submarine Cable data to a strict 7-day synchronization interval, matching the update frequency of the source providers.
  - **Boot-Safe Persistence**: Polling timestamps are now stored in Redis, ensuring that service restarts do not trigger redundant multi-megabyte downloads if the data is already current.
  - **Transparent Logging**: Added startup diagnostics that calculate and log the exact time remaining until the next scheduled synchronization for each infrastructure set.
  - **Chunked Ingestion**: Implemented high-performance streaming for the FCC dataset (~37MB compressed) using temporary file buffers to prevent memory exhaustion in restricted container environments.

### Fixed

- **FCC Data Migration**: Resolved 404 errors by migrating the ingestion target from the deprecated `wireless2.fcc.gov`domain to the modern`data.fcc.gov` endpoint.
- **Coordinate Precision**: Implemented a new Degrees-Minutes-Seconds (DMS) parser to handle the FCC's separate-field coordinate schema, ensuring sub-meter mapping accuracy.
- **Rendering Z-Ordering**: Standardized tower depth testing and bias parameters to ensure markers render correctly in both 3D Mercator and Globe projections without flickering.

## [0.39.2] - 2026-03-20

### Fixed

- **RadioReference Data Fidelity**: Significant enhancement to the RadioReference ingestion pipeline, transitioning from coarse "Trunked System" centroids to precise "Trunked Site" tower locations and Conventional Frequencies.
  - **High-Resolution Mapping**: Fetches individual tower sites (`getTrsSites`) for all regional systems, increasing data density from ~130 systems to over 1,300 unique site/frequency assets in the Pacific Northwest.
  - **Metadata Enrichment**: Automated extraction of City, State, Output/Input Frequencies, and advanced digital Mode mapping (P25, DMR, etc.) for display in tooltips and sidebar.
  - **RepeaterBook & RadioRef Cooldown**: Implemented a Redis-backed fetch cooldown that persists across service restarts, reducing API key consumption by enforcing a configurable 1-week (168 hour) sync interval.
  - **Frontend Sync**: Bumped infrastructure cache version to force an immediate refresh of stale site data in the browser.

## [0.39.1] - 2026-03-19

### Fixed

- **RadioReference Ingestion**: Resolved a critical crash in the `rf_pulse` poller when RadioReference credentials were provided.
  - Fixed Zeep `TransportError`(HTTP 403) by explicitly injecting`SovereignWatch/1.0` User-Agent headers into both async and sync WSDL fetch contexts.
  - Removed calls to the deprecated `getAuthToken`method and appended`&v=9` to the WSDL URL to ensure access to the current API schema.
  - Stubbed out the hallucinated `getCountrySystemList`method to prevent unhandled`AttributeError` exceptions, stabilizing the poller while a proper trunked-system fetch strategy is designed.

## [0.39.0] - 2026-03-19

### Added

- **Global Watchlist Management**: Added watchlist functionality for tracking specific ICAO24s globally, bypassing spatial filters.
  - **Frontend UI**: Added a comprehensive watchlist management panel to `SystemSettingsWidget` with add/remove capability and visual indicators for permanent vs. expiring entries.
  - **Frontend API**: Created `watchlist.ts`API client for GET/POST/DELETE operations and integrated polling into the`useEntityWorker` hook matching a 30-second sync interval.
  - **Backend APIs**: Added three new REST endpoints to `system.py`: `GET /api/watchlist`to return active entries,`POST /api/watchlist`to add/refresh entries with optional TTL, and`DELETE /api/watchlist/{icao24}` to remove entries.
  - **Persistence**: Powered by a Redis sorted set (`opensky:watchlist`) using timestamps as scores, with a far-future sentinel value (01-Jan-3000) for permanent entries.

### Changed

- **UI Refinements**:
  - Moved the Track Log widget in the Right Sidebar to appear centrally before the Positional Telemetry section for improved visibility.
  - Ensured specific actions like the Track Log button are expressly hidden for maritime vessels (AIS) where log functions are unsupported.
  - Unified dynamic styling of the `CENTER_VIEW`/`TRACK_LOG`buttons and Compass widget to properly reflect physical agent colors (e.g.,`sea-accent` for ships).

## [0.38.0] - 2026-03-19

### Added

- **OpenSky Network Supplemental Source**: Integrated OpenSky v1 REST API support into the aviation poller as an optional supplemental source alongside ADSBx-compatible providers.
  - Added async OAuth2-capable client in `backend/ingestion/aviation_poller/opensky_client.py`.
  - Added center+radius to WGS-84 bounding-box conversion (`nm_radius_to_bbox`).
  - Added state-vector translation from OpenSky positional arrays/units into ADSBx-compatible dictionaries consumed by existing normalization and TAK paths.
- **Global ICAO24 Watchlist**: Added Redis ZSET-backed watchlist manager in `backend/ingestion/aviation_poller/opensky_watchlist.py`.
  - Supports permanent and TTL-based entries.
  - Supports batched active-entry queries for global OpenSky polling.
  - Includes background cleanup for expired entries.
- **Service Integration**: Added OpenSky loops and watchlist integration to `backend/ingestion/aviation_poller/service.py`.
  - Added independent bbox loop and watchlist loop.
  - Added automatic watchlist seeding from mission-area detections for configured affiliation types.
  - Added environment-configurable watchlist batch size and seed TTL.

### Changed

- **Docker Compose Wiring**: Added OpenSky environment variables to `adsb-poller`in`docker-compose.yml` so OpenSky behavior is fully configurable in containerized deployments.
- **Release Documentation**: Updated release notes and operational guidance for OpenSky rollout.

### Fixed

- **OpenSky Auth Resilience**: Hardened token-refresh failure handling in `backend/ingestion/aviation_poller/opensky_client.py`.
  - Falls back cleanly to anonymous mode when credential-based token retrieval fails.
  - Adds backoff for token-refresh retries to avoid repeated 401 log storms.
  - Improves diagnostics with clearer token refresh failure context.
- **Credential Hygiene**: Trimmed `OPENSKY_CLIENT_ID`and`OPENSKY_CLIENT_SECRET`values in`backend/ingestion/aviation_poller/service.py` to prevent hidden whitespace causing auth failures.

## [0.37.2] - 2026-03-19

### Security

- **[CRITICAL] Rate Limit on AI Analysis Endpoint** (PR #150): Fixed a missing rate limit on the `/api/analysis` endpoint that exposed the application to DoS and LLM cost-exhaustion attacks. A per-IP limit is now enforced to prevent unbounded inference requests.

### Fixed

- **Replay Historian: Temporal Dead Zone Crash**: Resolved an `Uncaught ReferenceError`(`Cannot access 'updateReplayFrame' before initialization`) in`App.tsx`caused by`loadReplayData`referencing`updateReplayFrame`before its`const` declaration. The callback is now correctly hoisted above its consumers.
- **Replay Playback Time-Range** (PR #149): Corrected time-range selection logic and resolved a bug where recently active tracks were missing from replay playback.
- **MCP LSP Configuration** (PR #148): Fixed LSP MCP servers to support a Docker/local-binary dual-path. Wrapper scripts now auto-select the correct backend, and relative workspace paths are used in `.mcp.json` args to ensure portability.
- **Accessibility: Accordion Toggle Buttons** (PR #151): Converted non-semantic `<div>`toggle elements to`<button>` elements across accordion components, satisfying WCAG 2.1 keyboard-navigation and screen-reader requirements.

## [0.37.1] - 2026-03-18

### Added

- **Multi-Domain Situational Intelligence**: Enhanced the AI Analyst with deep contextual awareness for fusion analysis.
  - **Behavioral Trajectory Analysis**: The AI now receives the last 10 waypoints (lat/lon, alt, speed, time) for tracking complex patterns like loitering and interceptions.
  - **Infrastructure Correlation**: Automated spatial cross-referencing with nearby RF Sites (within 10km) and Submarine Cable landing stations (within 20km).
  - **Orbital Sensor Awareness**: Integrated real-time SGP4 propagation to identify active INTEL-category satellite overpasses during a target's operational window.
  - **Satellite Fallback Synthesis**: Implemented on-demand trajectory synthesis for satellites using TLE-based SGP4 propagation when analytical telemetry is required.

### Fixed

- **Analysis Pipeline Reliability**: Resolved a critical `JSONDecodeError` in the waypoint history processing by implementing rigorous JSON string decoding in the unified analysis router.

## [0.37.0] - 2026-03-18

### Added

- **Semantic Intelligence Integration**: Added Model Context Protocol (MCP) support for specialized LSP servers.
  - right (Backend)**: Enabled deep semantic analysis and "Go to Definition" capabilities across the multi-poller backend services.

  - server (Frontend)**: Standardized TypeScript/React symbol resolution for the 30+ Deck.gl and HUD components.

- **Architectural Visualization**: Integrated the `graph-it-live` MCP server to provide real-time dependency graphing and structural analysis of the codebase.
- **Developer Tooling Isolation**: Introduced `docker-compose-tools.yml` to run MCP and LSP services in isolated containers, eliminating host-side dependencies for AI analysis.
- **Enhanced IDE Standardization**: Updated `.gitignore`to explicitly preserve`.vscode/settings.json`, ensuring consistent formatting (Black/Prettier) and analysis paths across all contributors.

## [0.36.1] - 2026-03-18

### Fixed

- **AI Analyst Copy-Paste Formatting**: Resolved a bug where text copied from the AI Analyst panel lost its structure (one word per line) in external applications.
  - emented robust text normalization for SSE carriage returns and spacing artifacts.

  - ied the cleaning logic between the UI renderer and the clipboard handler.


## [0.36.0] - 2026-03-18

### Added

- **WebSDR Discovery Architecture**: Introduced a dedicated global node discovery system for the WebSDR network.
  - obal Map View**: A new full-page map interface for browsing available WebSDR nodes worldwide, removing previous radius and coverage restrictions.

  - tegrated Receiver**: Selecting a WebSDR node now transitions the terminal to a full-screen receiver view, unmounting automatically when switching modes to conserve resources.

- **WebSDR Node Styling**: Implemented custom tactical themed popups for WebSDR nodes, removing default white outlines and ensuring consistency with the application's dark aesthetic.

### Changed

- **Radio Terminal Refactoring**:
  - med the base "Listen" mode to "**KiwiSDR**" for improved clarity and naming consistency across different SDR networks.

  - ialized the `KiwiNodeBrowser` widget to focus exclusively on KiwiSDR nodes, reducing UI clutter and state overlap.

- **Documentation Overhaul**: Updated the UI Guide and Configuration Reference to reflect the new WebSDR capabilities and the KiwiSDR naming convention.

### Fixed

- **WebSDR Missing Module**: Resolved a container deployment issue where `websdr_directory.py`was missing from the`js8call` service Docker image, restoring node discovery functionality.

## [0.35.1] - 2026-03-18

### Changed

- **AI Configuration Documentation**: Comprehensive overhaul of the AI triple-model architecture documentation, clarifying the roles of `secure-core`, `public-flash`, and `deep-reasoner` models.
- **Environment Templates**: Updated `.env.example` with more descriptive comments and a complete set of LiteLLM and RF Pulse configuration variables.

### Fixed

- **Documentation Hygiene**: Corrected broken links and stabilized table formatting across the primary configuration and deployment guides.

## [0.35.0] - 2026-03-18

### Added

- **Multi-Mode AI Analysis**: The AI Analyst now supports specialized operational modes:
  - ctical**: Focuses on telemetry anomalies and trajectory analysis.

  - INT**: Focuses on entity identification and registration matching.

  - R**: Optimized for identifying distress patterns and search grids.

- **Orbital Tracking Performance**: Implemented a specialized isolated filter state for the Orbital Map to prevent high-frequency satellite updates from impacting tactical map performance.
- **AI Configuration Guide**: New documentation clarifying the distinction between the UI model catalog (`models.yaml`) and the Backend infrastructure (`litellm_config.yaml`).

### Changed

- **State Stability**: Memoized filter objects and stabilized prop references in `TacticalMap`and`OrbitalMap` to reduce unnecessary re-renders.

### Fixed

- **Orbital Count Flickering**: Resolved a race condition in the animation loop that caused the global tracker to intermittently jump to zero during filter transitions.
- **Analyst Reliability**: Fixed a bug where the AI Analyst panel failed to auto-run when opened from the Orbital view.
- **Text Formatting**: Cleaned up spacing artifacts in AI-generated reports (e.g., "it ' s" -> "it's").

## [0.34.1] - 2026-03-17

### Fixed

- **Docker Stability (uv Migration)**: Resolved critical "executable not found" errors after the migration to `uv`by moving the virtual environment to`/opt/venv` to prevent masking by host-mount volumes.
- **Container Performance Tuning**: Enabled bytecode compilation (`UV_COMPILE_BYTECODE=1`) and disabled redundant startup sync checks (`--no-sync`), reducing cold-boot lag by 3-5 seconds.
- **JS8Call Compatibility**: Relaxed Python version requirement to `3.10` to match the Ubuntu 22.04 base image, ensuring bridge stability.
- **Build Context Sanitization**: Implemented global and per-service `.dockerignore`files to prevent large host-side`.venv` folders from breaking Windows→Docker build context transfers.

## [0.34.0] - 2026-03-17

### Added

- **Situation Globe (Dashboard)**: A new interactive, auto-rotating 3D globe integrated into the Dashboard view.
  - lit-View HUD**: Dashboard now displays a local tactical map alongside the situational globe for dual-scale awareness.

  - odesic Mission AO**: The active mission area is rendered as a projection-aware ring on the globe.

- **Starfield Backdrop**: Cinematic deep-space starfield integrated into global map views.

### Changed

- **Playback / Replay overhaul**: Fixed a cascade of bugs that caused the replay
  feature to show no data after running overnight with no client connected.

  - Historian now uses adaptive time-bucket sampling (`DISTINCT ON (entity_id,
    time_bucket(...))`) instead of a raw `LIMIT` that always returned the first
    N chronological rows (typically the first few seconds of a 6-hour window).
    Bucket sizes scale with window duration: 30 s (≤1 h) → 2 min (≤6 h) → 5 min
    (>12 h), giving uniform temporal coverage across the entire requested window.

  - Frontend now requests `limit=10000` (API max) instead of the default 1000.
  - Frontend stale threshold raised from 5 min to 10 min to accommodate larger
    bucket sizes without entities flickering out between data points.

  - Historian supervisor added (`_historian_supervisor`in`main.py`): wraps the
    historian task with exponential-backoff restart (5 s → 60 s) so a transient
    Kafka outage at startup no longer permanently stops data persistence.

  - `historian_task`now re-raises`CancelledError` and fatal exceptions so the
    supervisor can distinguish clean shutdown from crash.

- **Orbital tracks removed from database**: The `orbital_tracks` TimescaleDB
  hypertable has been eliminated.  Satellite positions are deterministic (SGP4
  from stored TLEs) and were generating ~2 000 write-rows per second with no
  operational benefit.

  - `orbital_tracks`table removed from`init.sql` and no longer created on
    fresh installs.

  - Historian no longer writes satellite positions; it continues to upsert TLE
    metadata into the `satellites` table every 6-hour refresh cycle.

  - `/api/tracks/history/{SAT-*}` now propagates positions on-demand via SGP4
    from the stored TLE, giving unlimited historical depth (bounded only by TLE
    age) instead of the previous 12-hour retention window.

  - `/api/tracks/search`satellite results now query the`satellites` catalogue
    directly and compute current positions via SGP4 at query time.

  - `/api/tracks/replay` already excluded orbital data (satellites exhausted the
    10 000-row budget and the OrbitalMap is hardcoded to `replayMode=false`).

- **Orbital data excluded from replay**: Replay covers ADS-B and AIS only.
  With ~10 000 tracked satellites, even one bucket per object would consume the
  entire row budget leaving no room for tactical data.

- **Dashboard Smoothing**: Integrated Dead Reckoning (PVB) into the Situation Globe to ensure orbital and tactical assets glide smoothly during auto-rotation.
- **Global Terminator Support**: The day/night terminator toggle is now synchronized across both the local tactical map and the global situated view.

### Fixed

- Historian `CancelledError` was silently swallowed, preventing clean shutdown
  detection by the new supervisor.

- `docker-compose.yml`does not declare`redpanda` as a health dependency for
  `backend-api`; the supervisor now retries automatically if Kafka is not yet
  ready when the API starts.

- **Helicopter & Drone Filtering**: Fixed a precedence bug where platform-specific filters (Helo/Drone) were overridden by ownership filters (CIV/MIL). These filters now take absolute priority.
- **Dashboard Prop Synchronization**: Fixed multiple React hook dependency and prop-drilling issues in the split-view dashboard.

## [0.33.0] - 2026-03-16

### Added

- **Global DASHBOARD View**: Introduced a high-tactical "at-a-glance" dashboard view accessible via the Top Bar. This view provides a unified perspective on system health, stream bitrates, active outages, and RF EmComm monitoring without needing full map immersion.
- **Stream Health & Sparklines**: Integrated real-time sparkline visualizations for data ingestion rates across Aviation, Maritime, and Orbital domains.
- **Orbital Constellation Tabs**: Enhanced orbital situational awareness with dedicated dashboard tabs for quick access to Starlink, GPS, and Intel constellation status.

### Changed

- **High-Frequency Performance Tuning**:
  - **Optimized Date Parsing**: Drastically reduced CPU overhead in rendering and mapping loops by optimizing `Date` instantiation inside hot paths.
  - **Async File I/O for Pollers**: Migrated synchronous file writes to non-blocking async operations in the Orbital Pulse service, preventing I/O stalls during high-volume TLE updates.

## [0.32.2] - 2026-03-15

### Fixed

- **Deep Localhost Removal**: Eliminated remaining hardcoded `localhost`string references in`useEntityWorker.ts`, `useKiwiNodes.ts`, and `ListeningPost.tsx`.
- **Intelligent URL Derivation**: Implemented fallback logic that automatically uses the current host IP for all API and WebSocket traffic when environment variables are set to local defaults, ensuring multi-node network deployments work out of the box.

## [0.32.1] - 2026-03-15

### Fixed

- **Network Deployment & CORS**: Centralized `ALLOWED_ORIGINS`in`.env`, resolving Cross-Origin Resource Sharing blocks when running on a server inside a local network.
- **Dynamic WebSocket Detection**: Updated frontend hooks to automatically derive backend WebSocket URLs from the current server IP, eliminating the need for manual `.env` configuration in many network environments.
- **Non-Secure (HTTP) Support**: Implemented a fallback for `crypto.randomUUID()` in non-secure (HTTP) contexts, preventing application crashes when accessed via IP without SSL.

## [0.32.0] - 2026-03-15

### Added

- **Global Raw Payload Stream**: Introduced a high-performance `GlobalTerminalWidget` accessible via the Top Bar. This "god-view" terminal samples the entire system data bus (Aviation, Maritime, Satellite) in real-time, providing deep investigative capabilities into the raw Protobuf/JSON ingestion flow.
- **Dynamic Sampling Controls**: Integrated live bit-rate decimation controls (REAL, 2X, 5X, 10X) into the global terminal, allowing operators to downsample the high-speed data firehose for better human readability.
- **Enhanced Entity Payload Inspector**: Re-engineered the individual entity `RAW_PAYLOAD` inspector with standard syntax highlighting and a refined tactical aesthetic.
- **UI Hygiene for Infrastructure**: Implemented intelligent conditional rendering in the Right Sidebar to hide the "Raw Payload" button for static/aggregate infrastructure (Undersea Cables, Outages, Repeaters) where individual message payloads are not applicable.

## [0.31.0] - 2026-03-15

### Added

- **Enhanced KiwiSDR Demodulation Coverage**: Expanded available modes from 5 to 18, including AM wideband/narrow variants (amn, amw), Sync AM family (sam, sau, sal, sas), and specialized digital modes (DRM, IQ, QAM).
- **Advanced DSP & Waterfall Controls**: Integrated 8 new real-time DSP methods (Notch Filter, Noise Reduction, Noise Filter, RF Attenuator, Passband tuning, Mute) and 2 waterfall controls (Color Map selection, Aperture/Dynamic Range centering) through the full UI→backend→receiver signal path.
- **Dual-Protocol SDR Link**: Implemented automatic WebSocket URL fallback for modern (v1.550+) and legacy KiwiSDR nodes, ensuring connectivity across the global hardware fleet.
- **MD5 Secure SDR Authentication**: Integrated MD5-based password authentication for protected KiwiSDR nodes, matching current KiwiSDR server security protocols.

### Changed

- **Unified SDR State Model**: Standardized `KiwiConfig`and`ManualConfig` interfaces across the frontend to resolve type mismatches and ensure consistent connection state across all widgets.
- **Radio Terminal UX Refinement**: Optimized vertical spacing and improved typography for station cards and message logs.

### Fixed

- **Deck.gl v9 & Terminator Layer Stability**: Resolved critical Deck.gl v9 compatibility issues in `TerminatorLayer`, including corrected coordinate wrap-around and type safety for GeoJSON assets.
- **Radio Terminal Component Restoration**: Implemented missing `LogEntry`and`StationCard` components, resolving blank panels and reference errors in the Radio Terminal.
- **React Purity for RTL Ops**: Refactored `Date.now()`logic in`RadioTerminal.tsx` to align with strict React purity rules, preventing unstable re-renders in high-traffic SDR sessions.
- **JS8Call Intelligence Sync**: Fixed property access for signal quality (`sq`) and SNR levels in the SDR node browser, ensuring accurate load visualization.
- **Task Documentation**: Established standardized task tracking in `agent_docs/tasks/` for all architectural and stability fixes.

## [0.30.0] - 2026-03-15

### Added

- **RF Layer Legend Widget**: Introduced a dedicated legend widget for the RF infrastructure layer. It provides instant decoding of site service types (NOAA, Safety, Digital, Standard FM) and explicitly flags EMCOMM-active stations.
- **HUD Asset Tags for KiwiSDR**: Restored high-tactical information labels for individual KiwiSDR nodes. Asset tags now feature the live host address (e.g., `kk6pr.ddns.net`) in the header for rapid identification.

### Changed

- **Tactical RF Symbology Overhaul**:
  - Removed aggressive glow halos from RF sites to reduce map clutter and improve visual focus in high-density areas.
  - Standardized "Silent Map" labeling: Most generic site labels are now hidden by default (accessible via tooltips) to maximize situational awareness.
  - Reintegrated cluster counts into RF groupings, ensuring density information is preserved during zoom-out.
- **Emerald Theme for RF Infrastructure**: Migrated the entire RF status suite and toggles to an "Emerald" green theme, providing better visual separation from Aviation (Blue/Cyan) and Public Safety (Amber) alerts.

## [0.29.1] - 2026-03-15

### Added

- **Detailed RF Health Monitoring**: The System Health widget now provides granular connectivity status for individual RF sources (JS8, NWR, ARD).
- **Data Portability & Custom Presets**: Operators can now save, export, and import custom combinations of map layers as "Mission Presets" via the System Settings panel.
- **Mission Quick-Presets**: Added one-click tactical configurations for "Air Only", "Sea Only", and "Full Intelligence" views.

### Changed

- **Sentinel Security Implementation**: Integrated a high-performance rate-limiting layer on the AI Analysis endpoint to mitigate potential API abuse.
- **Internet Outage Polygon Optimization**: Implemented client-side coordinate simplification for internet outage polygons, reducing the memory footprint and improving frame rates during global outage events.
- **System Health Toggle UI**: Refined the aesthetics of the system health toggles for a more integrated glassmorphism look.

### Fixed

- **AI Analyst Stability**: Resolved a critical overtriggering bug in the `AIAnalystPanel` where model analysis would fire multiple times per second due to unstable dependency arrays.
- **Backend Environment Injection**: Fixed a race condition in the container entrypoint that occasionally prevented microservices from inheriting `.env` configuration.
- **JSX Runtime Resolution**: Resolved a project-wide regression where the `react/jsx-runtime` module could not be found by the Vite build system.
- **Map Layer Clipping**: Resolved a visual defect where infrastructure underlays (RF, Outages) would clip through the ground terrain in 3D and Globe views.
- **Cascading Renders in System Health**: Fixed a performance bottleneck in the `SystemHealthWidget` where internal state updates were triggering unnecessary re-renders across the TopBar.
- **AIS Ingestion Stability**: Fixed a missing await in the maritime poller's ingestion loop that caused dropped TAK events under high network throughput.
- **RF Layer Visual States**: Fixed a bug where RF coverage halos would fail to update their color or radius after a mission area re-center.
- **KiwiSDR Audio Recovery**: Improved audio stream resilience and connection redirect handling for HF Listening Post operations.

## [0.29.0] - 2026-03-14

### Added

- **Shared Maritime Constants**: Created `frontend/src/constants/maritime.ts`to centralize`SHIP_TYPE_MAP`and`NAV_STATUS_MAP`, eliminating duplication across `SearchWidget`and`SidebarRight`.
- **Modular Interpolation Utility**: Extracted **Projective Velocity Blending (PVB)** logic into a reusable `interpolatePVB`utility in`frontend/src/utils/interpolation.ts`.
- **Dedicated Filter Utility**: Extracted `filterEntity`and`filterSatellite`logic to`frontend/src/utils/filters.ts` for better reusability and cleaner data flow.
- **Layer Composition Module**: Introduced `composeAllLayers`in`frontend/src/layers/composition.ts` to orchestrate the complex Deck.gl layer stack, significantly reducing boilerplate in the main animation loop.

### Changed

- **Animation Loop Refactor**: Major architectural cleanup of `useAnimationLoop.ts`, reducing its size from 924 to 516 lines while maintaining high-performance real-time rendering.
- **Database Cleanup**: Removed redundant `migrate_*.sql`files and outdated`retention_policy.sql`as their contents are now fully integrated into the primary`init.sql` schema.

### Fixed

- **Test Suite Hygiene**: Prefixed unused mock variables with `_`in`test_cors.py`, `test_tracks_validation.py`, and `test_tracks_replay.py` to satisfy linting requirements and improve code clarity.
- **Frontend Layer Exports**: Removed the unused `TerminatorLayerProps`interface from`TerminatorLayer.tsx`.

## [0.28.6] - 2026-03-14

### Fixed

- **RF Repeater Rendering**: Resolved a regression where RF repeater sites were hidden on the map due to `rfSitesRef` not being passed to the animation loop.
- **Developer Documentation**: Added a comprehensive **Animation Loop Data Threading Checklist** to `agent_docs/z-ordering.md`and updated`AGENTS.md` to mandate its use, preventing silent failures in future layer work.

## [0.28.5] - 2026-03-14

### Fixed

- **Tactical RF & Infrastructure Visibility**: Resolved multiple depth-fighting (Z-index) conflicts where RF Infrastructure and Internet Outage layers were buried beneath the map terrain or each other.
  - **Depth Standardization**: Migrated all tactical underlays (RF, Outages, Cables) to a standardized `depthTest: true`and negative`depthBias` scheme (-50 to -110), pulling them explicitly into the foreground.
  - **Outage Shading**: Fixed a bug where global outage polygons used a positive depth bias, effectively pushing them out of the viewport on 3D/Globe projections.
  - **RF Dot Contrast**: Reintroduced white outlines and increased cluster halos to ensure radio stations remain visible across high-contrast satellite and dark-tactical backgrounds.
- **Historian Data Recovery Race**: Fixed a race condition where the `historian` service would miss the initial ingestion burst from pollers during a fresh system start, leading to an empty database ("0 RF stations active").
  - **Kafka Offset Management**: Changed `auto_offset_reset`to`earliest`and bumped the`group_id`to`historian-writer-v2`. This forces the historian to backfill all available events on the Kafka bus into TimescaleDB, ensuring zero data loss during reboots.
- **RF Sidebar Notification Logic**: Refined the IntelliSense notification gating to prevent false-negative "0 RF Stations Active" alerts. The system now waits for a confirmed non-zero data set before broadcasting its availability to the operational feed.
- **Filter Hook Performance**: Memoized the `activeServices`array in`App.tsx`to prevent the`useRFSites` hook from re-evaluating on every frame, reducing browser CPU usage and stabilizing API polling frequency.

## [0.28.4] - 2026-03-14

### Fixed

- **Replay Category Filters Inoperative for AIS and ADS-B**: All vessel and aircraft category filters (cargo, tanker, passenger, military, commercial, etc.) were silently ignored during track replay. `processReplayData`in`replayUtils.ts`parsed`meta.callsign`from the database row but never mapped`meta.classification`to the entity's top-level classification fields. Since`filterEntity()`in`useAnimationLoop`reads from`entity.vesselClassification.category`(ships) and`entity.classification.affiliation/platform` (aircraft), every entity passed all filters regardless of user selection.
  - **Fix**: For ship entities (CoT type contains `'S'`), `meta.classification.category`is now mapped to`entity.vesselClassification.category`. For aircraft entities, the full `meta.classification`object (including`affiliation`, `platform`, `category`, etc.) is mapped to `entity.classification`. The live path was unaffected — `useEntityWorker` correctly reads these fields from the incoming WebSocket CoT message.
  - **Tests**: Added three new cases to `replayUtils.test.ts`covering AIS ship category mapping, ADS-B aircraft classification mapping, and graceful handling of rows with no`meta.classification`.
- **KiwiSDR Audio Stability & Restart**: Resolved a critical infinite loop in the `useListenAudio` hook where the WebSocket connection was repeatedly torn down and restarted on "Playing" state changes.
  - **Hook Refactor**: Removed `isPlaying` from effect dependencies and migrated the watchdog to functional state updates.
  - **AudioContext Management**: Removed over-aggressive `suspend()` calls on temporary connection drops, ensuring the audio engine remains ready for immediate reconnection.
  - **Backend Cleanup**: Integrated comprehensive cleanup in the `DISCONNECT_KIWI`action handler, explicitly closing audio/waterfall sockets and terminating the`pacat` bridge to prevent phantom audio leaks.
- **AIS Vessel Identification**: The Right Sidebar now prioritizes displaying the vessel's radio callsign in the **REGISTRATION** field (falling back to IMO number), enabling faster platform identification for maritime contacts.

## [0.28.3] - 2026-03-13

### Fixed

- **Waterfall WebSocket — React StrictMode Race**: Resolved a compounding bug that caused the WIDE-mode waterfall stream to fail immediately on load.
  - **Over-specified `useEffect`deps**:`wfOffset`and`zoom`were listed as dependencies of the WebSocket effect in`ListeningPost.tsx`. Since `drawRow`closed over`wfOffset`directly, every slider interaction recreated`drawRow`, which in turn triggered the effect to teardown (close the WS) and re-open — cycling before the first handshake could complete.
  - **React StrictMode double-invoke**: In development, React 18 StrictMode intentionally runs effect cleanup then re-runs the effect to detect side effects. The cleanup called `ws.close()`while the socket was still in`CONNECTING` state, producing the browser error "WebSocket is closed before the connection is established."
  - **Fix 1**: Introduced `wfOffsetRef`to mirror`wfOffset`state.`drawRow`now reads`wfOffsetRef.current`and carries an empty`[]` dep array, making it referentially stable across renders.
  - **Fix 2**: The WS effect dep array reduced to `[wfMode, analyserNode]` — the only two values that actually require a new connection.
  - **Fix 3**: The effect cleanup now checks `ws.readyState`. When `CONNECTING`, it schedules `ws.onopen = () => ws.close()`instead of calling`close()` immediately, satisfying StrictMode's double-invoke without producing a browser error.

## [0.28.2] - 2026-03-13

Front End Updates

### Changed

- **Frontend Code Cleanup**: Comprehensive dead code removal and refactor across the frontend codebase.
  - **`useAnimationLoop.ts`**: Removed unused `useMemo`import; removed`mapToken`and`mapStyle`from hook options (never read inside the loop); removed dead`speedKts`computation that was calculated every frame then discarded; removed invalid`// eslint-disable-next-line react-hooks/purity`comment; extracted duplicated sea/air entity filter logic into a standalone`filterEntity()`helper; extracted duplicated satellite category classification into a standalone`filterSatellite()` helper, eliminating verbatim duplication between the orbital count pass and the rendered satellite pass.
  - **`useEntityWorker.ts`**: Removed misleading `smoothedCourse`alias — the variable was assigned directly from`computedCourse` with no transformation, implying smoothing that no longer exists.
  - **`useMissionLocations.ts`**: Removed `updateMission` — defined, memoised, and exported but never imported or called anywhere in the codebase.
  - **`useRFSites.ts`**: Removed `rfSites`array state and`error`state from the hook; both were populated but never consumed by any component. The hook now returns only`{ rfSitesRef, loading }`.
  - **`useMissionArea.ts`**: Removed 4 debug `console.log` statements that fired on every 2-second poll cycle and every mission change.
  - **`useSystemHealth.ts`**: Removed dead `if (latency > 1000) status = 'degraded'`branch — unreachable because the preceding`latency > 200` condition already set the same value.
  - **`useInfraData.ts`**: Removed duplicate consecutive `setOutagesData(fallbackEmpty)`call in the`catch` block.
  - **`missionArea.ts`**: Replaced hardcoded `VITE_API_URL`base URL with relative`/api/config/location` paths, consistent with all other API modules.
  - **`App.tsx`**: Collapsed two identical `<SidebarRight>`renders (one under`TACTICAL`, one under `ORBITAL`) into a single conditional render.
  - **`TacticalMap.tsx`/`OrbitalMap.tsx`**: Removed `mapToken`and`mapStyle`props from`useAnimationLoop` calls after those options were removed from the hook interface.
  - **`replayUtils.test.ts`**: Replaced trivial benchmark test (`expect(end - start).toBeGreaterThan(0)`) with a meaningful data-integrity assertion verifying all entities and point counts are preserved across a large dataset. Removed in-test `console.log`.
  - **Multiple components**: Removed invalid `// eslint-disable-next-line react-hooks/purity`and`// eslint-disable-next-line react-hooks/set-state-in-effect`comments from`PassPredictorWidget.tsx`, `SearchWidget.tsx`, `SidebarRight.tsx`, `KiwiNodeBrowser.tsx`, and `TacticalMap.tsx` — these ESLint rule names do not exist.

Backend Updates

### Fixed

- **RF Alias Endpoint**: Corrected `service=`keyword argument to`services=["ham"]`in the`/api/repeaters`backwards-compatibility alias; previously caused a`TypeError` at runtime on every call.
- **Internet Outage Poller**: Removed an unreachable duplicate `except`block in`fetch_internet_outages()` that could never execute; only the first handler ran.
- **Analysis Request Schema**: Removed unused `uid`field from`AnalyzeRequest` — the entity identifier is correctly sourced from the URL path parameter and the body field was validated but silently ignored.
- **AIS Ingestion Pipeline**: Resolved a critical regression where AIS-sourced maritime vessels were not appearing on the Tactical Map.
  - **Missing `await`**: The `publish_tak_event`coroutine was called without`await` in the main message loop, causing all Kafka sends to be silently dropped.
  - **Interruptible Stream Loop**: Redesigned the main WebSocket receive loop to use `asyncio.wait`with a`reconnect_event`, allowing the poller to immediately react to mission area updates from Redis without blocking.
  - **Classification Key Alignment**: The historian and Intelligence Feed expected a `classification`key on each TAK event; the poller was only emitting`vesselClassification`. Both keys are now populated for full pipeline compatibility.
  - **`ShipType`Field Fix**:`StaticDataReport`(Class B, Message 24) messages use`ShipType`instead of`Type`for the vessel category.`handle_static_data` now checks both keys.
  - **`ShipName`Fallback**: Added`ShipName`as a secondary lookup in`handle_static_data`for vessels whose static data does not carry a`Name` field.
- **AIS Classification Heuristics**: Significantly expanded name-based vessel classification in `maritime_poller/classification.py`to reduce`[UNKNOWN]` tags in the Intelligence Stream.
  - **Passenger/Ferries**: Added `WSF`, `FERRY`, `SPIRIT`, `QUEEN`, `BREEZE` patterns.
  - **Tug/Towing**: Added `FOSS`, `PUSH`, `VALIANT`, `TITAN` patterns.
  - **Military**: Added `CGC`, `RFA`patterns; broadened`USS` to include full prefix.
  - **Pleasure Craft**: Added `MY `, `M/Y`, `SY ` patterns.
  - **Law Enforcement**: Added `POLICE`, `SHERIFF`, `PATROL` patterns.
  - **SAR**: Broadened match from `SAR `to`SAR`.

### Changed

- **Dead Code Removal**: Deleted several unused code paths identified during backend code review:
  - `teme_to_ecef_vectorized`in`sgp4_utils.py`— replaced by`teme_to_ecef` scalar variant, never imported.
  - Intel Reports stub in `analysis.py`— commented-out embedding scaffolding and`intel_reports = []`placeholder removed along with the now-unused`json` import.
  - `calculate_polling_points()`in`aviation_poller/service.py` — superseded by H3 sharding, no remaining call sites.
  - `poll_point()`in`multi_source_poller.py`— superseded by the H3`source_loop`/`_fetch` path, no remaining call sites.
  - `Settings.LITELLM_MODEL`in`config.py`—`AI_MODEL_DEFAULT`in`system.py` is the actual source of truth; this setting was never read.
- **Import Hygiene**: Moved inline `import math`to the top of`infra_poller/main.py`; removed unused `import sys`from`benchmark_search.py`; removed unused `List`from`multi_source_poller.py` imports.
- **Redis Cleanup Guards**: Simplified `hasattr(x, 'aclose')`ternary guards in`database.py`and`aviation_poller/service.py`to direct`aclose()`calls —`redis.asyncio` has provided this method since v4.2 and the fallback is no longer needed.

### Removed

- **Infra Poller Debug Scripts**: Deleted 6 one-off HTTP probe scripts from `backend/ingestion/infra_poller/test/`(`debug_ioda_structure.py`,`test_ioda.py`, `test_ioda_events.py`, `test_ioda_events_refined.py`, `test_ioda_summary.py`, `test_ioda_summary_v2.py`) — these made live network calls and were not pytest-compatible unit tests.
- **Orbital Pulse Test Directory**: Moved `benchmark_parsing.py`from`orbital_pulse/tests/`to the package root and removed the now-empty`tests/` directory.

JS8CALL Updates

### Changed

- **JS8Call — Dead Code Removal**: Audited all files in the `js8call/` poller for dead code, unused symbols, and structural redundancies.
  - Removed unused `import shlex`from`server.py`(was made redundant when`shell=True` was replaced with secure subprocess pipelines).
  - Removed unused `import sys`from`manual_test_kiwi.py`.
  - Removed unused `import traceback`from`tests/test_json.py`.
  - Removed three dead dummy-variable assignments (`callsign`, `grid`, `freq`) that were immediately overwritten in the WebSocket handler.
  - Removed dead `haversine_distance_km()`function from`server.py`— duplicate of logic already present in`kiwi_directory.py` and never called.
  - Removed no-op `if closed_ok: pass`branch from`kiwi_client.py` receive loop.
  - Consolidated five repeated inline `socket.socket()`UDP send blocks in`server.py`into a single`_udp_send()` helper, reducing boilerplate and centralising error handling.
  - Fixed type mismatch: `SET_KIWI`handler now correctly parses`freq`as`int`(was`float`), matching the `_start_kiwi_pipeline()` signature and validation logic.
  - Renamed root-level `test_kiwi.py`→`manual_test_kiwi.py`and`test_wvm.py`→`manual_test_wvm.py`to clearly distinguish live integration/smoke scripts from the pytest unit test suite in`tests/`.

## [0.28.1] - 2026-03-12

### Added

- **Waterfall Zoom Suite**: Integrated dynamic zoom capabilities into the KiwiSDR waterfall.
  - **Dynamic Scaling**: The waterfall now correctly follows the audio center frequency even when zoomed in.
  - **Zoom Controls**: Added interactive zoom +/- buttons to the Listening Post panel.
- **Global Network Master Toggle**: Refined the "Global Network" infrastructure toggle with a hierarchical master switch that controls Undersea Cables and Internet Outages as a group.

### Fixed

- **Map Depth Sorting Optimization**: Standardized depth stacking across the tactical stack. Entity icons and trails now correctly "float" above high-density infrastructure layers like Internet Outages and Submarine Cables.
- **Globe Projection Refinements**:
  - Fixed a visual glitch where AOT boundaries would "clip" or distort when transitioning to Globe mode by implementing geodesic path rendering.
  - Fixed a mission-area rendering bug in maritime AOTs by implementing box-edge interpolation for the Earth's curvature.
- **Map Style Lifecycle**: Resolved an issue where the map would remain stuck in satellite mode after exiting Globe view; it now correctly reverts to the tactical dark style.
- **Waterfall Dynamic Range**: Improved waterfall contrast through precise dynamic range calibration and a refined spectral palette.

### Changed

- **Tactical HUD Condensation**: Optimized vertical spacing in the Listening Post sidebar to reduce scrolling and improve situational awareness.
- **Documentation Migration**: Completed the transition of all persistent documentation from `docs/`to`agent_docs/` for better agent resonance.

## [0.28.0] - 2026-03-11

### Added

- **Internet Outage Intelligence Layer**: Implemented a global internet outage visualization layer powered by Georgia Tech's IODA (Internet Outage Detection and Analysis).
  - **Dynamic Country Shading**: Countries are now dynamically shaded on the map based on the severity of active internet outages, using a multi-stage heatmap (Yellow → Orange → Red).
  - **Tactical Outage Reports**: Added a dedicated "INTERNET OUTAGE" sidebar section that surfaces IODA scores, affected regions, and data-source attribution for selected countries.
- **`infra_poller` Microservice**: New Python-based ingestion service that centralizes high-latency infrastructure data fetching.
  - **IODA Summary V2**: Optimized ingestion using the IODA Summary V2 API with hourly rolling windows.
  - **Submarine Cable Refresh**: Automated 24h background polling for global submarine cable and landing station datasets.
  - **Redis-Backed Infrastructure Store**: Migrated infrastructure data to a shared Redis cache to improve frontend load times and reduce external API dependency.
- **Hierarchical Global Network Toggle**: Re-engineered the "GLOBAL NETWORK" filter into a master switch that controls Undersea Cables, Landing Stations, and Internet Outages as a unified group.
- **Undersea Cables Sub-filter**: Added granular control for cable paths, allowing them to be toggled independently once the master network switch is active.

### Changed

- **Depth Bias Recalibration**: Standardized `depthBias` across the tactical stack to resolve visibility conflicts. Internet Outages (-30) and Physical Infrastructure (-40) now correctly render beneath AOT Boundaries (-100) and Entity Icons (-200).
- **Layer Stacking Optimization**: Refined the global rendering order to ensure static infrastructure remains a background "underlay" while real-time tactical data stays prominent on top.
- **Improved Interaction Model**: Migrated outage interaction from point-based markers to native GeoJSON polygon picking, enabling users to select entire countries for detailed outage analysis.

## [0.27.0] - 2026-03-12

### Added

- **Hybrid Globe Architecture**: Integrated ESRI World Imagery satellite basemap as a high-resolution alternative to the dark tactical style in Globe mode.
- **Deep Space Starfield**: Implemented a dynamic StarField canvas with 320 twinkling stars, rendered behind the map to provide a cinematic backdrop when atmospheric layers are translucent.
- **Globe Style Switcher**: New `DARK`/`SAT` toggle buttons exclusively in Globe mode for seamless transition between tactical and reconnaissance views.
- **Atmospheric Tuning**: Refined the globe's atmosphere in `useMapCamera.ts` to allow starfield visibility while maintaining a high-altitude glow.

### Changed

- **Adaptive Map UI**: 2D and 3D views are now forced to the high-contrast Dark Tactical style for optimal UI performance and legibility. Satellite imagery is dynamically restricted to the Globe projection.
- **Control Bar Refinement**: Repositioned 3D orientation controls (Rotation/Tilt) to sit above the mode selector for improved ergonomics.
- **Orbital Parity**: Added full 3D orientation controls to the `OrbitalMap.tsx` component.
- **Graticule Color Logic**: Latitude/Longitude grid lines now dynamically adjust contrast based on the underlying basemap (White on Satellite vs Cyan on Dark).

### Fixed

- **High-Load AIS Stability**: Implemented an exponential backoff (5s to 300s) and a 30s minimum cooldown strategy for the maritime poller to prevent IP rate-limiting during rapid mission re-centering.
- **Websocket Lifecycle**: Fixed an `AttributeError`in`service.py` where stale connection delay variables were causing poller crashes during reconnection cycles.
- **Orbital UI Missing Assets**: Resolved a `ReferenceError`in`OrbitalMap.tsx`where move/tilt icons were missing from the`lucide-react` module imports.
- **Layer Re-application**: Fixed a bug where graticule and background layers would disappear after basemap style changes by migrating to persistent `.on("style.load")`listeners in`MapboxAdapter.tsx`.

## [0.26.1] - 2026-03-12

### Fixed

- **KiwiSDR Tuning Stability**: Implemented a 500ms debouncing mechanism for frequency tuning, AGC, and squelch adjustments in the `js8call` service. This prevents remote SDR nodes from being overwhelmed by rapid UI interactions and mitigates connection drops and rate-limiting.

## [0.26.0] - 2026-03-12

### Added

- **HF Listening Post (Beta)**: Integrated a high-performance raw binary streaming architecture for KiwiSDR nodes. Users can now stream real-time 12kHz PCM audio and panoramic waterfall data directly to the Radio Terminal.
- **Panoramic Waterfall (WVM/WF)**: New high-density spectrum visualization in the Listening Post panel, synchronized with the active SDR frequency and zoom levels.

### Fixed

- **AIS AOT Persistence**: Resolved a race condition where the maritime Area of Interest (AOT) boundary would flicker or disappear when switching between Tactical, Orbital, and Radio views. State is now persisted via root refs.
- **KiwiSDR Protocol Handshake**: Fixed a critical command sequencing bug in `kiwi_client.py` that caused audio/waterfall streams to hang during initialization.
- **Audio Stream Resilience**: Implemented non-blocking I/O for the JS8Call audio pipeline to prevent event-loop stalls during buffer saturation.
- **WebSocket Auto-Reconnect**: Added robust reconnection logic to HF audio and waterfall streams to handle backend service restarts gracefully.

## [0.25.0] - 2026-03-10

### Added

- **Global COT State Persistence**: Re-engineered the map view lifecycle by hoisting the `useEntityWorker`hook and all tactical track state to the root`App.tsx`. This ensures that tactical tracks, dead reckoning state, and satellite telemetry persist instantly when switching between Tactical and Orbital map views.

### Fixed

- **Map View Transition Performance**: Eliminated the 5-10 second "re-sync" delay when switching map views by preserving the WebSocket and Worker thread throughout the session.
- **State Reset Bug**: Fixed a critical `TypeError`in`App.tsx`where changing map filters would crash the application due to a missing return in the`setFilters` state updater.
- **Prop Consistency**: Corrected `alertedEmergencyRef`and`repeatersLoading`type mismatches and interface duplications across`App.tsx`, `TacticalMap.tsx`, and `OrbitalMap.tsx`.

## [0.24.0] - 2026-03-10

### Added

- **System Settings Widget**: New centralized configuration interface for system-level toggles, accessible via the Top Bar "SYS" button. Currently houses the H3 Poller mesh toggle.
- **H3 Coverage Mesh**: Real-time H3-based coverage visualization on the Tactical Map, providing spatial awareness of active sensor footprints and poller density.

### Fixed

- **AIS Poller Footprint Optimization**: Standardized AIS ingestion to a fixed 350 NM radius per mission area to prevent reconnection churn while filtering visible data locally.
- **H3 Layer Rendering**: Optimized H3 mesh with `depthTest: false`and`depthWrite: false` to ensure perfect visibility of grounded tactical entities (AIS/ADS-B) regardless of mesh overlay.
- **System UI Centering**: Re-aligned the System Settings widget to be perfectly centered beneath the "SYS" button with corrected horizontal translation.

## [0.23.0] - 2026-03-10

### Added

- **Multi-Source RF Pulse Poller**: Refactored RF infrastructure ingestion into a single, highly concurrent Python microservice (`rf_pulse`) replacing disparate scripts. Supports RepeaterBook, RadioReference, Amateur Radio Directory (ARD), and NOAA NWR.
- **RadioReference Integration**: Secured trunked/conventional system ingestion via authenticated SOAP requests using the user's `RADIOREF_APP_KEY`.
- **Repeater Band Classification**: The Tactical Sidebar now actively computes and displays the physical frequency band (e.g., `2m`, `70cm`, `GMRS (UHF)`) as a compact visual badge attached to the header.

### Changed

- **RF Infrastructure Documentation**: Expanded the `README.md`to cleanly document the`rf_pulse` configuration variables, pipeline architecture, and supported upstream APIs.

## [0.22.1] - 2026-03-10

### Fixed

- **KiwiSDR Node Limits:** Increased the backend node limit from 50 to 10,000 to enable the frontend "Global" radius toggle to correctly display all cached KiwiSDR receivers.
- **Node Filtering Logic:** Updated the `useKiwiNodes` hook to properly trigger refetches when node limits change. Hardcoded limits applied to Mission (50), Regional (500), and Global (All) modes.
- **Tactical Map Controls:** Restored MapLibre `NavigationControl`(+/- zoom buttons) to the bottom-right of the tactical map and themed them in the Sovereign Glass style. Extracted MapLibre CSS overrides from Tailwind's`@layer` directive to prevent the JIT compiler from purging them.

## [0.22.0] - 2026-03-09

### Added

- **RF Network Refactor**: Complete architectural overhaul of the Radio Frequency ingestion pipeline, now supporting concurrent polling for multiple service types (Ham/GMRS, NOAA Weather Radio, and Public Safety/RadioReference).
- **AOR Boundary Ring**: Implemented a dynamic, dashed amber horizon ring on the Tactical Map that scales with the selected RF survey radius, providing instant situational awareness of hardware range.
- **Service-Aware Clustering**: Refined map clustering logic to group RF sites by service type, maintaining distinct color-coding (Emerald/Sky/Amber) for high-density visualization.
- **RF Range Expansion**: Extended the operational range limits for RF surveys, now supporting presets up to 2,000 NM with optimized backend query logic.

### Changed

- **RF UI Standardization**: Migrated the RF Infrastructure suite to a high-contrast amber-yellow theme, differentiating polling status from tactical entities.
- **Condensed Service Filters**: Refactored RF sub-filters into a single horizontal row of high-contrast glowing buttons for better vertical space efficiency.
- **Viewport Optimization**: Increased the Map Layers panel's maximum height from 40vh to 60vh to prevent layout cramping when multiple service suites are expanded.
- **Ref Sites Caching**: Implemented a more aggressive caching strategy in `useRFSites` with TTL and movement-based refetch thresholds to reduce API load.

## [0.21.0] - 2026-03-07

### Added

- **JS8 Unified State Management**: Refactored the `useJS8Stations` hook to serve as the single source of truth for all JS8-related telemetry, ensuring perfect synchronization between the Tactical Map widget and the Radio Terminal panel.
- **Premium Radio Beacon Icon**: Implemented a high-tech, multi-layered "Radio Beacon" icon for connected KiwiSDR nodes on the tactical map, featuring pulsing core animations, radiating cyan waves, and breathing attention rings for enhanced situational awareness.

### Changed

- **KiwiSDR Beacon Scaling**: Refined the radii and font sizes of the map beacon by ~40% for better proportionality within the tactical view.
- **Radio Terminal Variable Standardization**: Standardized all internal variable names in `RadioTerminal.tsx`(`bridgeConnected`,`kiwiIsConnecting`, `sharedStatusLine`, etc.) to match the unified state provider.

### Fixed

- **Radio Terminal `ReferenceError`**: Resolved a critical bug that caused the Radio Terminal view to crash due to undefined variable references after the state refactor.
- **JS8 Connection "Stuck" State**: Fixed a UI bug where connection buttons would remain greyed out after a failed SDR connection. Added a status-driven reset and a 15-second safety timeout to ensure the UI remains interactive.

## [0.20.0] - 2026-03-07

### Added

- **AI Engine Widget**: New `AIEngineWidget` component in the TopBar exposing a live model-selection dropdown, letting operators switch between AI backends (GPT-4o, Gemini, Claude, etc.) at runtime without restarting any service.
- **ADSB Military & Drone Alerts**: The alert engine now fires **one-time** tactical alerts when a military aircraft or drone/UAS first appears in the AOR — matching the existing maritime military vessel alert behavior and completing alert parity across all three tracked domains.

### Fixed

- **Orbital Parameters in Right Sidebar (Period & Inclination)**: Corrected camelCase property access after protobuf compilation. `period_min`→`periodMin`and`inclination_deg`→`inclinationDeg` were being read with snake_case names, causing PERIOD and INC to always show "---" in the entity inspector. Now displays live values correctly.
- **Protobuf Schema Sync**: Added `period_min`, `inclination_deg`, and `eccentricity`fields to both`backend/api/proto/tak.proto`and`frontend/public/tak.proto`, and updated `tak_pb2.py`and`tak.py` serialization to populate them from the orbital data stream.
- **AIS Poller Reconnection Churn**: The maritime AIS poller was reconnecting to AISStream.io on every Redis mission-area pub/sub message, causing a cascade of connection timeouts whenever the user rapidly clicked radius presets (30 nm → 100 nm → 150 nm). Fixed with two defenses:
  - **Minimum-change threshold** — ignores updates where lat/lon changes < 0.05° and radius changes < 1 nm, filtering out floating-point drift and same-value re-selections.
  - **5-second debounce** — rapid preset clicks now collapse into a single reconnect once the user stops interacting.
- **AIS Vessel Registration Display**: Extended the right sidebar to surface AIS-specific vessel registration fields (IMO, callsign, flag, draught, destination) when inspecting a maritime contact.
- **Orbital Registration Badge**: The REGISTRATION field in the entity info bar now shows the NORAD catalog number (e.g. "NORAD 52794") for orbital targets instead of the orbital category type string (e.g. "GPS").
- **Orbital Sidebar Compacted**: Collapsed the 3-row NORAD ID / Inclination / Eccentricity block into a single inline line beneath the callsign, saving significant vertical space in the inspector panel.

## [0.19.0] - 2026-03-07

### Added

- **Alerts Widget**: A new dropdown widget integrated into the TopBar for viewing the latest tactical alerts directly under the "ALERTS" pill.
- **Expanded Alert Detection Engine**: The system now automatically detects and generates tactical alerts for critical conditions across all domains:
  - **Aviation**: Emergency squawk codes (7500, 7600, 7700) and general emergency status flags.
  - **Maritime**: AIS-SART distress signals (NavStatus 14), Not Under Command (NavStatus 2), Aground (NavStatus 6), and initial detections of military vessels or hazardous cargo.
  - **Orbital**: Imminent passes (AOS within 30 minutes) of Intel-category satellites (military reconnaissance, SAR, EO constellations).
- **Persistent Alert State Tracking**: Alerts are intelligently deduplicated per-entity and automatically clear when emergencies resolve, passes conclude, or entities leave the operational area.

### Changed

- **Alerts Widget Styling**: Removed the red outer glow from the alerts panel border in favor of a clean, standard shadow for a more refined look.

### Fixed

- **HUD Z-Indexing**: Explicitly set the TopBar zone's z-index to `z-50`in`MainHud` to ensure that dropdown widgets render correctly over the sidebars and map content.

## [0.18.2] - 2026-03-06

### Fixed

- **Globe Mode Rendering (Tactical & Orbital Map):**
  - Resolved a platform-level incompatibility that caused Deck.gl layers to go blank when enabling Globe mode with a Mapbox token. Mapbox Globe explicitly blocks `CustomLayerInterface`, which `MapboxOverlay`requires. Both`TacticalMap`and`OrbitalMap` now dynamically switch to the **MapLibre adapter** in Globe mode, falling back to the Mapbox adapter for 2D/3D Mercator views where Mapbox Standard remains available.
  - Fixed an incorrect `map.setProjection()`call in`useMapCamera`that passed the Mapbox-only bare string form (`"globe"`) to a MapLibre instance. The hook now correctly detects the active adapter and passes the MapLibre object form`{ type: "globe" }` when in Globe mode.
  - Fixed a race-condition crash (`Cannot read properties of undefined (reading 'destroy')`) triggered when toggling Globe off. A manual `map.remove()`call was racing with`react-map-gl`'s own internal cleanup — removed the redundant call since the GL context lifecycle is fully managed by `react-map-gl` on unmount.
  - `mapStyle` now correctly switches to the CartoDB Dark Matter style in Globe mode, matching the MapLibre adapter requirement.

## [0.18.1] - 2026-03-06

### Fixed

- **KiwiNodeBrowser**: Resolved `NaN, NaN` crash in MapLibre by adding defensive guards for invalid coordinates.
- **geoUtils**: Robust Maidenhead grid conversion to handle non-digit characters in square locators.
- **Linting**: Fixed all remaining frontend lint errors (purity, setState in effect, etc.).
- **Branding**: Integrated the official Sovereign Watch cyber-tactical logo into the `README.md` and added a symmetrical text-less favicon to the frontend UI.

### Changed

- **UI Streamlining:**
  - Standardized the "Sovereign Glass" design aesthetic across the entire tactical and orbital HUD.
  - Eliminated harsh 30px drop shadows from the left sidebar widgets (Mission Navigator, Search, JS8, System Status, Intel Feed, Doppler, Altitude/Speed Legends) in favor of a cohesive 12px blur with slight rounded corners, matching the orbital design.
  - Slimmed down the global TopBar height by 10px, refining icon and text padding to eliminate edge-hugging.
  - Revamped the Historian (TimeControls) widget to perfectly align with the glassmorphism properties, active/inactive pill button states (`hud-green`/`amber-500`), and tabular typography of the main HUD.
  - Updated all bottom map controls (2D/3D toggle, Globe toggle, ± Zoom controls, and 3D Rotation/Tilt controls) to use tightly fitted `p-1`and`p-1.5`transparent borders with interactive`bg-white/10`hover states and`hud-green`/`indigo-500` active halos.

### Fixed

- **Visual Regressions:** Addressed text cutoff and vertical misalignment in the Historian widget after structural padding changes.

## [0.18.0] - 2026-03-06

### Added

- **Nginx Reverse Proxy:** All services now route through a single nginx entry point on **port 80**. The `sovereign-nginx`container proxies`/api/`to the backend,`/ws/js8`to the JS8Call WebSocket bridge, and`/` to the Vite frontend. No other container exposes host ports.
- **KiwiSDR Public Directory Search:** Integrated a new `KiwiDirectory`module in the`js8call` service to fetch and parse the global KiwiSDR receiver list. Features proximity-sorting using Haversine distance and frequency-based filtering to select the optimal SDR node for tactical operations.

### Changed

- **Port Consolidation:** Removed host port mappings from `frontend`(3700),`backend-api`(8000),`js8call`(8082),`timescaledb`(5432),`redis`(6379), and`redpanda` (28081/28082/29092). All inter-service communication routed exclusively over Docker internal networks.
- **Vite Configuration:** Removed the `/api`proxy block (nginx now handles API routing). Set`hmr.clientPort: 80`so Vite HMR WebSocket tunnels correctly through nginx. Set`allowedHosts: true` to allow proxied requests from nginx.
- **Frontend Port:** Vite dev server moved from port 3000 → 3700.
- **Sidebar Glassmorphism Restoration**: Reverted to individual glass containers for each sidebar widget (`Search`, `Mission Navigator`, `Intel Feed`, `JS8`, `Layer Filters`, `System Status`) to restore visual separation and tactical depth.
- **Shadow Refinement**: Toned down the global drop shadow blur from `30px`to`12px` across all glass widgets for a cleaner, high-end aesthetic.
- **Search Widget Enhancement**: Boosted text prominence in the search input using `text-cyan-300`, increased placeholder opacity, and added a subtle cyan outer glow on focus for better interactivity.
- **Tactical Legend Restyling**: Redesigned the `Altitude`and`Maritime`map legends to match the **Mission Navigator** widget's visual language, featuring a header/body structure,`hud-green`tactical typography, and dedicated`Crosshair`/`Anchor` icons.
- **Legend Alignment**: Precisely aligned the map legends to the vertical gutter right of the tactical sidebar to optimize map real estate.
- **JS8Call Backend Architecture:** Replaced the legacy `pyjs8call` bridge with a native **AsyncIO DatagramProtocol** (UDP) implementation to permanently resolve the Qt headless socket thread crash bug on Windows-based hosts.
- **Radio Terminal Styling**: Refined frequency input fields and terminal sidebars with glassmorphism principles.

### Fixed

- **Database Initialization (`init.sql`):** Wrapped `ALTER EXTENSION timescaledb UPDATE`and`CREATE EXTENSION ai`in`DO $$ ... EXCEPTION ... $$`blocks to prevent fatal errors from aborting the init script on fresh volumes. The`ai`extension is unavailable in`timescale/timescaledb-ha:pg16`and the`ALTER EXTENSION` call requires a fresh session context.
- **Idempotent DB Policies:** Added `if_not_exists => true`to`add_compression_policy`and`add_retention_policy`calls in`init.sql` to prevent errors on repeated initializations.
- **JS8Call Bridge Startup:** Fixed a `NameError`in`js8call/server.py`caused by the`logger`variable being used before initialization inside the`kiwi_client`import exception handler. Moved`logging.basicConfig`and`logger`declaration above the`try/except` block.
- **CORS (Backend & JS8Call):** Updated `ALLOWED_ORIGINS`to`http://localhost`for both`backend-api`and`js8call` services. With nginx as the single entry point, all browser requests originate from one host — eliminating cross-origin errors.

### Removed

- **Redpanda Console:** Removed the `sovereign-redpanda-console`service. It was a development debugging tool that served no runtime function and conflicts with the single-port architecture. Can be re-added temporarily via`docker compose run` when Kafka topic inspection is needed.

## [0.17.2] - 2026-03-04

### Added

- **PVB Satellite Rendering:** Satellites now use Projective Velocity Blending (PVB) for smooth, 60fps rendering in the Orbital map, replacing the previous 5-second snapping updates.
- **Orbital History Tails & Gap Bridges:** Real-time trails are now seamlessly grafted onto the PVB satellite models. A new "Gap Bridge" rendering layer connects the delayed 3D orbital track directly to the live 60fps icon for a fluid UI experience.
- **Right Sidebar Safeguards:** Passing `selectedEntity`conditionally into the`MainHud`right slot prevents the`SidebarRight` transparent container from blocking user mouse events on the underlying tactical map when closed.

### Fixed

- **Gap Bridge Elevation Logic:** The `Gap Bridge`component in`OrbitalLayer`now correctly uses`d.altitude` to position the line segments in 3D space, instead of drawing the orbital trails on the physical ground.

## [0.17.1] - 2026-03-04

### Added

- **Collapsible Subcategories:** Added stateful chevron toggles to the orbital category pills to collapse and expand constellation lists, saving vertical HUD space.
- **Default Filters:** The Starlink constellation is now disabled by default on fresh loads to prevent overwhelming the browser with 9,000+ entities instantly.
- **Category Pill Refinement:** Removed top-level category counts from the orbital pills to prevent text collision, keeping the UI clean and readable.

### Fixed

- **Constellation Filtering Schema:** Restored the missing `constellation`and`category`fields to the`tak.proto`Protobuf schema, re-enabling selective constellation filtering in the frontend worker and`useAnimationLoop`.
- **Backend Serialization:** Updated the `sovereign-orbital-pulse` and TAK serialization services to correctly map and transmit the restored fields over WebSocket.

## [0.17.0] - 2026-03-04

### Added

- **Orbital Map: Observer AOI Horizon Ring:** `buildAOTLayers` now renders a soft purple geodesic circle centered on the active mission lat/lon, with radius matching the configured mission area in nautical miles. A small purple dot marks the precise observer position. Works in both mercator and globe projections. The ring updates automatically when the mission area changes.
- **Orbital Map: Right-Click Mission Control:** Right-clicking the orbital map now opens the full `MapContextMenu`(matching the tactical map), exposing **Set Mission Focus**, **Save Location**, and **Return Home** actions. Includes`SaveLocationForm` for bookmarking clicked coordinates. Changing focus also updates the observer AOI ring immediately.
- **Pass Prediction: COMMS Layer Safety Guard (Frontend):** `OrbitalSidebarLeft`now skips the category-level pass prediction request when the active filter is`comms`. The `PassPredictorWidget` displays a clear informational message explaining that individual satellite selection is required for comms pass prediction.
- **Pass Prediction: COMMS Layer Safety Guard (Backend):** `GET /api/orbital/passes`returns`HTTP 400`when`category=comms`is requested without explicit`norad_ids`. Prevents accidental or buggy clients from triggering an 8-10k-satellite SGP4 scan that would OOM the server.

### Fixed

- **SidebarRight Header Clipping:** Removed `overflow-hidden`from the main header`div`in`SidebarRight`. The TYPE_TAG and REGISTRATION badge row was being clipped behind the Position Telemetry section. The header now expands naturally to contain all content.
- **SidebarRight Actions Bar (Satellite Entities):** The TRACK_LOG button and its parent actions bar `div` are now conditionally hidden when viewing satellite entities, preventing phantom spacing and irrelevant controls from appearing in the orbital sidebar.

### Changed

- **`buildAOTLayers`:** Accepts an optional `observer`argument`{ lat, lon, radiusKm }`for the orbital horizon ring. The`ScatterplotLayer`import added alongside the existing`PathLayer`.
- **`useAnimationLoop`:** Added optional `observerRef`parameter (`MutableRefObject<{ lat, lon, radiusKm } | null>`) threaded through to`buildAOTLayers`.
- **`OrbitalMap`:** Maintains an `observerRef`derived from`currentMissionRef`, kept in sync each render cycle.

## [0.16.0] - 2026-03-04

### Added

- **Satellite Inspector (SidebarRight):** `SatelliteInspectorSection`sub-component shows`inclination_deg`and`eccentricity`in the identity header; live azimuth, elevation, and slant range computed at 1 Hz via`satAzEl()`with green highlight when elevation ≥ 10°; next-pass AOS countdown, max elevation, and duration sourced from`usePassPredictions` filtered by NORAD ID.
- **Pass Predictor UX — Live Countdown:** Each pass row in `PassPredictorWidget`shows a live`T-HH:MM:SS` countdown to AOS. In-progress passes pulse purple and switch to a LOS countdown.
- **Pass Predictor UX — Min Elevation Filter:** `MIN EL: [10° ▾]`dropdown (0/5/10/15/20/30°) added to the pass list header, wired to`usePassPredictions` `minElevation` option.
- **Pass Predictor UX — CSV Export:** Download icon in the pass list header serialises `passes[]`to a`passes_YYYY-MM-DD.csv`file via`Blob`+`createObjectURL`.
- **Category Counts per Pill:** `OrbitalCategoryPills`fetches`GET /api/orbital/stats`on mount and renders per-category satellite counts (e.g.,`GPS (127)`).
- **NORAD ID / Name Search:** Compact search input above category pills filters the pass list client-side by name or NORAD ID substring; no additional API call.
- **Predicted Ground Track PathLayer:** When a satellite is selected and history tails are enabled, `OrbitalMap`fetches`/api/orbital/groundtrack/{norad_id}?minutes=90`and renders it as a dashed`PathLayer`(future orbit) via`predictedGroundTrackRef`threaded through`useAnimationLoop`.
- **`GET /api/orbital/stats`Endpoint:** Returns`COUNT GROUP BY category`from the`satellites` table for the category-pill UI.
- **Redis Caching for Pass Predictions:** Pass prediction results are cached in Redis for 5 minutes, keyed by `orbital:passes:{lat}:{lon}:{hours}:{el}:{norad_ids}:{limit}`. Falls back gracefully when Redis is unavailable.
- **Pass Prediction `limit`Param:**`GET /api/orbital/passes`gains a`limit` query parameter (max 500) to cap results returned.
- **`useMissionLocation`Hook:** Extracted shared observer-location resolution (getMissionArea + env-var fallback) used by both`OrbitalSidebarLeft`and`SidebarRight`.
- **`usePassPredictions``skip` Option:** Suppresses fetches when not applicable (used by`SatelliteInspectorSection` for non-satellite entities).
- **`satAzEl()`Utility:** New`geoUtils.ts` export computing observer→satellite azimuth, elevation, and slant range using spherical ECEF/ENZ math.
- **`GroundTrackPoint`Type:** Exported from`OrbitalLayer.tsx` for use across the ground track data pipeline.

### Changed

- **`OrbitalSidebarLeft`:** Refactored observer location resolution to `useMissionLocation`; `minElevation`state now wired to`usePassPredictions`; search input added above category pills.
- **`SidebarRight`:** Normalised `React.useState`/`React.useEffect`to destructured`useState`/`useEffect`.

### Removed

- **`OrbitalDashboard.tsx`:** Deleted — confirmed unused (App.tsx renders `OrbitalMap`+`OrbitalSidebarLeft` directly). 130 lines of dead code removed.
- **Stale `Satellite`icon import** removed from`OrbitalCategoryPills.tsx`.

## [0.15.0] - 2026-03-04

### Added

- **Orbital Pass Prediction API:** New `GET /api/orbital/passes` endpoint that computes upcoming satellite passes for an observer location using SGP4 propagation. Returns AOS, TCA, LOS, max elevation, azimuth at AOS/LOS, duration, and a full 10-second point array per pass for polar plot and Doppler rendering.
- **Ground Track API:** New `GET /api/orbital/groundtrack/{norad_id}` endpoint returning lat/lon/alt arrays for one configurable propagation window.
- **Satellites Table:** Persistent `satellites`database table (no retention policy) storing the latest TLE and orbital metadata per NORAD ID, independent of the 24-hour`tracks` hypertable retention.
- **Historian TLE Upsert:** The Historian service now upserts TLE data into `satellites`on every consumed`orbital_raw` Kafka message, ensuring TLEs are always fresh for pass prediction.
- **SGP4 Coordinate Utilities:** New `backend/api/utils/sgp4_utils.py`with TEME→ECEF→topocentric helpers including`ecef_to_topocentric` for azimuth/elevation/slant-range computation.
- **`usePassPredictions`Hook:** React hook that polls`GET /api/orbital/passes`every 5 minutes, cancels in-flight requests on unmount, and returns typed`PassResult[]` data.
- **Live Widget Wiring:** `OrbitalSidebarLeft`now feeds live pass data to`PassPredictorWidget`, `DopplerWidget`, and `PolarPlotWidget` using the active mission area as the observer location.

### Changed

- **`OrbitalSidebarLeft`:** Replaced hardcoded empty arrays with live data from `usePassPredictions`; observer lat/lon sourced from `getMissionArea()` with env var fallback.

## [0.14.1] - 2026-03-03

### Changed

- **Orbital UI Polish:** Refactored the orbital dashboard sidebars and filters to align perfectly with the established tactical UI schema.
- **Globe Rendering:** Removed the artificial radial vignette from the main HUD shell to provide a cleaner void background for the 3D globe.

## [0.14.0] - 2026-03-03

### Added

- **Orbital Synchronization Suite:**
  - **Dedicated Orbital Dashboard:** A new high-performance tracking suite for space-based assets, featuring its own TopBar navigation pill.
  - **3D Globe Visualization:** Integrated a spherical projection mode specifically for orbital situational awareness, providing a global perspective on satellite constellations.
  - **High-Frequency Propagation:** Reduced the satellite positional update interval from 30s to 5s in the `orbital-pulse` poller for near-real-time accuracy.
  - **Satellite Inspector:** New side-panel for deep-diving into orbital parameters (inclination, eccentricity, period, NORAD ID) and Celestrak category metadata.
  - **Orbital Category Filtering:** Dynamic pill-based filtering for GPS, COMMS, WEATHER, and INTEL orbital groups.
  - **Coverage Footprints:** Real-time 2D coverage visualization for the selected satellite based on its current altitude.
  - **Terminator Layer:** Real-time day/night shadow overlay across both Tactical and Orbital maps for operational context.

### Changed

- **Tactical UI Alignment:**
  - Reordered TopBar navigation to "Tactical | Orbital | Radio" to prioritize the two primary map domains.
  - Aligned Tactical Map zoom controls to the bottom-center for a unified HUD aesthetic.
  - Consolidated "Ground Tracks" and "History Trails" into a single global state for reduced visual clutter.

### Fixed

- **Orbital Map Stability:**
  - Restricted global footprint rendering to preventing WebGL context crashes with 10k+ entities.
  - Fixed a terminator toggle bug where the layer would remain stuck in "ON" mode across view transitions.

## [0.13.3] - 2026-03-02

### Fixed

- **Globe 3D Rendering & Projections:**
  - Fixed an issue in Mapbox v3 Globe mode where Deck.gl layers (undersea cables, satellites, repeaters) would clip through the Earth when the camera was tilted. Added explicit `depthBias`to all layer builders (`-210.0` to`-100.0`).
  - Implemented dynamic `wrapLongitude` disabling to prevent visual artifacting and streaking when the map is in spherical projection.
  - Mitigated a "Planet Sized Satellite" visual bug by capping the maximum pixel-to-degree scaling radius of `OrbitalLayer` assets based on altitude, preventing over-expansion at low zoom levels.
  - Disabled explicit forced `GlobeView`projection in the DeckGL MapboxAdapter, allowing it to natively read the Mapbox camera matrix for`_full3d` synchronization.

### Known Issues

- **Mapbox v3 Parallax Drift:** Mapbox GL JS v3 explicitly drops support for custom interleaved WebGL layers when rendering the Globe projection. Because Deck.gl is forced to render on a separate `<canvas>`, its 3D camera matrix exhibits minor "parallax drift" / expansion compared to the Mapbox globe when the camera is heavily pitched. Full interleaved support remains fully functional with MapLibre.

## [0.13.2] - 2026-03-02

### Fixed

- **JS8Call Container Runtime:** Fixed a crucial issue preventing the `js8call`container from starting on Windows-based host machines. Added a`.gitattributes`file to enforce`LF`line endings across all shell scripts and Docker files, preventing fatal`\r` (CRLF) errors during execution inside the Linux container.
- **Database Initialization:** Re-aligned `POSTGRES_PASSWORD` environment defaults to prevent authentication failures when standing up fresh TimescaleDB volumes.

## [0.13.1] - 2026-03-02

### Added

- **Repeater Infrastructure Cache:** Implemented a new Demand-Driven Redis cache (24h TTL) in the `/api/repeaters` endpoint to prevent redundant external API calls.

### Fixed

- **Infinite Re-Renders:** Resolved a critical infinite re-render loop (`Maximum update depth exceeded`) in `useInfraData` that was triggered by unstable object references.
- **Repeater API Authentication:** Fixed a `502 Bad Gateway`error on the RepeaterBook integration by adding support for`REPEATERBOOK_API_TOKEN` bearer authentication to comply with upstream security changes.
- **Async LLM Blocking (NEW-003):** Migrated the Analysis API's streaming generator to use `acompletion`and`async for`, preventing LLM streaming from blocking the FastAPI event loop.
- **API Validation & Cleanup (NEW-001, NEW-002, NEW-004, NEW-005):** Added lower-bound validation to replay endpoints, removed deprecated asyncio loop calls, and cleared residual debug logs from production.

## [0.13.0] - 2026-03-01

### Fixed

- **Stability Audit (20 bugs resolved across 13 files):**
  - **BUG-001** — Aviation Poller double rate-limiter: Removed redundant `async with source.limiter`wrapper in`source_loop()`. The inner `_fetch()` already holds the limiter; double-acquisition halved the effective polling rate.
  - **BUG-002** — Historian shutdown data loss: Added batch flush in the `finally` block before consumer teardown. In-flight data was silently discarded on SIGTERM.
  - **BUG-003** — Signal handler `asyncio.create_task()`crash: Changed to`loop.create_task()`in both`aviation_poller/main.py`and`maritime_poller/main.py`. Signal handlers run outside the async context, making `asyncio.create_task()`raise`RuntimeError`.
  - **BUG-004** — Analysis API crash on NULL `avg_speed`/`avg_alt`: Added `or 0`guards before`.1f`/`.0f`format specifiers.`PostgreSQL AVG()`returns`None`on all-NULL groups, causing`TypeError`.
  - **BUG-005** — Blocking LLM call stalling event loop: Wrapped synchronous `litellm.completion()`in`asyncio.to_thread()` within the analysis SSE generator, restoring API concurrency.
  - **BUG-006** — Replay endpoint accepts reversed time windows: Added `dt_end <= dt_start` validation; previously a negative duration silently produced empty results.
  - **BUG-007** — Track history accepts zero/negative `limit`and`hours`: Added positive-value guard on both query parameters.
  - **BUG-008** — CORS misconfiguration (`allow_credentials=True`with`allow_origins=["*"]`): Removed `allow_credentials` from JS8Call bridge CORSMiddleware — the combination is rejected by all browsers per spec.
  - **BUG-009** — Historian silently drops batch when DB pool unavailable: Retained batch and logged a warning instead of clearing; data is retried on the next flush cycle.
  - **BUG-010** — ECEF→LLA division by zero at the poles: Clamped `lat`with`np.clip`before dividing by`cos(lat)`in`orbital_pulse/utils.py`.
  - **BUG-011** — Deprecated `asyncio.get_event_loop()`in JS8Call WebSocket handlers: Replaced with`asyncio.get_running_loop()` (correct inside a running coroutine, Python 3.10+).
  - **BUG-012** — Historian clears batch after write failure: Moved `batch.clear()`inside the`try` block so data is only discarded after a confirmed successful DB write.
  - **BUG-013** — Debug `console.log` in production hot paths: Removed 5 console log calls from WebSocket connect/open/close, followMode effect, and map load events.
  - **BUG-014** — Redundant inner `if action == "SEND"` guard in JS8Call WebSocket handler: Removed always-True dead check and unified variable naming.
  - **BUG-015** — Duplicate DR-state lookup in `useEntityWorker.ts`: Consolidated `currentDr`/`previousDr`(identical`drStateRef.current.get()`calls before any write) into a single`existingDr`.
  - **BUG-016** — `_message_queue`type annotation in JS8Call server: Corrected from`asyncio.Queue`→`Optional[asyncio.Queue]`to match actual`None` initialization.
  - **BUG-017** — Deprecated `@app.on_event("startup/shutdown")`lifecycle hooks: Migrated`backend/api/main.py`to the modern`@asynccontextmanager` `lifespan` pattern (FastAPI ≥ 0.93).
  - **BUG-018** — Hex debug computation in protobuf decode hot path: Removed `Array.from().map().join()`byte-to-hex conversion that ran on every decoded TAK message; no UI feature consumed`.raw`.
  - **BUG-019** — AIS magic number 511: Defined `AIS_HEADING_NOT_AVAILABLE = 511` module constant (per ITU-R M.1371) and replaced bare literals in both position report handlers.
  - **BUG-020** — AISStream bounding box unclamped latitude: Clamped `min_lat`/`max_lat`to`[-90.0, 90.0]`in`maritime_poller/utils.py` to prevent invalid subscription coordinates for large-radius or polar-centered AORs.

## [0.12.1] - 2026-03-01

### Fixed

- **Drone Classification Accuracy (ADS-B Aviation Poller):**
  - Introduced dedicated constants for Military, Commercial, Civil, and Generic UAS identification strings.
  - Improved `classify_aircraft` detection logic, now cross-referencing ICAO category, type code, description, squawk code, operator, callsign, and registration fields for higher-confidence classification.
  - Added granular `drone_class`sub-assignments (`MILITARY_UAS`,`COMMERCIAL_UAS`, `CIVIL_UAS`, `UNKNOWN_UAS`) emitted alongside `aircraft_class = "drone"` in the classification payload.
  - Expanded `test_classification.py` with comprehensive drone fixture coverage to prevent classification regressions.

- **API Security — Information Disclosure via Error Handling:**
  - Hardened `backend/api/routers/analysis.py`and`backend/api/routers/system.py` to suppress internal stack traces and implementation details from HTTP error responses (MEDIUM severity).
  - Structured error responses now return generic operator-safe messages, preventing inadvertent leakage of backend internals to external callers.

## [0.12.0] - 2026-03-01

### Added

- **Undersea Infrastructure Awareness:**
  - **Submarine Cable Layer:** New Deck.gl map layer rendering the global submarine cable network with per-cable color coding sourced from SubmarineCableMap.com.
  - **Landing Stations Layer:** Independent toggle for submarine cable landing points, visualized as colored dots matching their cable's signature color.
  - **Infrastructure Tooltips:** Specialized tactical tooltips for cables (name, length, owners, status) and landing stations (name, country, connected cables).
  - **Intelligence Feed Integration:** Automatic Intel Feed notifications when submarine cable or landing station layers are toggled on/off.
  - **24h Client Cache:** Submarine cable + landing station GeoJSON cached in `localStorage` to minimize external API calls.

- **RF Infrastructure Enhancements:**
  - **Tactical Clustering (Refined):** Refactored the repeater clustering algorithm: tighter grid grouping, Emerald-themed halos (replacing off-theme Violet), reduced visual weight of cluster bubbles, and a higher zoom breakpoint (7.5) for better density management in high-repeater regions like the Pacific Northwest.
  - **Intelligence Feed Notifications:** Toggle-on/off events for RF repeaters now fire in the Intel Feed, consistent with all other map layers.
  - **Notification Race Fix:** Fixed a race condition where the Intel Feed would report "0 repeaters" before data had loaded. The gate now waits for a non-zero count or a confirmed loading cycle before broadcasting.
  - **Globe Mode Optimization:** RF repeater dots fully billboard in globe mode with correct `depthBias` to prevent half-moon clipping.
  - **Callsign Labels:** Repeater callsigns and frequencies appear at zoom ≥ 9 as tactical overlays.

- **Infrastructure Color System:**
  - Standardized **Emerald-400** (`#34D399`) as the canonical color for all RF Infrastructure elements (Repeaters, JS8Call indicators, status messages).
  - Standardized **Cyan-400** (`#22D3EE`) as the canonical color for all Undersea Infrastructure elements (Cables, Landing Stations).
  - Updated `SystemStatus.tsx`, `LayerFilters.tsx`, `IntelFeed.tsx`, and `MapTooltip.tsx` to reflect the new scheme consistently.
  - Header toggle buttons for each infrastructure group now match their assigned color.

### Changed

- **HUD Terminology:** Renamed "Total Objects" → "Total Tracking" in `SystemStatus.tsx` for more accurate tactical terminology.
- **Landing Stations Default:** Landing stations now default to **OFF** when submarine cables are first enabled, preventing UI overload on first toggle.
- **Architecture Diagram:** Fixed a node ID collision in `README.md`Mermaid diagram (node`J` was dual-assigned to JS8Call and Claude). Added RF Repeaters, Submarine Cables, and Infrastructure Layers to the Presentation block.
- **Data Sources Documentation:** Added a comprehensive `## 🗂️ Data Sources`section to`README.md` documenting all upstream APIs with URLs, auth requirements, and caching behavior.

### Fixed

- **`ReferenceError`in`IntelFeed.tsx`:** Restored missing variable declarations that were causing the intelligence stream to crash on toggle.
- **Map Tooltip Sync:** Verified and corrected tooltip color themes for Repeaters (Emerald), Cables (Cyan), and JS8Call stations.

## [0.11.0] - 2026-03-01

### Added

- **RF Infrastructure Intelligence:**
  - **Repeater Network Layer:** Integrated a new map layer for tracking and visualizing Amateur Radio Repeaters.
  - **Tactical Repeater Sidebar:** Created a custom sidebar for visualizing detailed telemetry (Frequency, Offset, CTCSS, Modes, Use, Status, Location) when selecting a repeater.
  - **Repeater API:** Added backend endpoints `/api/repeaters` to support the new UI elements.

### Changed

- **Tactical UI Polish:**
  - **Consolidated Layers Filter:** Eliminated the standalone `MapLayersWidget` and beautifully integrated the Map Layers toggle directly into the header of the **System Status (Total Objects)** widget to preserve HUD real-estate.

## [0.10.4] - 2026-03-01

### Fixed

- **Orbital Entity Tooltips:**
  - Added an `isOrbital`type check to`MapTooltip.tsx` to ensure satellites display correct purple tactical styling.
  - Orbital tooltips now output speeds accurately in `km/s`instead of converting`kts`.
  - Updated icon to `Satellite`instead of`Plane` for orbital metadata popups.

## [0.10.3] - 2026-02-25

### Added

- **Sovereign Glass UI:**
  - **Sky Atmosphere:** Enabled a native `sky` layer in MapLibre Globe mode, providing a deep navy horizon-to-space gradient and realistic solar orientation.

### Changed

- **Globe Rendering Overhaul:**
  - **Polygon-Based Tactical Symbols:** Replaced `IconLayer`chevrons with geographic`PolygonLayer` triangles in Globe mode. This completely bypasses MapLibre v5 billboarding/depth-testing bugs, ensuring entities drape perfectly over the 3D sphere and scale/rotate with zero artifacts.
  - **Optimized Zoom Fly-out:** Adjusted globe transition easing to prioritize stability at high altitudes.

### Fixed

- **MapLibre Logic Stability:**
  - **Redundant Atmosphere Triggers:** Added protective guards and deferred one-tick execution (`setTimeout`) to prevent style-clobbering when simultaneously switching projection and adding sky layers.

## [0.10.2] - 2026-02-25

### Added

- **Backend Architecture:**
  - **Broadcast WebSocket Service:** Implemented a new `BroadcastManager`service for`/api/tracks/live`, shifting Kafka consumer overhead from O(N) to O(1) and drastically increasing throughput for concurrent clients.

### Changed

- **Tactical UI:**
  - **JS8Widget Streamlining:** The JS8Call widget now defaults to a collapsed state to preserve screen real estate, keeping the critical station status bar (callsign, grid, frequency, online status) permanently visible.
  - **Radio Terminal Cleanup:** Removed the redundant status footer from the Radio Terminal since the information is naturally represented elsewhere.

### Optimized

- **Maritime Poller Performance:**
  - **Non-blocking Kafka Sends:** Switched to non-blocking Kafka sends in the maritime poller's ingestion loop, mitigating network latency blocks and boosting throughput by ~35x.

### Fixed

- **Data Integrity & Security:**
  - **History Validation:** Added bounded input validation for `limit`and`hours`query parameters in the`get_track_history` endpoint to prevent resource exhaustion and potential DoS attacks.
- **Code Health & Configuration:**
  - **Dynamic Kafka Broker:** Replaced hardcoded broker references with the `KAFKA_BROKERS` environment variable in the API core configuration.
- **Globe Rendering Architecture:**
  - **Icon Visibility Issues:** Disabled `wrapLongitude`in Globe projection mode across multiple tactical layers (`entity-tactical-halo`,`satellite-markers`, `js8-labels`) to resolve Deck.gl billboarding conflicts that caused entity icons to disappear.
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
- **Tactical Map Zoom Controls:** Integrated floating `+`and`-` zoom controls on the tactical map for precise view adjustments.

### Improved

- **Service Resilience:** Enhanced `js8call` container entrypoint with robust PulseAudio discovery and health checks.
- **Infrastructure Orchestration:** Unified tactical services in `docker-compose.yml` with optimized volume sharing for audio and configuration persistent state.

## [0.9.8] - 2026-02-24

### Fixed

- **Critical System Stability:**
  - **API Startup:** Fixed a critical `NameError`crash in`backend/api/main.py`by adding a missing`import os`.
  - **Redis Key Mismatch:** Corrected `backend/ingestion/maritime_poller/service.py`to use the standardized`mission:active` Redis key, ensuring the maritime poller respects the active mission area.
  - **Memory Leaks & Stale State:** Fixed critical stale closures in `frontend/src/hooks/useAnimationLoop.ts`by correctly managing`aotShapes`, `hoveredEntity`, and `selectedEntity` dependencies, preventing UI state drift.
  - **Kafka Consumer Cleanup:** Removed `group_id` from the API track consumer to enable true "Broadcast Mode" and prevent the accumulation of thousands of orphaned consumer groups on the Redpanda broker.

- **Data Integrity & Visualization:**
  - **Mission Switching Teleport Glitch:** Implemented `visualStateRef`clearing in`useMissionArea.ts` to prevent entity "teleportation" artifacts when switching mission areas.
  - **Ground Vehicle Classification:** Correctly mapped ADS-B categories C1 (Emergency), C2 (Service), and C3 (Obstacle) to Ground Vehicle types (`a-f-G-E-V-C`) to prevent them from appearing as ships.
  - **Orbital Count in HUD:** Updated `onCountsUpdate` to include orbital asset counts, fixing the "0" satellite count bug in the sidebar.

- **Performance & Reliability:**
  - **Orbital Propagation:** Vectorized the SGP4 satellite propagation loop in `backend/ingestion/orbital_pulse/service.py`, replacing slow iterative Python loops with optimized `sgp4_array` calls for a massive performance boost.
  - **Maritime Poller Resilience:** Implemented a robust connection retry loop in the maritime `navigation_listener` to recover automatically from Redis outages.
  - **Graceful Shutdown:** Added `SIGTERM`handling to the maritime poller and modernized`asyncio` loop management in the aviation poller to ensure clean container shutdowns.
  - **Redis Compatibility:** Updated Redis connection closing logic to support `aclose()` for compatibility with redis-py 5.x.

## [0.9.7] - 2026-02-24

### Added

- **Frontend Testing Infrastructure:**
  - **Vitest Integration:** Added `vitest` and test scripts to the frontend project for unit testing.
  - **GeoUtils Testing:** Implemented comprehensive unit tests for `chaikinSmooth`geometric algorithm in`utils/map/geoUtils.test.ts`.

### Refactored

- **Code Deduplication:** Removed duplicate `chaikinSmooth`implementation from`OrbitalLayer.tsx`and centralized usage to`utils/map/geoUtils.ts`.

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
  - ks/useEntityWorker.ts` (561L) — TAK worker lifecycle, WebSocket management, dead-reckoning state

  - ks/useAnimationLoop.ts` (733L) — RAF loop, PVB interpolation, per-frame layer assembly

  - ks/useMapCamera.ts` (237L) — globe projection switching, graticule overlay, 3D terrain/fog

  - ks/useMissionArea.ts` (303L) — mission area polling, AOT geometry calculation, entity clearing

  - **New layer builders:**
  - ers/buildAOTLayers.ts`(52L) — maritime box + aviation circle`PathLayer`s

  - ers/buildTrailLayers.ts`(137L) — history trail + gap-bridge`PathLayer`/`LineLayer`

  - ers/buildEntityLayers.ts` (244L) — halos, glow sprites, altitude shadows, heading arrows, velocity vectors

  - **New utilities:**
  - ls/map/colorUtils.ts` (86L) — altitude/speed color gradient functions

  - ls/map/geoUtils.ts` (142L) — haversine, bearing, Chaikin smoothing, graticule, zoom helpers

  - ls/map/iconAtlas.ts` (60L) — canvas icon-atlas singleton

  - **Lazy-loaded adapter selection:** `TacticalMap.tsx`now dynamically picks Mapbox vs. MapLibre adapter via`VITE_MAPBOX_TOKEN`using`React.lazy`.
  - **TypeScript health:** Pre-existing error count reduced from **56 → 33**; zero new errors introduced.

## [0.9.4] - 2026-02-23

### Refactored

- **Backend Architecture:**
  - **Modular API Structure:** Decomposed the monolithic `backend/api/main.py`into a scalable package structure with`routers`, `services`, `core`, and `models`.
  - **Core Logic Migration:** Centralized configuration (`config.py`) and database management (`database.py`) in the `core` module.
  - **Service Extraction:** Moved background tasks (`historian`) and protocol helpers (`tak`) to dedicated `services` modules.
  - **Route Separation:** Split API endpoints into `system`, `tracks`, and `analysis` routers for better organization.
- **Aviation Poller:**
  - **Renaming:** Renamed `backend/ingestion/poller`to`backend/ingestion/aviation_poller` to clearly distinguish it from other ingestion sources.
  - **Code Modularization:** Refactored the aviation poller into `service.py`, `classification.py`, `arbitration.py`, and `utils.py`, with a clean `main.py` entry point.
  - **Docker Configuration:** Updated `docker-compose.yml`to reflect the new build context for the`adsb-poller` service.
- **Maritime Poller:**
  - **Code Modularization:** Refactored `backend/ingestion/maritime_poller`into`service.py`, `classification.py`, and `utils.py` for consistency and maintainability.
- **Orbital Pulse:**
  - **Code Modularization:** Refactored `backend/ingestion/orbital_pulse`into`service.py`and`utils.py` to decouple SGP4 propagation and TLE fetching logic from the main entry point.

## [0.9.3] - 2026-02-23

### Fixed

- **Globe Rendering Architecture:**
  - **Interleaved Binding Reversion:** Explicitly disabled interleaved mode in `TacticalMap`(`interleaved: false`) and restored the pure`useControl`prop passthrough in`MapboxAdapter.tsx` to ensure absolute stability and prevent "double-wrapping" projection crashes in Deck.GL v9.
  - **Explicit Projection Mapping:** Manually pass `projection: { name: 'globe' }`to the`MapboxOverlay` init when in globe mode to correctly warp the 2D WebGL canvas over Mapbox's 3D sphere without requiring interleave integration.
  - **Camera Synchronization:** Removed the hardcoded `viewState`lock in`deckProps` for globe mode, allowing the 2D Deck.GL overlay to natively query Mapbox for real-time pitch and bearing during rotation and panning.

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
  - **Map View Control Relocation:** Moved the 2D/3D and Globe View toggles from the global `TopBar.tsx`directly onto the`TacticalMap.tsx` map surface for localized, context-aware interaction.
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

- **Visual Stylization:** Upgraded velocity vectors and ground tracks to `jointRounded`and`capRounded` PathLayers for professional tactical aesthetics.

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
  - **Kafka Ingestion:** Produces `a-s-K`TAK Protocol messages to a new`orbital_raw` Redpanda topic.
- **Orbital Visualization Layer (Frontend):**
  - **Deck.gl Overlays:** Implemented `OrbitalLayer.tsx` featuring marker rendering, continuous ground-track projection, and orbital footprints.
  - **Satellite Telemetry UI:** Enriched `SidebarRight.tsx` with orbital contact metadata — altitude (km), velocity (km/s), orbital period, NORAD ID, and category.
  - **Layer Filtering:** Robust satellite-category filtering (`GPS`, `Weather`, `Comms`, `Surveillance`) integrated into global layer controls and `TacticalMap.tsx`.
  - **AOR Intel Feeds:** Footprint-overlap detection emits categorized `orbital` INTEL events for satellites passing over the mission AOR.
- **Orbital Layer TopBar Controls:** Added `Orb_Layer`and`Globe_View`toggle buttons to`TopBar.tsx`, state persisted to `localStorage`.
- **Globe View Groundwork:** Full wiring implemented through `App.tsx`, `TopBar.tsx`, and `TacticalMap.tsx`. Dual-path projection logic ready — `map.setProjection()` (Mapbox GL v3+) with style-injection fallback (MapLibre GL). Pending MapLibre GL v5 upgrade to activate.

### Fixed

- **Satellite Category Filtering:** Corrected category extraction path `entity.detail?.category ?? entity.detail?.classification?.category` — sub-filters (GPS/Weather/Comms/Surveillance) were silently passing all satellites through.
- **Satellite Color Synchronization:** `getSatColor()`in`OrbitalLayer.tsx`now exactly matches filter chip colors in`LayerFilters.tsx` (GPS→`sky-400`, Weather→`amber-400`, Comms→`emerald-400`, Surveillance→`rose-400`).
- **Intel Stream Noise:** Suppressed per-frame `onEvent` calls from orbital footprint detections that flooded the intelligence feed.

### Known Issues / Technical Debt

- **Globe View Requires MapLibre GL v5:** `setProjection()`is not present in MapLibre GL JS v3.x. The button UI and code wiring are complete; activation requires upgrading`maplibre-gl`to v5 (see`FEATURE-ROADMAP-PHASE-8.md` for research checklist).

## [0.7.3] - 2026-02-19

### Added

- **Maritime Ingestion Payload Enhancement:** Extended the AIS poller to ingest `ShipStaticData`and`StandardClassBPositionReport`. Built specific ship cache handling with TTL cleanup for dynamic metadata enrichment.
- **TAK Protocol Evolution:** Upgraded the TAK Protocol (`tak.proto`) to include granular `vesselClassification` attributes (ship category, nav status, flag, dimensions, etc).
- **Expanded Filtering Matrix:** Added detailed sub-class toggles in `IntelFeed`and`TacticalMap` to separate sea traffic into 11 categories (Cargo, Tanker, Fishing, SAR, Military, Tug, etc) plus Drones for the air.
- **Tactical Entity Selection:** Added tactical orange outline and text color highlighting for priority special entities (SAR, Military, Law enforcement vessels, helicopters, drones) across the map and HUD.

### Changed

- **UI Streamlining**: Reduced visual clutter in `LayerFilters.tsx` by eliminating redundant collection headers.
- **Filter Harmonization**: Mapped "unknown" maritime objects intelligently to the `showSpecial` filter across both live intelligence and map replays.

## [0.7.2] - 2026-02-19

### Fixed

- **Dead Reckoning Heading Fallback:** Corrected a read-after-write bug where `drStateRef.current.get()`was called after`drStateRef.current.set()` for the same entity. The previous position used for bearing calculation was always identical to the new position (distance = 0), making the kinematic heading fallback dead code. New entities and entities with short trails now compute heading correctly from delta position.
- **Animation Loop Smoothing After Pause:** Capped the lerp `smoothDt`to 33ms independently of the outer`dt`(which is capped at 100ms for physics safety). At`dt=100ms`the old`smoothFactor` reached ~0.73, causing a 73% position jump in one frame when resuming after a GC pause or tab-switch. The new cap keeps blending gradual on resume.
- **Icon Rotation at 0°/360° Boundary:** `blendCourseRad`is now normalized to`[0°, 360°]`before being assigned as the entity`course`. The angle interpolation code uses `[-π, π]` range internally, which could produce negative degree values and incorrect icon rotation direction when crossing north.
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
  - ced `ARBI_MIN_DELTA_S` from 0.8s to 0.5s for lower latency.

  - d 30m spatial bypass to instantly capture fast maneuvers (high-G turns) that would otherwise be rate-limited.


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
  - titude Stems:** Vertical "drop lines" connecting aircraft to their ground shadow for precise 3D spatial awareness.

  - ound Shadows:** Dynamic projected shadows for airborne assets to aid depth perception.

  - mera Control:** New Pitch ($0^{\circ}-85^{\circ}$) and Bearing controls for tactical perspective.


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
  - tion: 10-stop Green -> Red (Altitude)

  - time: 5-stop Blue -> Orange (Speed)

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
  - Extended `CoTEntity`with`lastSourceTime`and`uidHash`.
  - Extended `TrailPoint`to 4-tuple`[lon, lat, alt, speed]`.
- **Refactoring:**
  - Removed legacy `aviation_ingest.yaml`and`maritime_ingest.yaml`.
  - Cleaned up unused imports in `MapContextMenu.tsx`.

### Fixed

- **Muted AOR Boundaries:** Mission areas are now rendered as subtle, solid "HUD" overlays (Aviation Circle & Maritime Square), with visibility synced to operator toggles.
- **Freezing:** Fixed entities locking in place during data gaps by relaxing interpolation clamp.
- **Build System:** Resolved TypeScript errors in `MapContextMenu.tsx`.

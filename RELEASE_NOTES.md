# Release - v1.1.1 - Core Rendering, Performance, and Position Stabilization

## Summary
Sovereign Watch **v1.1.1** is a patch release focusing on rendering pipeline optimization, client-side performance, tracking stabilization, and security hardening. It introduces frontend layer memoization and vendor code splitting to dramatically improve initial page load times and main-thread responsiveness, resolves a critical satellite position jump/surge bug, hardens news article extraction against DNS-rebinding SSRF attacks, and refactors UI control surfaces to improve keyboard and screen reader accessibility.

## Key Features

### ⚡ Rendering & Performance Optimization
* **Frontend Layer Caching (`LayerCache`)**: Implemented a keyed layer cache for static overlays (airspaces, cables, alerts, etc.) in `composeAllLayers()`, returning identical Layer instances across frames. This allows deck.gl to skip diffing and attribute re-uploads entirely, reducing per-frame CPU overhead.
* **Pulse Quantization**: Quantized shimmer pulse calculations to a 10 Hz interval (rather than 60 Hz), keeping static animated layers cached for consecutive frames.
* **Bundle Code-Splitting**: Code-split large chunks (Vite config `manualChunks` for `deck-gl`, `maplibre`, `mapbox`, and `echarts`) and lazy-loaded major routes (`TacticalMap`, `OrbitalMap`, `IntelGlobe`, `DashboardView`, and `RadioTerminal`), reducing the initial JavaScript payload from ~5MB to ~200KB.
* **Vectorized Groundtrack Propagation**: Batched ECEF-to-LLA conversion in `get_groundtrack` to process coordinate sequences using NumPy's vectorized functions in a single call, resulting in a **5x speedup** on the SGP4 pass path.
* **Track History Loop Optimization**: Precalculated the starting Julian date and step increments to step mathematically through fractional days, eliminating datetime construction and redundant conversions.

### 🛰️ Tracking & Position Stabilization
* **Epoch-Anchored Dead Reckoning**: Anchored the dead reckoning (`DRState`) blend time directly to SGP4 propagation epochs rather than message receive times, resolving persistent display lag and eliminating the startup "fast-forward" catch-up surge.
* **Teleport Guard & Frame Stall Reset**: Implemented a distance-based teleport guard in `interpolatePVB` to immediately snap elements when the visual-to-target gap exceeds normal bounds, and automatically clear visual state during long frame stalls (>1s) to prevent catch-up surges.
* **Antimeridian Crossing**: Unwrapped longitude updates to ensure entities snap cleanly across the antimeridian rather than wrapping around the globe.

### 🛡️ Security Hardening
* **SSRF DNS-Rebinding Mitigation**: Implemented a custom `SSRFSafeTransport` for httpx that resolves domain names to IP addresses exactly once, validates them against private/multicast ranges, and rewrites the request URL to target the validated IP. This closes the TOCTOU DNS-rebinding window on article extraction and RSS feed fetches.

### ♿ Operational Accessibility (A11y) Sweep
* **Form & Filter Labeling**: Added explicit `id` and corresponding `<label htmlFor="...">` attributes across all layer filters and visibility controls to support keyboard navigation and screen readers.
* **Button Safety & Types**: Added explicit `type="button"` attributes, ARIA labels, and custom focus indicators to standalone UI controls, mitigating accidental form submissions and popover close accessibility issues.

---

## Technical Details
* **Database Migrations**: No database schema migrations are introduced in this patch.
* **Verification Gates**: Passed all test suites on the host environment:
  * **Frontend**: `pnpm run lint` (clean), `pnpm run typecheck` (clean), `pnpm run test` (278/278 tests passed).
  * **Backend API**: `ruff check` (clean), `pytest` (158/158 tests passed).
  * **Space Pulse**: `ruff check` (clean), `pytest` (63/63 tests passed).

---

## Upgrade Instructions

To apply these updates, pull the latest changes and rebuild the development or production stack:

```bash
git pull origin dev
make dev  # or make prod
```

For production deployments, rebuild and restart the containers:
```bash
docker compose build sovereign-frontend sovereign-backend sovereign-space-pulse
docker compose up -d
```

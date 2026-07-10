# Release - v1.1.2 - Performance, Globe Visualization, and JS8Call Integration

Sovereign Watch v1.1.2 introduces critical performance optimizations, renders corrections for the 3D Global Situation view, fixes UDP bridge compatibility with JS8Call and KiwiSDR audio nodes, and includes an API information leakage security patch.

---

## High-Level Summary

This release resolves the visual artifact on the Global Situation globe view where night-shading appeared as a jagged, misplaced chord. It integrates `LayerCache` logic inside the globe view to prevent redundant 60Hz GPU buffer uploads. Startup delays for fresh map loads have been eliminated via WebSocket client last-value caching, concurrent RSS pre-warming, and Vite-level module preloading. In addition, JS8Call and KiwiSDR communication bridges have been corrected, and connection-level exception disclosures have been fully sanitized.

## Key Changes

* **Globe Visualization Improvements**:
  * Fixed 3D terminator Night overlay geometry by densifying pole-closing meridian edges to follow the sphere's curvature.
  * Memoized static global layer stack builders to eliminate CPU and GPU resource starvation on cold dashboard load.
  * Re-enabled depth-testing and depth-bias on globe night-shading to prevent far-hemisphere overlays from bleeding to the daylight side.
* **Cold-Start Map & Dashboard Optimizations**:
  * Added last-value caching (LVC) to the event broadcast manager to stream active tracks to fresh clients instantly on connect.
  * Implemented concurrent RSS fetching and stale-while-revalidate pre-warming loops to prevent blocked text widgets.
  * Hoisted critical Mapbox/MapLibre and Deck.gl module preloading links into the index template at build time.
* **Operational Hardware Integrations**:
  * Corrected the JS8Call UDP bridge listener model to dynamically route replies to active sender addresses and format lowercase API keys.
  * Aligned virtual KiwiSDR clients with standard plaintext password auth formatting.
* **Security & Stability Enhancements**:
  * Sanitized outbound news article connection exceptions to return generic status details instead of internal stack traces.
  * Vectorized SGP4 groundtrack propagation and ECEF-to-LLA conversions using NumPy arrays, yielding up to a 5x speedup.
  * Coalesced consecutive WebSocket updates into batches to prevent packet drops.

## Technical Details

* **Database Migrations**: None.
* **Dependencies**: None.
* **Performance Impact**:
  * CPU/GPU allocation churn reduced significantly in dense environments due to paced render cycles (30 FPS cap under load) and binary attribute uploads.
  * SGP4 propagation latency reduced by ~3.5x.
  * Event time parsing and LLA coordinate conversions improved by ~5x.
  * Map painting and dashboard news loading latency dropped from ~30s to near-instant.

## Upgrade & Deployment Instructions

To upgrade a local deployment to v1.1.2:

```bash
# 1. Pull the latest release changes
git fetch origin && git checkout dev && git pull

# 2. Rebuild and restart the container services
docker compose down
docker compose up -d --build
```

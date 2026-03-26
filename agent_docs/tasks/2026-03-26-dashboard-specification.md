# Technical Specification: Sovereign Watch Interactive Dashboard System

## 1. Executive Summary
This document outlines the architectural and technical design for the Sovereign Watch Interactive Dashboard System. Designed to provide real-time and historical analytics, container health monitoring, and system metrics, the dashboard is optimized for latency, utilizing 15-minute batch processing from Kafka-backed TAK normalized data and various intelligence pollers.

## 2. Infrastructure & Access
*   **Ingress & Routing:** Accessed securely via the existing `sovereign-nginx` reverse proxy under the `/stats` endpoint.
*   **Authentication & Authorization:** Integrates with the existing Sovereign Watch authentication patterns, ensuring only authorized operators can access sensitive metrics and intelligence pipeline health data.

## 3. Data Pipeline Architecture
*   **Data Sources:**
    *   Backend Ingestion Services: `aviation_poller`, `maritime_poller`, `space_pulse`, `rf_pulse`, `infra_poller`, and `gdelt_pulse`.
    *   Event Bus: `Redpanda` (Kafka-compatible) streams TAK Normalized Data (`tak.proto`).
*   **Processing Strategy (15-Minute Batches):**
    *   **Aggregation:** A dedicated backend microservice (e.g., `sovereign-stats-aggregator`) consumes the Redpanda streams.
    *   **Batching:** Data is buffered and processed in 15-minute tumbling windows to calculate rolling averages, event counts, and anomaly detection scores. This optimizes database writes and reduces query latency on the frontend.
    *   **Storage:** Aggregated time-series data is persisted to `sovereign-timescaledb` utilizing TimescaleDB continuous aggregates for lightning-fast retrieval.
    *   **Caching:** Current 15-minute window partial aggregations and container health state are cached in `sovereign-redis` for instant retrieval.

## 4. Frontend Architecture & Lazy Loading
*   **Framework:** React (Vite) integrating tightly with the existing frontend infrastructure.
*   **Code Splitting & Lazy Loading:**
    *   The `/stats` route and all associated visualization components are lazy-loaded utilizing React's `lazy` and `Suspense`. This ensures the main tactical map payload remains unaffected by the dashboard's heavy visualization libraries.
    *   Data fetching utilizes tools like React Query or SWR to handle caching, background updates, and pagination automatically.

## 5. Visualizations & WebGL Optimization
*   **Libraries:** 
    *   *Primary:* Recharts or Apache ECharts (for standard charts, graphs, and sparklines).
    *   *Geospatial/High-Volume:* Existing `Deck.gl` v9 integration for mapping high-density aggregated geospatial data (e.g., heatmaps of pulse activity).
*   **WebGL Optimization Strategies:**
    *   **Off-Main-Thread Processing:** Heavy data transformations and aggregation decimation are handled in Web Workers prior to rendering.
    *   **Instanced Rendering:** Deck.gl is leveraged for high-volume data points to minimize draw calls.
    *   **Viewport Culling & LOD:** Level of Detail (LOD) techniques are applied so only data visible within the current viewport or drill-down context is fully rendered.

## 6. Interactive Features
*   **Drill-Down Capabilities:**
    *   Users can click on high-level aggregations (e.g., "Total RF Pulses") to traverse down to specific frequency bands, temporal windows, or geographic regions.
    *   Drill-downs dispatch targeted queries to the FastAPI backend, fetching granular TimescaleDB records on-demand rather than pre-loading.
*   **Export Functionality:**
    *   *Client-Side Export:* CSV and PNG/SVG export capabilities for all charts directly in the browser.
    *   *Server-Side Export:* Scheduled or on-demand generation of comprehensive PDF reports via the backend API.

## 7. Container Health Monitoring
*   **Integration:** Hooks into Docker socket metrics or a lightweight Prometheus exporter scraped by the stats aggregator.
*   **Visuals:** Sparklines depicting CPU/Memory usage per service (`sovereign-ais-poller`, `sovereign-space-pulse`, etc.), restart counts, and ingestion latency.

## 8. Mobile Optimization
*   **Responsive Design:** Utilizing Tailwind CSS to reflow grid layouts from multi-column desktop views to stacked, touch-friendly mobile views.
*   **Touch Interactions:** Implementing touch-based pan/zoom for charts and ensuring drill-down targets exceed minimum touch target sizes (44x44 CSS pixels).
*   **Data Density Reduction:** Mobile views automatically request lower-fidelity aggregations to save bandwidth and rendering power on constrained devices.

## 9. A/B Testing Framework
*   **Implementation:** A lightweight React context provider evaluates feature flags (served from the Redis cache) to conditionally render experimental visualizations or layout permutations.
*   **Metrics:** Interaction events (clicks, export actions, time-on-page) are tracked and fed back into Redpanda to evaluate the efficacy of UI changes without cluttering standard application analytics.

# Release - v0.28.0 - Infrastructure & Outage Awareness

## Summary
Version 0.28.0 introduces a massive update to the project's infrastructure intelligence capabilities. The centerpiece is a new **Global Internet Outage** layer, which provides real-time situational awareness of network disruptions worldwide. This release also marks the introduction of the `infra_poller` microservice, significantly improving the performance and reliability of static infrastructure data.

## Key Features
- **Internet Outage Shading**: Real-time country-level disruption heatmap powered by IODA (Georgia Tech).
- **`infra_poller` Microservice**: New dedicated background service for IODA and Submarine Cable synchronization.
- **Polygon-Based Interaction**: Select entire countries to view detailed outage reports and severity scores.
- **Master Network Toggle**: Unified control for Cables, Stations, and Outages in the System Status widget.
- **Tactical Layer Rebalancing**: Recalibrated depth buffers to ensure infrastructure underlays never obscure tactical tracks or boundaries.

## Technical Details
- **Backend**: Python-based `infra_poller` service using `requests` and `redis`.
- **Frontend**: Transitioned from `ScatterplotLayer` markers to high-performance `GeoJsonLayer` country shading.
- **Rendering**: Established a consistent "tactical sandwich" using `depthBias` (-30 to -200).

## Upgrade Instructions
```bash
docker compose pull
docker compose up -d --build
```

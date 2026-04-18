# Release - v1.0.9 - Database Telemetry Hotfix

This emergency patch release targets a runaway CPU pipeline observed inside the TimescaleDB intelligence database that degraded platform responsiveness.

## Key Features

- **Structural Indexing for Landmass Filters:** Dark vessel detections check incoming satellite heat signatures against known terrestrial land boundaries to eliminate land-based false positives (like factories or forest fires). We've replaced the dynamic array parsing for these boundaries with native, statically indexed `GIST` Polygons. 
- **Drastic CPU Reduction:** Because PostGIS no longer builds Cartesian coordinate planes from scratch on every incoming operator request, TimescaleDB CPU utilization will drop from an artificial 700% floor back down to standard idle limits, ensuring long-term container health.

## Upgrade Instructions

```bash
git pull origin main
make prod
```

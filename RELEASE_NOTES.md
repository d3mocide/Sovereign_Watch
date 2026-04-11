# Release - v1.0.3 - Linkage Audit & UI Precision

This release solidifies production intelligence auditing by graduating the legacy GDELT experimental comparison view into a permanent, 7-layer admission funnel diagnostic tool. Operators can now explicitly audit exactly how and why geopolitical OSINT signals are admitted or suppressed against mission borders. Additionally, we’ve corrected a significant geographical alignment glitch causing extreme northwestern US coordinates (such as Portland, Oregon) to incorrectly classify to Canada due to spherical centerline distortions, and polished the AI Analyst interface with modernized header badging and auto-closing ghost panels.

## Key Features
- **Persistent Linkage Audit Diagnostic**: A permanent, dedicated `/linkage` diagnostic funnel accessible natively from the dashboard system top-bar to verify GDELT/TAK mapping integrity.
- **NA Boundary Distance Calibration**: Corrects massive-landmass geospatial drift errors mapping Oregon/Washington anomalies erroneously out of US control via new 49th-parallel bounding overrides.
- **Header-Mounted AI Engine Displays**: Reduced UI footprint in the AI Analyst Panel by promoting processing engine labels natively into the title header, freeing up tactical screen real estate below.
- **Ghost-View State Flush**: Top-level map routing now automatically resets floating panels (Clausal Context strings and AI Analyst popups), drastically smoothing map interaction tracking.

## Technical Details
- Adds new fallback mapping bounds inside the Haversine distance computations (`detect_mission_country`) bypassing centroid spherical checks.
- Deprecates `/test` routing interfaces and moves API routing to `fetch_linkage_audit` definitions with new UI defaults synchronizing dynamically out of `.env` configurations.

## Upgrade Instructions
Pull the latest tag into your production deployment and issue a fast teardown map to swap out the routing API blocks reliably:
```bash
git fetch --tags
git checkout v1.0.3
docker compose down
make prod
```

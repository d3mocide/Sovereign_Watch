# Release - v1.1.0 - Security, Orbital Feeds, and Accessibility Hardening

## Summary
Sovereign Watch **v1.1.0** represents a significant milestone in platform security, data ingestion reliability, performance optimization, and accessibility. It hardens news aggregation against advanced server-side request forgery (SSRF), migrates core satellite tracking to standard CelesTrak OMM CSV formats, and delivers a robust accessibility overhaul across high-use operator controls.

## Key Features

### 🛡️ Security Hardening
* **SSRF DNS-Rebinding Protection**: Hardened the `/api/news/article` extraction gateway to resolve target hostnames via DNS and actively filter resolved IP addresses against private, loopback, link-local, and multicast ranges before dispatching HTTP request handles.

### 🛰️ Orbital Feeds & Performance
* **CelesTrak OMM CSV Feed Migration**: Migrated the `space_pulse` orbital poller away from legacy, fixed-width TLE text endpoints to CelesTrak's modern OMM CSV feed format (`FORMAT=CSV`). Ingestion now uses standard `sgp4.omm` schemas to build orbital models without disrupting downstream SGP4 propagation or TAK event streams.
* **SGP4 Pass Prediction Optimization**: Deferred `strftime` formatting and dictionary allocations in the orbital pass predictor loop to execute only when satellites exceed the minimum elevation threshold, preventing up to **8,640 redundant allocations per window** and reducing CPU overhead.

### ♿ Operational Accessibility (A11y) Sweep
* **Keyboard & Screen Reader Access**: Integrated `aria-expanded`, `aria-controls`, and `onKeyDown` support for collapsible panels across the dashboard (such as accordion grids in `ListeningPost`).
* **Interactive Control States**: Bound `aria-pressed`, `aria-label`, and `aria-hidden` attributes across custom map toggles and NWS alerts widgets.
* **Semantic Disabled States**: Standardized watchlist buttons around `aria-disabled="true"` with custom tooltips, preserving focus capability for keyboard users.
* **Action Authorization Prompts**: Integrated dynamic `aria-label` feedback explaining authorization requirements for locked SITREP action panels.

### 🛠️ Ingestion & Packaging Compatibility
* **PEP 517 Standards**: Standardized Python packaging setups across microservices (`backend/api`, `aviation_poller`, `gdelt_pulse`, `js8call`) to eliminate setuptools flat-layout discovery errors.
* **Space Pulse Alignment**: Upgraded `asyncpg` to `0.31.0` for full Python 3.12 compatibility.

---

## Technical Details
* **Ingestion cache files** shifted suffix from `.tle` to `.omm.csv` to ensure clean cache transitions.
* All unit test and lint gates (frontend `272/272` tests, backend `158/158` tests, space pulse OMM validation tests) passed successfully.

---

## Upgrade Instructions

To apply these updates, pull the latest changes and rebuild the docker stack:

```bash
git pull origin dev
make dev  # or make prod
```

For production environments, rebuild and restart the containers to activate the updated frontend and backend services:
```bash
docker compose build sovereign-frontend sovereign-backend sovereign-space-pulse
docker compose up -d
```

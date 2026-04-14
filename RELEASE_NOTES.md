# Release - v1.0.5 - Glass Command

## High-Level Summary
This release, codenamed **"Glass Command"**, restores 100% visibility into the Sovereign Watch data fusion pipeline. Operators now have access to high-cadence real-time tracking of the **International Space Station (ISS)**, expanded tactical intelligence from global RSS feeds, and a high-density "Sovereign Glass" System Health HUD that eliminates UI clutter while providing deeper diagnostics.

## Key Features
- **Condensed "Sovereign Glass" Health HUD**: A complete redesign of the system monitoring interface, now featuring a 2-column high-density grid and consolidated SatNOGS tracking.
- **ISS Real-time Tracking**: Restored the 5-second polling loop for the International Space Station with full historical archival to TimescaleDB.
- **Tactical News Expansion**: Integrated mission-critical intelligence feeds including **UN News**, **The Aviationist**, **Defense News**, and **Reuters World**.
- **Telemetry Restoration**: Resolved persistent `PENDING` states for **Ocean Buoys (NDBC)** and **National Weather Service (NWS)** alerts by aligning heartbeat reporting with the centralized HUD registry.

## Technical Details
- **Poller Heartbeats**: All infrastructure pollers now use a unified Redis-backed heartbeat mechanism (`infra:last_*`).
- **Data Integrity**: Resolved a hypertable constraint issue in the ISS ingestion loop to ensure stable long-term tracking.
- **Aggregator Resilience**: Fixed heartbeat reporting gaps in the RSS aggregator, ensuring the service status is reflected even when serving from cache.

## Upgrade Instructions
To apply these updates, pull the latest changes and rebuild the service containers:
```bash
# Rebuild and restart the stack
docker compose up -d --build
```

**SITREP Status: [GO]**
**All Domain Agents Verified - Operational Stability Restored.**

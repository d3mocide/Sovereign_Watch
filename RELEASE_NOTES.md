# Release - v0.64.1 - Space Weather & Configuration Alignment

This patch restores the Space Weather and Geomagnetic intelligence feeds following upstream NOAA API changes, and performs a comprehensive audit and synchronization of docker-compose environment variables to ensure local configurations are fully respected.

### Key Features
- **NOAA API Resilience**: Overhauled scale parsing logic to tolerate upstream JSON format breaking changes (bare numbers vs strings) while maintaining prefix continuity for the frontend regex decoders.
- **Enlightened Intervals**: Over an entire suite of "ghost" environment variables—from peering intervals and infrastructure pulling thresholds to backend tracking limits and RSS arrays—are now correctly surfaced to `.env` control.

### Technical Details
- Removed the deprecated and orphaned `sovereign-net-ai` network.
- Correctly parsed `SCALES_INTERVAL_S` to resolve initialization crashes in Space Weather ingestion.

### Upgrade Instructions
To apply this update, rebuild the affected poller and backend containers:
```bash
git pull origin main
docker compose up -d --build
```

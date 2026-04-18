# Release - v1.0.8 - UI Telemetry Stabilization

This patch release shores up several tactical UI surfaces to resolve text overflow issues, eliminates redundant screen clutter, and completes the dashboard telemetry transition. 

## Key Features

- **Accurate Dashboard Stream Telemetry:** The stream status bar previously monitored legacy backend configurations, showing whether API keys were merely loaded. It now taps directly into the active polling registry to display the true, real-time health (`HEALTHY`, `STALE`, `ERROR`) of active streams like Maritime AIS, Aviation ADS-B, OSINT, and Orbital passes.
- **Responsive Alert Summaries:** Conflict and intelligence warning widgets now wrap threat-level counts to a clean sub-header row, improving layout scaling across all browser windows constraints.
- **Visual Decluttering:** The obsolete generic "ALERTS" indicator has been scrubbed from the top tactical map bar, returning more screen real estate to direct situational feeds.

## Upgrade Instructions

```bash
git pull origin main
make prod
```

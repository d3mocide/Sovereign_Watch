# Release - v0.52.0 - Tactical Intelligence Fusion

This release significantly enhances the "Tactical Premium" aesthetic of Sovereign Watch while hardening the underlying intelligence fusion pipeline. Operators now have access to a unified UI for AI analysis and strategic reporting, backed by a more robust and performant rendering engine.

### Key Features

*   **Premium AI Analyst Panel**: An overhauled, glassmorphic interface with persona-specific operational modes (Tactical, OSINT, SAR) and a unified control scheme.
*   **Tactical Holding Patterns**: Non-standard flight maneuvers are now automatically detected, visualized as amber-pulsed tactical zones, and integrated into the alerting system.
*   **Strategic SITREPs**: A new strategic reporting mode that aggregates global OSINT, network outages, and geopolitical events into a cohesive intelligence summary.
*   **Butter-Smooth Globe Rotation**: Planetary rotation jitter has been eliminated through an imperative animation loop, providing fluid 60FPS motion for the Situational and Intel globes.
*   **System Health History**: Poller health pips now show a 12-minute rolling history, making it easier to identify intermittent connectivity or ingestion failures at a glance.

### Technical Improvements

*   **API Stability**: Hardened the analysis backend against telemetry-missing edge cases and resolved Redis encoding regressions.
*   **Unified Telemetry**: Standardized poller identifiers across all internal APIs for better performance tracking and observability.
*   **Architecture**: Improved component encapsulation by moving map-specific UI state into individual globe providers.

### Upgrade Instructions

To upgrade your local or remote instance to `v0.52.0`:

```bash
# 1. Pull the latest code
git pull origin main

# 2. Rebuild and restart the tactical stack
docker compose up -d --build

# 3. (Optional) Force clear frontend assets if UI anomalies persist
cd frontend && pnpm run build
```

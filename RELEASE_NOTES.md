# Release - v1.0.10 - Sovereign HUD Unification

## Summary
This release focuses on UI/UX stability and critical production connectivity fixes. We have unified the tactical and orbital map HUDs into a single, vertically stacked container that eliminates panel overlaps and maintains perfect alignment with the right sidebar. Additionally, we have resolved a critical authentication regression in the JS8Call radio service and improved the accuracy of satellite telemetry.

## Key Features
- **Unified HUD Stacking**: All map-overlay widgets (NWS Alerts, Space Weather, Risk Analysis) now share a centralized vertical stack. Panels automatically reflow based on visibility and dynamically offset when the right sidebar is toggled.
- **JS8Call Auth Stabilization**: Restored production WebSocket connectivity for the JS8Call radio terminal by ensuring proper JWT token propagation.
- **Improved TLE Accuracy**: Increased satellite TLE refresh frequency from 24h to 6h to provide higher-fidelity orbital tracking.
- **HUD Layout Polish**: Standardized analyst panel width to 380px for better readability and removed redundant alert indicators to reduce HUD clutter.

## Technical Details
- **Frontend Refactor**: Moved map-overlay logic from `TacticalMap.tsx` and `OrbitalMap.tsx` to a centralized `mapHudStack` in `App.tsx`.
- **Python 3.12 Compliance**: Sanitized `datetime.utcnow()` calls across the ingestion stack to resolve deprecation warnings.
- **Resilient AI Caching**: Implemented automated retry logic for the AI semantic cache to handle transient Redis connectivity issues.
- **SQL Optimization**: Hardened the analysis router with explicit connection pooling for parallel fusion requests.

## Upgrade Instructions
To apply these updates, pull the latest changes and rebuild the containers:

```bash
git pull origin dev
make dev  # or make prod
```

If running in production, ensure you rebuild the frontend specifically to bake in the new HUD layout:
```bash
docker compose build sovereign-frontend
docker compose up -d
```

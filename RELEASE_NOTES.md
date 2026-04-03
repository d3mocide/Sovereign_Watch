# Release - v0.63.0 - Multi-INT Risk Fusion

## Summary
The **v0.63.0** release introduces three major capabilities for higher-confidence regional assessment: space-weather-aware suppression of false signal-loss alerts, persona-based autonomous domain analysis endpoints, and a new H3 composite risk heat-map pipeline. Together, these changes improve operational trust in alerting while expanding structured multi-INT risk context at both API and map layers.

## Key Features
- **Space Weather Alert Suppression**
- `SpaceWeatherSource` now polls NOAA scales (`R/S/G`) every 15 minutes.
- Sets Redis key `space_weather:suppress_signal_loss` with a 70-minute TTL when `R >= 3` or `G >= 3`.
- `EscalationDetector` now evaluates suppression via `should_suppress_signal_loss()`.
- AI Router skips SatNOGS signal-loss escalation when suppression is active, logs the reason, and emits suppression context.
- New endpoint: `GET /api/space-weather/alerts` (current scales + suppression state).

- **Domain Agent Endpoints (Backend API, Persona-Driven, H3 Regional Scope)**
- `POST /analyze/air` (Air Intelligence Officer persona): fuses ADS-B tracks, emergency squawk codes (`7700/7600/7500`), NWS alerts, and Kp-index GPS degradation context.
- `POST /analyze/sea` (MDA Specialist persona): fuses AIS tracks, NDBC wave-height conditions, and IODA outage/submarine cable landing correlation.
- `POST /analyze/orbital` (Space Weather / Orbital Analyst persona): fuses Kp-index, NOAA scales, SatNOGS signal-loss events, and suppression state.
- Shared response contract: `DomainAnalysisResponse` with `narrative`, `risk_score`, `indicators[]`, and `context_snapshot`.

Current UI note: the AI Analyst panel still uses `POST /api/analyze/{uid}`; these domain endpoints are currently available for direct API use and planned UI integration.

- **H3 Risk Heat-Map**
- New endpoint: `GET /api/h3/risk` computes composite risk for active H3 cells.
- Formula: `C = 0.6 * Density_norm + 0.4 * Sentiment_norm`.
- Density is normalized entity count per cell.
- Sentiment is inverted GDELT Goldstein signal (more negative -> higher risk).
- Supports resolutions `4`, `6`, and `9`.
- Redis cache TTL: 30 seconds.
- Persists snapshots to TimescaleDB `h3_risk_scores` hypertable.
- Frontend renders hex cells via `buildH3RiskLayer` with green -> yellow -> red gradient by `risk_score`.

## Additional Enhancements
- **NWS Alert Polling**: Infrastructure poller ingests active NWS weather alerts every 10 minutes into:
- `nws:alerts:active` (full GeoJSON)
- `nws:alerts:summary` (lightweight severity context)
- **Tactical NWS Alert Overlay**: Added Environmental toggle-controlled NWS alert polygons to Tactical map with severity styling, hover tooltip, and click-through right-sidebar weather details (`nws_alert`).
- **NWS Hover/Selection Reliability**: Improved 2D tactical picking by adjusting layer order above infra fills and normalizing feature classification into dedicated weather UI state.
- **Orbital Scope Decision**: NWS weather overlay is intentionally Tactical-only to keep orbital context focused on space-domain overlays.
- **IODA-Cable Correlation**: Outage features now include `nearby_cable_landings` when cable landings are within a 300 km radius.
- **Dashboard Tactical Risk UX**: Tactical-first CRIT RISK rendering refined to larger, hex-only, critical-filtered display for clearer AO visibility.

## Technical Notes
- Suppression prevents false-positive satellite signal-loss alerts during active severe radio blackout / geomagnetic conditions.
- Air domain logic detects emergency squawks and sustained holding behavior (>= 5 observations per UID).
- Sea domain logic detects dark-vessel and heavy-sea conditions (>= 4.0m waves), plus infra correlation indicators.
- Orbital domain logic now explicitly surfaces geomagnetic severity and suppression-aware signal-loss indicators.

## Upgrade Instructions
Apply the release with a standard pull and targeted rebuild:

```bash
git pull
docker compose up -d --build sovereign-backend sovereign-infra-poller
docker compose up -d --build sovereign-frontend
```

If maritime ingestion or related poller logic changed in your branch, also rebuild affected pollers:

```bash
docker compose up -d --build sovereign-ais-poller sovereign-adsb-poller sovereign-space-pulse sovereign-rf-pulse
```

# 2026-03-31-stats-dashboard-evolution.md - Stats Dashboard Tactical Expansion

## Issue
The SovereignWatch Stats Dashboard was limited to basic system vitals and CoT breakdowns. It lacked deep tactical intelligence regarding signal persistence, sensor coverage (radar), and fusion pipeline integrity, which are critical for the "Sovereign Glass" operational oversight mission.

## Solution
Evolved the dashboard into a high-density intelligence suite by adding three major tactical modules: Sensor Intelligence, Protocol Deep-Dive, and Fusion Audit. Standardized telemetry aggregation in the backend and implemented real-time visualizers (radar, gauges, occupancy charts) in the frontend.

## Changes

### Backend API
- **[MODIFY] [stats.py](file:///d:/Projects/Sovereign_Watch/backend/api/routers/stats.py)**:
    - Added `/api/stats/sensors`: Calculates target density by octant using geospatial azimuths and tracks signal integrity trend proxies (NIC/NACp).
    - Added `/api/stats/fusion`: Measures end-to-end pipeline latency and deduplication efficiency; forecasts storage growth.
    - Added `/api/stats/protocol-intelligence`: Aggregates signal persistence metrics and detects "Extreme Behavior" (High speed/altitude) for a priority watchlist.

### Frontend HUD
- **[NEW] [SensorIntelligenceTab.tsx](file:///d:/Projects/Sovereign_Watch/frontend/src/components/stats/SensorIntelligenceTab.tsx)**: Implements Tactical Radar and Detection Horizon breakdown.
- **[NEW] [FusionAuditTab.tsx](file:///d:/Projects/Sovereign_Watch/frontend/src/components/stats/FusionAuditTab.tsx)**: Implements Latency Gauges, Deduplication bars, and Storage Velocity forecasting charts.
- **[MODIFY] [ProtocolTab.tsx](file:///d:/Projects/Sovereign_Watch/frontend/src/components/stats/ProtocolTab.tsx)**: Added persistence bar charts and the Priority Watchlist with extreme behavior highlighting.
- **[MODIFY] [StatsDashboardView.tsx](file:///d:/Projects/Sovereign_Watch/frontend/src/components/views/StatsDashboardView.tsx)**: Orchestrated the new tab navigation and high-cadence data polling.
- **[MODIFY] [types.ts](file:///d:/Projects/Sovereign_Watch/frontend/src/components/stats/types.ts)**: Expanded type definitions for the new intelligence payloads.

## Verification
- Verified backend SQL queries for geospatial azimuth and distance calculations.
- Confirmed UI responsiveness under varying data density conditions.
- Validated "Extreme Behavior" logic (Mach 0.9+ / 45k+ FT) triggers tactical alerts in the Priority Watchlist.

## Benefits
- Provides operators with immediate geospatial awareness of sensor coverage.
- Identifies potential high-threat targets through automated behavior analysis.
- Enables proactive infrastructure management through storage velocity forecasting.

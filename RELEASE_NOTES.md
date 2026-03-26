# Release - v0.50.0 - Interactive Dashboard MVP + Batched Analytics

This release introduces the first iteration of the **Sovereign Watch Dashboard System**, providing high-performance, batched analytics and container health monitoring. The system leverages 15-minute tumbling windows in TimescaleDB and the new `/stats` route with React lazy loading to keep the platform responsive.

## High-Level Summary

v0.50.0 adds a dedicated analytics view to the Sovereign Watch ecosystem. While the tactical map remains the primary operational HUD, the new dashboard allows operators to track long-term signal trends, export telemetry for external analysis, and verify the health of all containerized pollers. The implementation uses a high-performance aggregation strategy on the backend and Apache ECharts on the frontend, ensuring the system remains responsive even with deep historical datasets.

## Key Features

### Interactive System Dashboard (`/stats`)
- **Activity Visualization**: A new ECharts-powered time-series chart showing signal frequency across Aviation, Maritime, and Satellite domains over the last 24 hours.
- **Container Health Grid**: Real-time status monitoring for all 12 backend ingestion pollers with color-coded health indicators (Healthy, Stale, Error, Pending).
- **Data Export**: One-click CSV export of the current 24-hour telemetry aggregation for offline analysis.
- **Lazy Loading**: The entire dashboard is code-split; it only consumes resources when the user navigates directly to the stats view.

### Batched Analytics Pipeline
- **FastAPI /api/stats Router**: New endpoints for fetching bucketed track counts and consolidated container heartbeats.
- **TimescaleDB Aggregation**: SQL logic using `time_bucket` to provide efficient 15-minute signal summaries without querying raw track logs in the animation thread.
- **Redis Health Integration**: Direct integration with poller health keys for millisecond latency on container status reporting.

## Technical Details

### Dashboard Routing
- Standard `main.tsx` now supports lazy-loaded entry points via React `Suspense`. 
- The `/stats` path is detected at the root level to prevent initialization of the WebGL Tactical Map when only stats are needed.

### Aggregation Strategy
1. **Query**: `SELECT time_bucket('15 minutes', time) AS bucket ... FROM tracks ... GROUP BY bucket`
2. **Frequency**: Aggregations are calculated on-the-fly via the API, targeting a 24-hour lookback window.
3. **Frontend Cache**: ECharts component handles state management for the activity series, allowing smooth interaction without re-fetching on every frame.

## Upgrade Instructions

### 1. Update Environment & Pull
```bash
git pull origin dev
```

### 2. Frontend Dependencies
The dashboard requires `echarts` and `echarts-for-react`.
```bash
cd frontend
pnpm install
```

### 3. Backend Verification
Verify the new stats router is active.
```bash
cd backend/api
python -m pytest
```

### 4. Deployment
Rebuild the frontend and backend API containers to pick up the new router and route splitting.
```bash
docker compose up -d --build sovereign-frontend sovereign-backend
```

## Known Limitations
- **Drill-down**: Currently a UI placeholder; deep-dive into individual tracks from the chart is slated for v0.50.0.
- **Mobile Grid**: The health status list is optimized for widescreen; mobile stacking is functional but may require horizontal scrolling on very narrow devices.

---

**Release Date**: 2026-03-26  
**Stability**: Stable (MVP Release)  
**Components Modified**: Frontend (main, DashboardView), Backend API (stats_router)

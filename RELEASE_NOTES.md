# Release - v0.48.0 - GPS Integrity Monitoring + Poller Health + OpenSky Robustness

This release introduces comprehensive GPS integrity jamming detection with AI analysis support, real-time poller health monitoring across all data sources, and improved OpenSky API resilience for reliable global aircraft tracking. The frontend receives improved modularity through dedicated entity processing engines, and the backend gains enterprise-grade health observability.

## High-Level Summary

v0.48.0 shifts the platform toward **intelligent signal-integrity awareness** and **operational health visibility**. When the aviation poller detects correlated GPS degradation (low NIC/NACp clusters in H3 cells), jamming zones now render on the map with full AI analyst support. Operators see real-time health status for all 12 poller types—tracking whether each source is current, stale, errored, or missing credentials. The OpenSky client now handles rate-limiting gracefully with separate pacing for bbox vs. watchlist queries and automatic respect for server-provided Retry-After headers.

## Key Features

### GPS Integrity Jamming Detection (End-to-End)
- **Map Rendering**: Active jamming zones render as styled ScatterplotLayer features with pulse animation and hover tooltips.
- **Sidebar Analysis**: Click any zone to open detailed analysis panel with confidence trends, affected track counts, and NIC/NACp metrics.
- **AI Integration**: Jamming entities flow through the analysis router with synthesized track summaries for tactical AI comments.
- **Trend Visibility**: 24-hour confidence sparkline with +/− trend delta shows jamming intensity movement over recent incident history.
- **Filter Management**: GPS Integrity Zones toggles in both tactical (environmental group) and orbital (quick pills) views.

### Poller Health Monitoring
- **Real-Time Dashboard**: `SystemHealthWidget` displays status for 12 pollers across 5 categories (Tracking, Orbital, Environment, Intel, RF, Infrastructure).
- **Status Indicators**: Visual feedback for healthy (green), stale (amber), error (red), no-credentials (gray), and pending (neutral) states.
- **Timestamp Visibility**: Human-readable "last success" and "last error" ages so operators know data freshness at a glance.
- **Credential Validation**: Health checks verify environment variables and API keys are configured for each poller.
- **Stale Detection**: Per-poller thresholds (5 min for real-time tracking, 30 days for reference data) detect stalled ingestion.

### OpenSky API Robustness
- **Separate Rate Limiters**: Independent `OPENSKY_WATCHLIST_RATE_LIMIT_PERIOD` for slower testing pacing (e.g., 120s watchlist vs. 22s bbox).
- **Retry-After Compliance**: Client automatically honors OpenSky's `Retry-After` response header, reducing hammering during transient limits.
- **Cooldown Escalation**: Consecutive penalties now escalate properly even when retries occur after cooldown expiry.
- **Error Logging**: All poller errors logged to Redis with throttled heartbeat to centralize observability.

### Frontend Modernization
- **Entity Processing Engines**: Extracted `EntityFilterEngine.ts` and `EntityPositionInterpolator.ts` to improve code organization and testability.
- **Layer Visibility Extraction**: `LayerVisibilityControls.tsx` consolidates map layer UI logic for easier iteration.
- **System Status Refactor**: `SystemStatus.tsx` now focuses on orchestration with delegated layer/integration concerns.
- **Intelligence Feed Throttling**: 1-second per-category throttle reduces "wall of text" visual noise while preserving critical alert immediacy.

## Technical Details

### GPS Integrity Jamming (Backend Flow)
1. Aviation poller ingests ADS-B with NIC/NACp fields from ADSBx/OpenSky.
2. JammingAnalyzer detects correlated degradation in H3-6 cells; confidence scored by NIC severity + Kp geomagnetic activity.
3. Zones published to Redis key `jamming:active_zones` with 10-minute TTL (auto-refreshed on each detection).
4. Frontend queries `/api/jamming/active` and `/api/jamming/history?hours=24` for map rendering and sidebar sparkline.
5. Analysis router fallback recognizes `jamming-<h3>` UIDs and synthesizes track_summary from Redis + history.

### Jamming Assessment Types
- **`jamming`**: High confidence, low Kp → Likely intentional/localized interference.
- **`space_weather`**: Low confidence, high Kp → Solar activity driving ionospheric degradation.
- **`mixed`**: Elevated Kp + mid-range confidence → Blended causes.
- **`equipment`**: No area clustering → Single-receiver fault (receiver error, antenna issue).

### Poller Health Architecture
- Each poller writes heartbeat to Redis key `<poller>:last_fetch` with timestamp and optional error text.
- Errors logged to `<poller>:error` with throttled writes (min 30s interval to reduce Redis load).
- Health endpoint queries Redis state + validates environment credentials; frontend consumes `/api/config/poller-health` on demand.
- Stale thresholds are per-poller (e.g., ADSB: 5 min; FCC towers: 30 days; SatNOGS TLE: 1 day).

### OpenSky Client Improvements
- Separate `AsyncLimiter` instances for bbox and watchlist ensure independent rate-limit compliance.
- Watchlist mode can use slower pacing (e.g., 120s) for testing without affecting local bbox queries.
- Retry-After handling: client sleeps before next request if server specifies delay.
- Cooldown state properly escalates across penalty attempts, preventing repeated hammering.

### Dependency Security
- New audit script (`tools/audit-deps.sh`) scans 7 components for CVEs across uv (6 Python projects) and pnpm (1 Node.js project).
- Frontend overrides for flatted and fast-xml-parser patched to known-safe versions.
- CI workflow now runs `audit-deps.sh` as part of security checks.

## Upgrade Instructions

### 1. Pull & Checkout
```bash
git pull origin main
git checkout main  # or your deployment branch
```

### 2. Frontend Verification & Build
```bash
cd frontend
pnpm install  # if lockfile changed
pnpm run lint && pnpm run test
docker compose build sovereign-frontend
```

### 3. Backend Verification & Build
```bash
cd backend/api
python -m pytest
python -m pytest backend/ingestion/*/tests  # poller unit tests
```

### 4. Environment Configuration (Optional)
If testing OpenSky watchlist with custom rate limits, add to `.env`:
```env
OPENSKY_ENABLED=true
OPENSKY_WATCHLIST_ENABLED=true
OPENSKY_RATE_LIMIT_PERIOD=22          # bbox queries (default: auth=22s, anon=300s)
OPENSKY_WATCHLIST_RATE_LIMIT_PERIOD=120  # watchlist queries (optional, defaults to bbox)
```

### 5. Restart Services
```bash
# Stop all services
docker compose down

# Rebuild & restart with new code
docker compose up -d --build

# Verify all services are healthy
docker compose ps
```

### 6. Validate Health Monitoring
1. Open the map UI.
2. Click the **System Health** widget (top-right corner).
3. Verify all poller statuses (healthy/stale/error) display and update when widget is open.
4. Check one poller in `docker compose logs <service>` to confirm error logging to Redis.

### 7. Test Jamming Detection
1. In the tactical view, ensure **GPS Integrity Zones** toggle is ON in settings.
2. If live ADS-B shows GPS degradation, zones will render on map.
3. Click any zone to open right-sidebar jamming analysis.
4. Verify confidence sparkline loads (or shows "No trend history" if <24h data).
5. Click "Analyze" button to see AI analyst comments.

## Breaking Changes

**None**. All API endpoints and TAK protocol remain backward-compatible. Existing clients will continue to function; GPS integrity features are opt-in via UI toggles.

## Performance Notes

- Jamming analysis runs every 30 seconds (configurable via `_jamming_analysis_interval` in PollerService).
- Health endpoint caches Redis state for 10 seconds to reduce polling overhead.
- Entity filtering uses separate workers for staleness checks, reducing main render thread load.

## Known Limitations

- **Jamming sparkline history**: Requires events in `jamming_events` database table; synthetic test data does not persist without manual database injection.
- **OpenSky watchlist**: First-run sync can be slow if many ICAO24s are queued; consider seeding with targeted affiliation types.
- **Poller health**: Stale thresholds are hardcoded per source; future releases may expose as environment variables.

## Support & Feedback

- **Bug Reports**: Check existing task logs in `agent_docs/tasks/` for known issues.
- **Feature Requests**: Report via standard PR workflow with context in issue templates.
- **Deployment Issues**: Consult `Documentation/Deployment.md` or CI logs in `.github/workflows/`.

---

**Release Date**: 2026-03-25  
**Stability**: Stable (production-ready)  
**Components Tested**: Frontend (lint + 36/36 tests), Backend API (23 passed), Ingestion (unit tests), CI (smoke workflow)

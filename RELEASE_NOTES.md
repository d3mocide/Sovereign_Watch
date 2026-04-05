# Release - v0.65.0 - Cluster Intelligence & Globe Situational Awareness

## Summary

v0.65.0 delivers the Spatial-Temporal Intelligence Fusion pipeline: a pure-Python ST-DBSCAN engine and a Hidden Markov Model trajectory classifier are now integrated into the escalation detection pipeline, enabling the system to automatically identify entity clusters and classify behavioral states (loitering, transiting, maneuvering, holding, anomalous) from raw track data. This release also ships the full frontend visualization stack for cluster data — teal-coded octagon overlays on the tactical map and dashboard MiniMap, a scrollable ClusterView sidebar, and cluster-aware hover tooltips — plus a major SituationGlobe upgrade that replaces static outage layers with live country-level conflict heat derived from GDELT actor threat assessments.

## Key Features

- **ST-DBSCAN Clustering Engine**: Detects spatially and temporally co-located entity groups using Haversine distance and a configurable temporal gate. Results exposed via `GET /api/ai_router/clusters` and fed into `evaluate_regional_escalation()` before risk scoring.
- **HMM Behavioral State Classification**: 5-state Hidden Markov Model (loitering / transiting / maneuvering / holding / anomalous) over 27 observation symbols derived from speed, turn rate, and altitude. Viterbi decoding in log-domain for numerical stability. Results available at `GET /api/ai_router/trajectory/{uid}` and persisted to the `trajectory_states` TimescaleDB hypertable.
- **Cluster UI — Teal Octagon Zones**: `buildClusterLayer` renders geographic octagon polygons with a teal palette (distinguishable from amber hazards and green air tracks). Entity labels use `CollisionFilterExtension` for dedup at all zoom levels.
- **ClusterView Sidebar**: Scrollable right-sidebar panel listing cluster entity UIDs, entity count, dominant behavioral state, and threat badge — auto-dismisses when the cluster is deselected.
- **MiniMap Cluster Octagons**: Dashboard tactical overview (MapLibre) now fetches cluster zones and renders them as geographic octagon fill + outline polygons in teal, matching the tactical map representation.
- **SituationGlobe Country Conflict Heat**: Countries highlighted in red (CRITICAL), amber (ELEVATED), or yellow (MONITORING) based on live GDELT actor threat levels polled every 5 minutes. The terminator night shadow renders above this layer, correctly tinting conflict zones on the dark side of the globe.
- **H3 Risk Zoom Breakpoints Fixed**: Zoom-to-resolution mapping aligned to the three resolutions the backend actually supports (4 / 6 / 9), eliminating silent fallback from invalid res-7/8 requests.

## Technical Details

### New Files
- `backend/api/services/stdbscan.py` — ST-DBSCAN with `STDBSCANResult` / `Cluster` dataclasses
- `backend/api/services/hmm_trajectory.py` — HMM with lazy model initialization, Viterbi decoding
- `backend/api/tests/test_stdbscan.py` — 11 unit tests
- `backend/api/tests/test_hmm_trajectory.py` — 13 unit tests
- `frontend/src/components/layouts/sidebar-right/ClusterView.tsx` — cluster detail sidebar

### Breaking / Notable Changes
- `test_stubs.py`: Mock `numpy` removed — downstream tests must use the real installed numpy package.
- `trajectory_states` hypertable added via migration `V002` (applied automatically on next `docker compose up`).
- `SituationGlobe`: `showOutages` and `showIXPs` now default to `false`; operators relying on outage overlays in the globe view should use the Tactical Map or OrbitalMap instead.
- `TerminatorLayer`: Added `depthTest: false` — the terminator is now a pure transparent overlay that never occludes surface layers. This is the correct behavior for a globe night mask and is not a regression.

### Test Coverage
- 82 backend tests pass
- Ruff lint clean (backend API + all ingestion pollers)
- Frontend lint clean

## Upgrade Instructions

```bash
# Pull latest
git pull origin main

# Rebuild affected services (backend API received new routes + services)
docker compose up -d --build sovereign-backend

# Frontend hot-reload picks up changes automatically in dev;
# for production rebuild the frontend image:
docker compose up -d --build sovereign-frontend

# Verify trajectory_states migration was applied
docker compose exec sovereign-timescaledb psql -U sovereign -c \
  "SELECT * FROM schema_migrations ORDER BY version;"
```

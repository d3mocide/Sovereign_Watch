# Sovereign Watch Geospatial Data Layers — Implementation Roadmap

**Status**: Research complete. NDBC remains active; the SMAPS advisory workstream has been retired.
**Date**: March 28, 2026
**Session**: claude/geospatial-data-layers-HIhaw

---

## Documents in This Series

This research initiative spans three coordinated documents:

1. **research-geospatial-data-layers-implementation.md** — Detailed technical evaluation of 5 intelligence domains (including the retired NGA SMAPS option)
2. **poller-consolidation-strategy.md** — Architectural analysis of existing pollers + consolidation options for NDBC, retired advisory work, and NOTAM integration
3. **IMPLEMENTATION_ROADMAP.md** (this document) — Sprint-level execution plan with task breakdown

---

## Strategic Context

### Problem Statement
Sovereign Watch currently has strong air/space/RF intelligence but **critical gaps** in:
- **Ocean/Maritime baseline** (sea state, thermal baseline for AIS anomaly detection)
- **Maritime threat intelligence** (piracy, safety warnings)
- **Airspace restrictions** (NOTAMs for tactical flight planning)
- **Cross-domain fusion** (correlating AIS gaps with sea state, RF/jamming activity, FAA airspace)

### Solution Overview
Integrate three authoritative government data sources with **data sovereignty** (no commercial APIs) and **minimal operational overhead** (consolidate into existing pollers):

| Domain | Source | Schedule | Data Type |
|--------|--------|----------|-----------|
| **Ocean** | NDBC latest_obs.txt | 15 min | 7 oceanographic observations per buoy |
| **Maritime Threat** | Retired SMAPS workstream | Sunset | Historical only |
| **Airspace** | AviationWeather.gov REST | 5 min | FAA NOTAMs, TFRs, MOAs |

### Consolidation Decision
**Extend infra_poller for NDBC** (Option A, recommended):
- Reuses existing async orchestration, Redis/PostgreSQL patterns
- No new container (current infra_poller mem ~150MB → ~210MB with additions)
- NOTAM integration deferred to Phase 2 (separate lightweight poller if needed)
- **Effort**: ~50 hours total

---

## Executive Sprint Plan

### Phase 1: Foundation (Weeks 1–2) — ~30 hours

**Deliverable**: NDBC poller + layer rendering

#### Backend Tasks
- [ ] Create `backend/ingestion/infra_poller/sources/ndbc.py` (NDBC API client)
- [ ] Create `backend/ingestion/infra_poller/sources/ndbc_station_metadata.py` (station lat/lon lookup cache)
- [ ] Modify `backend/ingestion/infra_poller/main.py` → add `ndbc_loop()`, integrate into `run()`
- [ ] Update `backend/db/init.sql` → ndbc_obs hypertable + continuous aggregate
- [ ] Update `backend/ingestion/infra_poller/pyproject.toml` → add h3, pytz
- [ ] Update `backend/ingestion/infra_poller/Dockerfile` as needed for active poller dependencies
- [ ] Create API endpoint: `GET /api/buoys/latest?bbox={bounds}` (FastAPI)
- [ ] Extend `backend/ingestion/infra_poller/tests/test_infra.py` → TestNDBCSource

#### Frontend Tasks
- [ ] Create `frontend/src/layers/buildNDBCLayer.ts` (ScatterplotLayer, radius=WVHT m, color=WTMP °C)
- [ ] Update `frontend/src/layers/composition.ts` → add NDBC to z-order (between cables and jamming)
- [ ] Update `frontend/src/components/map/TacticalMap.tsx` → add filter: `showBuoys` + API query
- [ ] Add NDBC layer to filter UI (checkbox)
- [ ] Implement hover tooltip: buoy_id, WVHT, WTMP, WSPD, updated time

#### Verification
```bash
# Backend
cd backend/api && python -m pytest tests/test_buoy_api.py -v
cd backend/ingestion/infra_poller && ruff check . && python -m pytest

# Frontend
cd frontend && pnpm run test -- --testPathPattern="buildNDBCLayer"
cd frontend && pnpm run lint
```

#### Deployment
```bash
# Update docker-compose.yml environment variables
docker compose build sovereign-infra-poller
docker compose restart sovereign-infra-poller

# Verify data ingestion
docker compose exec sovereign-timescaledb psql -U postgres -d sovereign_watch \
  -c "SELECT COUNT(*) FROM ndbc_obs WHERE time > NOW() - INTERVAL '1 hour';"
```

---

### Phase 1.5: Maritime Advisory Evaluation (Retired)

This workstream was retired and should not be scheduled for implementation.

---

### Phase 2: Maritime Intelligence (Retired)

The SMAPS-backed maritime advisory path has been sunset and removed from active scope.

The product now uses buoy-driven maritime conditions only.

---

### Phase 3: Cross-Domain Fusion (Weeks 5–6) — ~20 hours

**Deliverable**: Multi-source correlation queries + 3 analytical workflows

#### Backend Tasks (SQL + API)
- [ ] Create materialized view: `maritime_conditions_risk` (sea state baseline + compatibility scoring)
- [ ] Create function: `ais_track_at_risk(vessel_mmsi)` → returns nearby maritime conditions context
- [ ] Create function: `sea_state_context(lat, lon)` → nearest NDBC buoy + Z-score flag
- [ ] Create function: `dark_vessel_candidates(agg_period='3h')` → (deferred to VIIRS phase)
- [ ] Implement 3 fusion queries (see research-geospatial-data-layers-implementation.md Section 9):
  1. **Vessel Risk Assessment** — AIS track near sea-state anomaly + conditions score
  2. **Sea State Anomaly** — NDBC outliers + nearby AIS gaps
  3. **Multi-Domain Incident** — NOTAM + AIS in same bounding box

#### Frontend Tasks
- [ ] Add "Risk Assessment" panel to HUD (shows vessels in adverse conditions)
- [ ] Highlight at-risk vessels on map (amber ring overlay)
- [ ] Tooltip enrichment: "Maritime conditions: ELEVATED"
- [ ] Add "Sea State Baseline" toggle → color NDBC buoys by anomaly (Z-score tier)

#### Deployment Validation
```bash
# Test fusion queries
docker compose exec sovereign-timescaledb psql -U postgres -d sovereign_watch << EOF
SELECT COUNT(*) FROM ais_tracks ais
  WHERE ais.time > NOW() - INTERVAL '1 hour';
EOF
```

---

## Optional: Phase 4 (NOTAM Integration)

**Timing**: Defer to separate sprint if Phase 1–3 complete before end of sprint cycle

### Decision Point: Extend aviation_poller vs New notam_poller

**Extend aviation_poller** (simpler integration):
- Add `NOTAMSource` to multi_source_poller.py
- Output to same `adsb_raw` topic with distinct event type
- Complexity: Mixing point aircraft events + polygon airspace restrictions (different data models)
- Effort: ~20 hours

**New lightweight notam_poller** (recommended):
- Dedicated REST poller → aviationweather.gov API
- Output to separate `notam_raw` topic
- Clean separation, independent testing/deployment
- Effort: ~25 hours

#### Backend (notam_poller)
- [ ] Create `backend/ingestion/notam_poller/` service (clone infra_poller structure)
- [ ] Implement `sources/aviationweather.py` (REST client)
- [ ] Add `notams` table to schema (if not already done in Phase 1)
- [ ] Create API: `GET /api/notams?bbox={bounds}&severity=CRITICAL`
- [ ] Tests: parse NOTAM JSON, verify radius_meters conversion (NM → 1852m)

#### Frontend
- [ ] Create `frontend/src/layers/buildNOTAMLayer.ts` (ScatterplotLayer + GeoJsonLayer)
- [ ] Critical NOTAM pulsing animation (red outline, 1s pulse)
- [ ] Z-order placement (above jamming, below entities)
- [ ] Critical alert: WebSocket push on TFR activation (toast notification)

#### Deployment
```bash
docker compose build sovereign-notam-poller
docker compose up -d sovereign-notam-poller
docker compose logs -f sovereign-notam-poller
```

---

## Database & API Endpoints Summary

### New PostgreSQL Tables
| Table | Purpose | Hypertable | Retention |
|-------|---------|-----------|-----------|
| `ndbc_obs` | Buoy observations | Yes (time) | 30 days |
| `nav_warnings` | Safety warnings | No | Active only |
| `notams` | FAA airspace restrictions | Yes (time) | 14 days |

### New Redis Keys
| Key | Purpose | TTL | Update |
|-----|---------|-----|--------|
| `ndbc:last_etag` | ETag caching | None | Per fetch |
| `poller:ndbc:last_fetch` | Cooldown tracking | None | Per loop |
| `poller:ndbc:last_error` | Error logging | 1 day | On failure |
| `maritime:conditions` | Cached maritime conditions summary | 1 day | On refresh |

### New FastAPI Endpoints
```
GET /api/buoys/latest?bbox={W},{S},{E},{N}
  → Returns: Array of BuoyObservation (lat, lon, WVHT, WTMP, WSPD, updated_at)

GET /api/maritime/risk-assessment?mmsi={MMSI}
  → Returns: { vessel, nearby_incidents, threat_level, sea_state }

GET /api/notams?bbox={W},{S},{E},{N}&severity=CRITICAL
  → Returns: Array of NOTAM (geom, radius_meters, type, valid_from, valid_to)
```

---

## Effort Estimation

| Phase | Task | Hours | Owner | Notes |
|-------|------|-------|-------|-------|
| 1 | NDBC API client + tests | 8 | Backend | HTTP + ETag caching |
| 1 | NDBC hypertable + continuous agg | 6 | DBA | TimescaleDB setup |
| 1 | NDBC layer rendering | 10 | Frontend | ScatterplotLayer, composition |
| 1 | NDBC API endpoint | 6 | Backend | FastAPI integration |
| **Phase 1 Total** | | **30** | | |
| 2 | Retired advisory workstream | 0 | N/A | Sunset |
| **Phase 2 Total** | | **0** | | |
| 3 | Fusion query development (3 workflows) | 15 | Backend/SQL | Cross-domain correlation |
| 3 | Risk assessment panel + HUD enrichment | 12 | Frontend | Interactive features |
| **Phase 3 Total** | | **27** | | |
| 4 (Optional) | NOTAM integration (new poller) | 25 | Backend | aviationweather.gov REST |
| 4 (Optional) | NOTAM layer + alerts | 15 | Frontend | Pulsing animations |
| **Phase 4 Total** | | **40** | | |
| **GRAND TOTAL** | (Phases 1–3) | **~89 hours** | Multi-team | (~2 sprints) |

---

## Risk & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| NDBC station metadata lookup slow | High | Cache metadata in Redis, refresh weekly |
| NGA API downtime (maintenance window) | Medium | Graceful degradation, skip to next scheduled fetch |
| Jetson Nano memory pressure (NDBC + existing pollers) | Medium | Monitor memory via `docker stats`, increase swap if needed |
| GDAL library missing in container | High | Update Dockerfile to explicitly install gdal-bin |
| Time zone issues in retired advisory experiments | Low | Historical only; not part of active runtime scope |

---

## Success Criteria

### Phase 1 (NDBC)
- ✅ NDBC data flowing into PostgreSQL (verify: `SELECT COUNT(*) FROM ndbc_obs WHERE time > NOW() - INTERVAL '1 hour'` returns > 100 rows)
- ✅ Frontend map shows buoy dots colored by water temperature
- ✅ Hover tooltip displays WVHT, WTMP, WSPD
- ✅ Pnpm lint + tests pass
- ✅ Backend tests pass (ruff + pytest)

### Phase 2 (Retired)
- The SMAPS-backed advisory path is no longer active.

### Phase 3 (Fusion)
- ✅ Risk assessment query returns at-risk vessels in adverse maritime conditions
- ✅ HUD panel updates in real-time as AIS tracks move
- ✅ Sea state anomaly detection flags outliers (Z-score > ±2)

---

## Testing Strategy

### Unit Tests (Per CLAUDE.md)
```bash
# Backend: Run on host (no Docker)
cd backend/api && ruff check . && python -m pytest tests/test_buoy_api.py
cd backend/ingestion/infra_poller && ruff check . && python -m pytest

# Frontend: Run on host
cd frontend && pnpm run lint && pnpm run test -- --testPathPattern="NDBC|Maritime"
```

### Integration Tests (With Docker)
1. **NDBC Ingestion**:
   - Start infra_poller, verify `ndbc_obs` table populated within 15 min
   - Confirm ETag caching works (no re-fetch if unchanged)
   - Verify anomaly baseline continuous aggregate computes hourly

3. **Frontend Rendering**:
   - Load TacticalMap with `showBuoys=true`
   - Verify ScatterplotLayer appears at correct zoom levels
   - Verify hover tooltip displays all fields
4. **End-to-End**:
  - Simulate AIS vessel near a sea-state anomaly
   - Verify risk assessment query returns result
   - Verify HUD panel highlights vessel

---

## Git Workflow

**Branch**: `claude/geospatial-data-layers-HIhaw` (specified in CLAUDE.md)

```bash
# Initial commit: Schema + consolidation docs
git add agent_docs/
git commit -m "docs: Add geospatial data layers research and consolidation strategy"

# Phase 1 commits
git commit -m "feat: Add NDBC buoy poller to infra_poller service"
git commit -m "feat: Add NDBC layer rendering (ScatterplotLayer)"
git commit -m "feat: Add buoys API endpoint"
git commit -m "test: Add NDBC source tests"

# Final push to branch
git push -u origin claude/geospatial-data-layers-HIhaw
```

---

## Next Steps

1. **Immediate** (Today):
   - Review this roadmap with team
   - Approve consolidation strategy (Option A: Extend infra_poller)
   - Assign Phase 1 tasks to backend + frontend leads

2. **This Sprint**:
  - Complete Phase 1 (NDBC) — 2 weeks
  - Keep retired advisory work out of runtime scope

3. **Next Sprint**:
  - Continue Phase 3 (Fusion)

4. **Following**:
   - Phase 3 (Fusion queries + HUD) — 1.5 weeks
   - Phase 4 (NOTAM) — if capacity remains

---

## References

- **d3FRAG Networks Research**: `research-geospatial-data-layers-implementation.md`
- **Poller Architecture**: `poller-consolidation-strategy.md`
- **CLAUDE.md Constraints**: Verification strategy, container testing
- **GitHub**: https://github.com/d3mocide/Sovereign_Watch

---

## Appendix: Code Snippets & Configuration

### Environment Variables (docker-compose.yml additions)
```yaml
environment:
  NDBC_POLL_INTERVAL_SECONDS: 900
```

### Memory Budget
```
Existing services:
  - sovereign-timescaledb: 1 GB
  - sovereign-redpanda: 800 MB
  - sovereign-frontend: 200 MB
  - sovereign-backend: 400 MB
  - sovereign-infra-poller: 150 MB (current)

New allocations:
  - sovereign-infra-poller: +60 MB (NDBC-focused expansion) = 210 MB total

Total: ~3.6 GB (within Jetson Nano 4 GB budget with swap)
```

### Kafka Topics (no changes)
All new data sources use existing topics or Redis caching:
- NDBC → PostgreSQL directly (hypertable write)
- No Kafka topics needed (unlike ADSB, AIS)

---

**Document Version**: 1.0
**Last Updated**: March 28, 2026
**Approval Status**: Pending sprint review



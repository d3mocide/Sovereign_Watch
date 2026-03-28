# Geospatial Data Layers Initiative — Executive Summary

**Date**: March 28, 2026  
**Status**: Research & Consolidation Analysis Complete ✅  
**Branch**: `claude/geospatial-data-layers-HIhaw`  
**Location**: `/home/user/Sovereign_Watch/agent_docs/`

---

## TL;DR

We have **researched and designed** a system to integrate three critical intelligence data sources (ocean buoys, maritime piracy warnings, FAA airspace restrictions) into Sovereign Watch using **1 extended poller (infra_poller) + 0 new containers**, **~89 hours of effort across 6 weeks**, and **$0 additional cost** (all open government APIs).

**Next Step**: Sprint planning. Ready to implement Phase 1 (NDBC ocean buoys) immediately.

---

## What We Analyzed

### The Research Document (d3FRAG Networks)
A comprehensive 11-section architecture evaluation covering:
- **5 intelligence domains**: NDBC ocean buoys, NGA Maritime Safety Info, NGA GPS Jamming Zones, NASA VIIRS satellite thermal, FAA SWIM NOTAMs
- **Alternative sources**: 20+ alternatives evaluated per domain with routing decisions (primary/sidecar/reject)
- **Deck.gl 9 constraints**: Z-ordering rules, radiusUnits: 'meters' for geodetic accuracy, layer interleaving
- **Cross-domain fusion**: 3 analytical workflows (dark vessel ID, GNSS spoofing detection, multi-threat correlation)

### Your Current Stack
- **Frontend**: MapLibre + Deck.gl 9 (proven layer composition pattern)
- **Backend**: 7 active pollers (aviation, maritime, space_pulse, rf_pulse, gdelt, infra)
- **Data**: FastAPI + Redpanda/Kafka + TimescaleDB + Redis
- **Hardware**: Jetson Nano edge node (4 GB RAM, ~1.2 GB available)

### The Gap
Sovereign Watch excels at **air/space/RF intelligence** but lacks:
- Ocean baseline (sea state, water temperature for anomaly detection)
- Maritime threat intelligence (piracy, safety warnings)
- Proactive airspace restrictions (NOTAMs vs reactive holding patterns)

---

## Strategic Decision: Consolidation Option A

**Chosen**: Extend `infra_poller` service to include NDBC + ASAM

| Criterion | Option A (Chosen) | Option B (Alternative) | Option C (Not Recommended) |
|-----------|------------------|------------------------|---------------------------|
| **New Containers** | 0 | +1 | 0 |
| **Code Complexity** | Low | Very Low | High |
| **Memory Budget** | 210 MB (from 150 MB) | 160 MB (new) | 180 MB (bloated) |
| **Container Overhead** | None | +80 MB infra poller equiv | None |
| **Reuses Pattern** | ✅ space_pulse multi-source pattern | ✅ Clean slate | ❌ Overcomplicates 3 pollers |
| **Effort** | ~50 hours | ~60 hours | ~75 hours |

**Why infra_poller?**
- Already orchestrates 3 independent async loops (cables, IODA outages, FCC towers)
- Already writes to PostgreSQL + Redis
- "Maritime infrastructure" domain is cohesive (cables + hazards)
- Zero new container overhead

---

## Implementation Phases

### Phase 1: NDBC Ocean Buoys (Weeks 1–2, ~30 hours)
**Deliverable**: Real-time sea state baseline + layer

- **Backend**: NDBC HTTP poller (AsyncNdbcApi wrapper, ETag caching, 15-min refresh)
- **Database**: `ndbc_obs` hypertable (30-day rolling window, 1-hour compressed chunks)
- **Frontend**: ScatterplotLayer (radius = WVHT meters, color = water temperature)
- **API**: GET /api/buoys/latest?bbox={bounds}

**Success**: NDBC data flows → frontend map shows buoy dots colored by temperature

### Phase 2: ASAM Maritime Piracy (Weeks 3–4, ~32 hours)
**Deliverable**: Piracy threat intelligence + threat scoring

- **Backend**: NGA ASAM shapefile poller (geopandas parsing, weekly schedule 15:00 ET Fridays)
- **Database**: `asam_incidents` table (90-day threat scores: recency × severity)
- **Frontend**: HexagonLayer (zoom < 6 density heatmap), IconLayer (zoom ≥ 8 per-incident)
- **API**: GET /api/asam/incidents?bbox={bounds}&threat_min=5

**Success**: Incidents populated weekly, zoom-based layer switching works

### Phase 3: Cross-Domain Fusion (Weeks 5–6, ~27 hours)
**Deliverable**: Multi-source correlation queries + HUD enrichment

- **SQL**: 3 fusion queries (vessel risk assessment, sea state anomalies, multi-domain threats)
- **Frontend**: Risk panel (vessels in piracy zones), sea state anomaly highlighting
- **Integration**: NDBC + ASAM + AIS real-time correlation

**Success**: Risk assessment panel updates in real-time as vessels move

### Phase 4 (Optional): NOTAM Airspace Restrictions (Weeks 7–8+, ~25 hours)
**Deliverable**: FAA airspace restrictions layer

- **Backend**: NEW lightweight `notam_poller` (aviationweather.gov REST)
- **Frontend**: ScatterplotLayer (critical NOTAM pulsing red circles)
- **Feature**: WebSocket push on critical TFR activation

**Status**: Deferred to ensure Phase 1–3 complete. Can be separate container.

---

## Key Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| **Total Effort** | ~89 hours | Phases 1–3 (Phase 4 optional) |
| **New Containers** | 0 | Uses existing infra_poller |
| **Memory Add** | +60 MB | 150 MB → 210 MB (fits within Jetson budget) |
| **Data Sources** | 3 primary + 3 sidecars (future) | NDBC, ASAM, NOTAM primaries |
| **Polling Overhead** | ~5 min per loop | 15-min NDBC, 1h ASAM, 5-min NOTAM |
| **Database Growth** | ~1 GB/year | NDBC 30-day rolling, ASAM historical |
| **Timeline** | 6 weeks | Phased delivery (2 weeks per phase) |
| **Cost** | $0 | All open government APIs, no commercial dependencies |

---

## What Gets Built

### Database Tables (New)
```sql
ndbc_obs          -- 30-day rolling hypertable (15-min refresh)
asam_incidents    -- Piracy incidents (historical, 90-day threat scores)
nav_warnings      -- Safety warnings (active only)
notams            -- FAA airspace restrictions (14-day retention)
```

### Frontend Layers (New)
```
ScatterplotLayer  -- NDBC buoys (radius=WVHT m, color=WTMP °C)
HexagonLayer      -- ASAM density (zoom < 6)
IconLayer         -- ASAM incidents (zoom ≥ 8)
ScatterplotLayer  -- NOTAM zones (Phase 4, radiusUnits: meters)
```

### API Endpoints (New)
```
GET /api/buoys/latest
GET /api/asam/incidents
GET /api/maritime/risk-assessment
GET /api/notams
```

### Fusion Queries (New)
```sql
-- Vessel risk assessment
SELECT * FROM ais_tracks WHERE ST_DWithin(asam.geom, track.geom, 50km)
  AND asam.threat_score > threshold
  AND asam.date > NOW()::DATE - INTERVAL '90 days'

-- Sea state anomaly detection
SELECT * FROM ndbc_obs WHERE Z_score(wvht_meters) > 2
  AND nearby_ais_gaps > 0

-- Multi-domain incident correlation
SELECT * FROM ais_tracks JOIN asam_incidents JOIN notams
  WHERE all geometries overlap AND time overlaps
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| NDBC station metadata lookup slow | Cache metadata in Redis, refresh weekly |
| ASAM shapefile parsing fails | Try/catch, log to Redis, skip week |
| NGA API maintenance downtime | Graceful degradation, skip to next fetch |
| Jetson Nano memory pressure | Monitor with `docker stats`, add swap if needed |
| GDAL library missing | Update Dockerfile to explicitly install gdal-bin |
| Time zone issues (ASAM schedule ET) | Use pytz, test schedule logic thoroughly |

---

## Files Created This Session

**In `/home/user/Sovereign_Watch/agent_docs/`:**

1. **research-geospatial-data-layers-implementation.md** (28 KB)
   - Comprehensive technical evaluation from d3FRAG Networks research
   - Data source routing decisions, Deck.gl patterns, fusion workflows

2. **poller-consolidation-strategy.md** (26 KB)
   - Detailed analysis of 7 existing pollers
   - Option A full implementation plan (8 steps with code)
   - Risk mitigations, memory budget

3. **IMPLEMENTATION_ROADMAP.md** (17 KB)
   - Sprint-level task breakdown (Phase 1–4)
   - Database schema, API endpoints, testing strategy
   - Success criteria, git workflow

4. **README.md** (8.6 KB)
   - Index + quick reference for all documents
   - Deployment checklist, Q&A

---

## Next Actions (Immediate)

### For Technical Review
1. Review **poller-consolidation-strategy.md** "Executive Summary" + "Option A"
2. Approve Option A consolidation (vs B/C alternatives)
3. Verify GDAL/geopandas compatibility with existing infrastructure

### For Sprint Planning
1. Extract Phase 1 tasks from **IMPLEMENTATION_ROADMAP.md**
2. Estimate ~30 hours across:
   - Backend: 15h (NDBC API client + hypertable)
   - Frontend: 10h (ScatterplotLayer + filters)
   - DBA: 5h (continuous aggregate setup)
3. Assign team members based on capacity

### For Git Workflow
1. Branch already allocated: `claude/geospatial-data-layers-HIhaw`
2. Create initial commit: Add agent_docs/* research documents
3. Phase 1 commits: NDBC poller, layer, API

---

## Success Criteria

**MVP (Phase 1 Complete)**:
- ✅ NDBC data flowing into PostgreSQL (100+ observations/hour)
- ✅ Frontend shows buoy dots on map
- ✅ Hover tooltip displays WVHT, WTMP, WSPD
- ✅ No regressions in existing layers (via pnpm test + lint)

**Phase 1 + 2 Complete**:
- ✅ ASAM incidents ingested weekly
- ✅ Threat scores computed correctly
- ✅ Zoom-based layer switching works (HexagonLayer → IconLayer)
- ✅ Click on incident shows details + nearby vessels

**Phase 3 Complete**:
- ✅ Risk assessment queries return vessel threat levels
- ✅ HUD panel updates in real-time
- ✅ Sea state anomalies flagged correctly

---

## References

**Primary Documents**:
- `/home/user/Sovereign_Watch/agent_docs/research-geospatial-data-layers-implementation.md`
- `/home/user/Sovereign_Watch/agent_docs/poller-consolidation-strategy.md`
- `/home/user/Sovereign_Watch/agent_docs/IMPLEMENTATION_ROADMAP.md`

**Existing Project Context**:
- GitHub: https://github.com/d3mocide/Sovereign_Watch
- CLAUDE.md: Project-specific development constraints
- docker-compose.yml: Container orchestration + environment variables

---

## Questions?

Refer to the appropriate document section:
- **Architecture?** → poller-consolidation-strategy.md Section 5
- **Data source selection?** → research-geospatial-data-layers-implementation.md Sections 3–7
- **Frontend rendering?** → research-geospatial-data-layers-implementation.md Section 2.2
- **Sprint tasks?** → IMPLEMENTATION_ROADMAP.md "Executive Sprint Plan"
- **Testing?** → IMPLEMENTATION_ROADMAP.md "Testing Strategy"

---

**Document Version**: 1.0  
**Date**: March 28, 2026  
**Approval Status**: Ready for team review  
**Next Milestone**: Sprint planning + Phase 1 kickoff  

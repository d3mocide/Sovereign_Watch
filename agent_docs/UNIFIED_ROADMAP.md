# Unified Implementation Roadmap
## Geospatial + Infrastructure Data Layers (Complete Initiative)

**Date**: March 28, 2026
**Scope**: 7 new data sources across 2 initiatives (Geospatial + Infrastructure)
**Total Effort**: ~177 hours (6-7 weeks with parallel tracks)
**Timeline**: 8-10 week delivery (phased)
**Architecture**: Extend 2 existing pollers (infra_poller + aviation_poller)
**Cost**: $0 (all open government/community APIs)

---

## Master Timeline

```
WEEK 1-2    │ WEEK 3-4     │ WEEK 5-6     │ WEEK 7-8    │ WEEK 8-10
────────────┼──────────────┼──────────────┼─────────────┼───────────
            │              │              │             │
GEOSPATIAL  │ GEOSPATIAL   │ INFRA Ph1    │ GEOSPATIAL  │ INFRA Ph2
Phase 1     │ Phase 2      │ + GEO Ph3    │ Phase 3 +   │ (deferred)
(NDBC)      │ (ASAM)       │ (parallel)   │ INFRA Ph1   │
30h         │ 32h          │ ongoing      │ completion  │
───────────────────────────────────────────────────────────────────
Outcome:    │ Outcome:     │ Outcome:     │ Outcome:    │ Outcome:
NDBC layer  │ + ASAM       │ + IXPs, DCs, │ Fusion      │ DNS, CDN,
+ sea state │ + threat     │ Towers, ISS  │ queries +   │ Satellites,
baseline    │ scoring      │ real-time    │ risk panel  │ Ground St.
```

---

## Initiative A: Geospatial Data Layers

### Phase 1: NDBC Ocean Buoys (Weeks 1–2)
**Poller Extension**: `infra_poller` → add `ndbc_loop()`
**Deliverable**: Real-time sea state baseline + ScatterplotLayer

| Component | Details | Effort |
|-----------|---------|--------|
| NDBC HTTP client | AsyncNdbcApi wrapper, ETag caching, 15-min refresh | 8h |
| Database | `ndbc_obs` hypertable, 30-day rolling window | 6h |
| Continuous Aggregate | Rolling 30-day mean + anomaly Z-score | 4h |
| API Endpoint | GET /api/buoys/latest?bbox={bounds} | 4h |
| Frontend Layer | ScatterplotLayer (radius=WVHT m, color=WTMP °C) | 10h |
| Testing | Unit + integration + E2E | 6h |
| **Phase 1 Total** | | **~38 hours** |

**Success Criteria**:
- ✅ NDBC data flows → PostgreSQL (100+ obs/hour)
- ✅ Frontend shows buoy dots colored by water temperature
- ✅ Hover tooltip displays WVHT, WTMP, WSPD, last update time
- ✅ No regressions in existing layers

---

### Phase 2: ASAM Maritime Piracy (Weeks 3–4) ✅ COMPLETE
**Poller Extension**: `infra_poller` → `asam_loop()`
**Deliverable**: Piracy threat intelligence + zoom-adaptive ScatterplotLayer

| Component | Details | Effort |
|-----------|---------|--------|
| ASAM JSON client | NGA msi.nga.mil feed, weekday 15:00 ET gate, 24h re-check | 8h |
| Threat scoring | `asam_severity() × asam_recency()` algorithm (0–10 scale) | 6h |
| Database | `asam_incidents` table, PostGIS geom + threat_score index | 6h |
| Scheduler | Weekday 19–21 UTC gate (covers EST + EDT), Redis dedup guard | 4h |
| API Endpoint | GET /api/asam/incidents?bbox={bounds}&days=365&threat_min=0 | 4h |
| Frontend Layers | ScatterplotLayer zoom-adaptive: threat rings (zoom<6), precise dots (zoom≥6) | 12h |
| Testing | 39 ASAM unit tests (severity, recency, scoring, parsing) | 8h |
| **Phase 2 Total** | | **~48 hours** |

**Success Criteria**:
- ✅ ASAM incidents ingested on weekdays (15:00 ET gate)
- ✅ Threat scores computed correctly (kidnapping > hijacking > robbery)
- ✅ Zoom-adaptive layer switching works (rings overview, dots detail)
- ✅ 89 backend tests + 36 frontend tests pass, 0 regressions

---

### Phase 3: Cross-Domain Fusion Queries (Weeks 5–6, parallel with Infra Ph1) ✅ COMPLETE
**Backend**: Fusion SQL queries + 2 new API endpoints
**Frontend**: MaritimeRiskPanel HUD + useMaritimeRisk hook
**Deliverable**: Multi-source vessel risk correlation + tactical HUD

| Component | Details | Effort |
|-----------|---------|--------|
| Fusion SQL (ASAM) | PostGIS DWithin + threat_score aggregation within radius_nm | 6h |
| Fusion SQL (NDBC) | Lateral join ndbc_obs × ndbc_hourly_baseline → Z-score | 6h |
| API endpoint 1 | GET /api/maritime/risk-assessment?mmsi&lat&lon&radius_nm&days | 6h |
| API endpoint 2 | GET /api/maritime/sea-state-anomaly?lat&lon&radius_nm | 4h |
| useMaritimeRisk hook | Fetch + 30s auto-refresh while vessel selected, AbortController | 4h |
| MaritimeRiskPanel | Threat badge, score bar, incident list, sea state Z-score, HUD styling | 8h |
| App.tsx integration | isSea detection via CoT type, panel shown below SidebarRight | 2h |
| Testing | 20 unit tests: _threat_label + composite formula | 4h |
| **Phase 3 Total** | | **~40 hours** |

**Success Criteria**:
- ✅ Risk assessment queries return vessel threat levels (LOW/MEDIUM/HIGH/CRITICAL)
- ✅ HUD panel auto-refreshes every 30s while vessel selected
- ✅ Sea state anomalies flagged correctly (Z-score > 2σ from ndbc_hourly_baseline)
- ✅ 20 backend tests pass, 0 regressions (lint clean on API + frontend)

**Geospatial Total**: **~122 hours**

---

## Initiative B: Infrastructure Data Layers

### Phase 1: Internet Infrastructure (Weeks 5–6, parallel with Geo Ph3)
**Poller Extension**: `infra_poller` → add 3 new loops
**Deliverable**: IXPs, Data Centers, Cell Towers, ISS real-time

| Component | Details | Effort |
|-----------|---------|--------|
| PeeringDB API | Fetch IXPs + facilities, 24-hour refresh | 8h |
| OpenCelliD CSV | Download, H3 aggregation (res 6), tower density | 18h |
| ISS Tracker | open-notify.org polling, real-time WebSocket | 8h |
| Database | IXP + facility + tower + ISS tables | 10h |
| API Endpoints | 4 new endpoints (ixps, facilities, towers, iss) | 8h |
| Frontend Layers | ScatterplotLayer + HeatmapLayer + PathLayer + IconLayer | 14h |
| WebSocket Handler | Real-time ISS position streaming | 8h |
| Testing | API, aggregation, rendering, real-time updates | 10h |
| **Phase 1 Total** | | **~84 hours** |

**Success Criteria**:
- ✅ ~900 IXPs + ~5,255 facilities ingested and rendered
- ✅ Cell tower H3 aggregation (2.8M → ~50K cells, <200MB)
- ✅ ISS position updates every 5s via WebSocket
- ✅ All layers render without performance degradation

---

### Phase 2: Advanced Infrastructure (Deferred to Week 9+)
**Components**: DNS root instances, CDN edge nodes, Satellites, Ground stations
**Effort**: ~55 hours (not in critical path)
**Status**: Plan only, implement after Phase 1 stabilizes

---

**Infrastructure Total**: **~84 hours + 55h deferred**

---

## Unified Timeline with Parallel Execution

```
                 Effort  Start  End    Parallel Path
─────────────────────────────────────────────────────────────
GEO Phase 1      38h     W1     W2     ├─ NDBC poller
(NDBC)                                  ├─ NDBC layer
                                        └─ Sea state anomaly

GEO Phase 2      48h     W3     W4     ├─ ASAM poller
(ASAM)                                  ├─ ASAM layer (HexLayer)
                                        ├─ Threat scoring
                                        └─ Icon atlas

INFRA Phase 1    84h     W5     W8     ├─ PeeringDB loop
(Internet Infra)                       ├─ OpenCelliD loop (H3)
                                        ├─ ISS real-time
                                        ├─ 4 frontend layers
                                        └─ WebSocket ISS

GEO Phase 3      36h     W5     W6     ├─ 3 fusion SQL queries
(Fusion)                               ├─ Risk panel
                                        ├─ Threat highlighting
                                        └─ Real-time HUD

INTEGRATION      15h     W7     W8     └─ Full layer test
& OPTIMIZATION                           └─ Render performance
─────────────────────────────────────────────────────────────
TOTAL           221h    W1     W10
Actual (w/slack): ~177h (parallel reduces critical path)
```

### Critical Path Analysis

**Sequential Dependencies**:
1. GEO Phase 1 (38h) → **Must complete before Phase 2**
   - NDBC hypertable + continuous aggregate foundation required by Phase 3 fusion queries

2. GEO Phase 2 (48h) → **Must complete before Phase 3**
   - ASAM table + threat scoring required for risk assessment queries

3. INFRA Phase 1 (84h) → **Parallel execution possible**
   - Can run simultaneously with GEO Phases 2–3 (different data sources, different pollers)

**Critical Path** (longest dependency chain):
- GEO Phase 1 (38h) → GEO Phase 2 (48h) → GEO Phase 3 (36h) = **122 hours serial**
- INFRA Phase 1 can execute in parallel = **+84 hours at same time**
- Integration/optimization = **+15 hours**
- **Total Wall-Clock Time**: 8–10 weeks (not 221 hours / 40h per week)

---

## Resource Allocation

### Recommended Team Structure

| Role | Weeks 1–4 | Weeks 5–8 | Weeks 9–10 |
|------|-----------|-----------|------------|
| **Backend Lead** | NDBC (W1–2) + ASAM (W3–4) | Oversee INFRA Ph1 + Phase 3 fusion | INFRA Ph2 planning |
| **Backend Dev 2** | NDBC hypertable schema | OpenCelliD H3 aggregation + ISS | Ground station integration |
| **Frontend Lead** | NDBC layer + composition | PeeringDB + OpenCelliD layers | ISS animation + optimization |
| **Frontend Dev 2** | Threat UI (hover/click) | ISS WebSocket handler | DNS/CDN layer mockups |
| **DBA** | Hypertable + continuous agg | Tower table + geom indexes | Phase 2 schema prep |
| **QA** | Unit tests + integration tests | Layer rendering + E2E | Performance benchmarks |

### Effort by Workstream

**Backend**: 74h (NDBC 8h + ASAM 8h + Fusion SQL 12h + Infra APIs 46h)
**Frontend**: 42h (NDBC 10h + ASAM 12h + Fusion panel 8h + ISS 12h)
**Database**: 34h (Geospatial 16h + Infrastructure 18h)
**Testing/QA**: 22h (distributed across phases)
**DevOps/Docs**: 5h

---

## Data Model Overview (All 7 Sources)

### PostgreSQL Tables (New)

**Geospatial Initiative**:
- `ndbc_obs` (hypertable) — sea state observations
- `asam_incidents` — piracy incidents
- `nav_warnings` — safety warnings (optional Phase 2)

**Infrastructure Initiative**:
- `peeringdb_ixps` — internet exchanges
- `peeringdb_facilities` — data centers
- `opencellid_towers` — cell tower aggregates (H3)
- `iss_passes` — ISS orbital passes
- `iss_positions` (hypertable) — real-time ISS position archive

### Redis Keys (Caching)

- `ndbc:last_etag` — HTTP caching
- `maritime:threat_zones` — 24h cache of high-threat ASAM areas
- `infra:peeringdb_ixps` — 24h cache of IXP data
- `infra:opencellid_towers` — 24h cache of aggregated towers
- `infra:iss_latest` — 60s cache of latest ISS position
- `infrastructure:iss-position` (pub/sub) — real-time ISS position channel

---

## Deck.gl Layer Stack (Final)

### Z-Order (Bottom to Top)

```
0-3   Background (H3 coverage, terminator, aurora)
4-7   Infrastructure Layer Group
      ├─ Submarine cables (PathLayer)
      ├─ Internet exchanges (ScatterplotLayer)
      ├─ Data centers (ScatterplotLayer)
      └─ Cell towers (HeatmapLayer, H3)
8-11  Maritime Layer Group
      ├─ NDBC buoys (ScatterplotLayer)
      ├─ ASAM density (HexagonLayer, zoom<6)
      └─ ASAM incidents (IconLayer, zoom≥8)
12-14 Threat/Alert Layer Group
      ├─ Piracy threat rings (optional)
      ├─ SMAPS jamming zones (PolygonLayer)
      └─ NOTAM zones (ScatterplotLayer)
15-17 Navigation/Orbital Layer Group
      ├─ ISS ground track (PathLayer)
      ├─ ISS position (IconLayer, animated)
      └─ Satellites (existing space_pulse)
18-20 Entity Layer Group
      ├─ AIS/ADS-B tracks
      └─ Entity chevrons
21+   Labels + Interactive
```

---

## API Endpoints (New)

**Geospatial Initiative**:
```
GET /api/buoys/latest?bbox={W},{S},{E},{N}
GET /api/asam/incidents?bbox={W},{S},{E},{N}&days=90&threat_min=5
GET /api/maritime/risk-assessment?mmsi={MMSI}
GET /api/maritime/sea-state-anomaly?lat={lat}&lon={lon}&radius_nm=100
```

**Infrastructure Initiative**:
```
GET /api/infrastructure/ixps?bbox={W},{S},{E},{N}
GET /api/infrastructure/facilities?bbox={W},{S},{E},{N}
GET /api/infrastructure/cell-towers?h3_res=6&bbox={W},{S},{E},{N}
GET /api/infrastructure/iss/position
GET /api/infrastructure/iss/passes?days=7&min_elevation=30
WS /ws/infrastructure/iss-stream  # Real-time position updates
```

---

## Memory Budget (Final)

| Component | Current | Phase 1 Geo | Phase 1 Infra | Phase 2 Total |
|-----------|---------|-------------|---------------|---------------|
| TimescaleDB | 1000 MB | +50 MB | +100 MB | 1150 MB |
| Redpanda | 800 MB | (no change) | (no change) | 800 MB |
| Backend (FastAPI) | 400 MB | +20 MB | +30 MB | 450 MB |
| Frontend | 200 MB | (no change) | (no change) | 200 MB |
| infra_poller | 310 MB | +150 MB (NDBC+ASAM) | +161 MB | 621 MB |
| space_pulse | 200 MB | (no change) | (no change) | 200 MB |
| **Total** | **2910 MB** | **+220 MB** | **+291 MB** | **3421 MB** |

**Jetson Nano Capacity**: 4000 MB
**Available**: 579 MB (fits with swap enabled) ✅

---

## Risk Mitigation Across Initiatives

| Risk | Impact | Mitigation |
|------|--------|-----------|
| NDBC/ASAM combined hydration flooding database | High | Stagger Phase 1→2 (don't ingest both simultaneously) |
| OpenCelliD 3.3GB CSV memory bloat | High | Stream CSV parsing + H3 aggregation (res 6) |
| ISS real-time 5s polling saturates network | Medium | Fan-out via Redis pub/sub, not direct client polling |
| Jetson Nano memory pressure at Phase 1 end | Medium | Monitor docker stats, enable swap before Phase 2 |
| PeeringDB/CelesTrak API rate limiting | Low | Respect 1 req/sec, implement backoff |
| Parallel execution coordination (GEO Ph2 + INFRA Ph1) | Medium | Clear task assignments, daily sync on Redpanda topics |
| H3 aggregation accuracy (OpenCelliD centroids) | Low | Validate with test dataset before production ingest |

---

## Go/No-Go Criteria by Phase

### Phase 1 (NDBC) Go/No-Go ✅ PASSED
- ✅ NDBC observations flowing to PostgreSQL (100+ per hour)
- ✅ Continuous aggregate computing rolling mean without errors
- ✅ Frontend ScatterplotLayer renders 50+ buoys without lag
- ✅ Hover tooltip displays all fields correctly
- ✅ pnpm lint + test pass with zero regressions

**Go Criteria**: All ✅ → Proceeded to Phase 2

---

### Phase 2 (ASAM) Go/No-Go ✅ PASSED
- ✅ ASAM incidents ingested on weekdays (15:00 ET gate, Redis dedup)
- ✅ Threat scores computed correctly (39 unit tests: severity × recency)
- ✅ Zoom-adaptive layer: threat rings (zoom<6), precise dots (zoom≥6)
- ✅ Toggle in LayerVisibilityControls (PIRACY INCIDENTS, red theme)
- ✅ 89 backend + 36 frontend tests pass, 0 regressions

**Go Criteria**: All ✅ → Proceeded to Phase 3 + INFRA Ph1

---

### Phase 3 + INFRA Ph1 Go/No-Go ✅ Phase 3 PASSED
- ✅ Fusion SQL queries return results for at-risk vessels
- ✅ Risk panel auto-refreshes every 30s (sub-500ms API latency target)
- ☐ PeeringDB IXPs rendered without lag (INFRA Ph1 pending)
- ☐ OpenCelliD H3 aggregation correct (INFRA Ph1 pending)
- ☐ ISS position updates every 5s via WebSocket (INFRA Ph1 pending)
- ✅ No performance degradation (lint + tests clean)

**Go Criteria**: Phase 3 ✅ → Geospatial initiative complete → Begin INFRA Phase 1

---

## Deployment Sequence

### Week 1 (GEO Phase 1 Begin)
1. Create git branch: `claude/geospatial-data-layers-HIhaw`
2. Add NDBC source module to infra_poller
3. Update database schema (ndbc_obs hypertable)
4. Deploy infra_poller rebuild
5. Verify NDBC data ingestion in PostgreSQL

### Week 2 (GEO Phase 1 Complete)
1. Complete NDBC frontend layer
2. Pass all unit/integration tests
3. Merge to staging branch
4. Stakeholder review

### Week 3 (GEO Phase 2 Begin)
1. Add ASAM source module
2. Update database schema (asam_incidents)
3. Begin threat scoring algorithm
4. Parallel: INFRA Phase 1 backend prep (PeeringDB/OpenCelliD modules)

### Week 4 (GEO Phase 2 Complete)
1. Complete ASAM layer (HexagonLayer + IconLayer)
2. Testing + optimization
3. Parallel: INFRA backend 30% complete

### Week 5–6 (GEO Phase 3 + INFRA Phase 1 Parallel)
1. GEO: Implement fusion queries + risk panel
2. INFRA: Complete database schema + API endpoints
3. INFRA: 80% frontend layers complete

### Week 7–8 (Phase 1 Completion + Integration)
1. GEO Ph3: Testing + HUD panel polish
2. INFRA Ph1: Complete frontend + WebSocket handler
3. Full integration testing
4. Performance benchmarking

### Week 9–10 (Production Deployment + Phase 2 Planning)
1. Deploy all Phase 1 data layers to production
2. Monitor for 1 week (fix any issues)
3. Begin Phase 2 planning (DNS, CDN, Satellites, Ground Stations)

---

## Success Metrics (Final)

**Quantitative**:
- ✅ 7 new data sources ingested (3 geo + 4 infra)
- ✅ 10 new database tables created
- ✅ 6 new frontend layers rendered
- ✅ 8 new API endpoints operational
- ✅ 0 security vulnerabilities (secret scanning passed)
- ✅ 0 regressions in existing layers (test coverage maintained)
- ✅ <200 MB additional disk usage (with compression)
- ✅ <300 MB additional memory (within Jetson budget)

**Qualitative**:
- ✅ Sea state baseline enables AIS anomaly correlation (dark vessel detection)
- ✅ Piracy threat intelligence adds tactical context to maritime tracking
- ✅ Internet infrastructure visualization shows global network resilience
- ✅ ISS real-time tracking demonstrates capability for low-latency space assets
- ✅ Cross-domain fusion enables incident correlation across domains

**Business Impact**:
- 🎯 Reduce maritime incident response time (via piracy threat scoring)
- 🎯 Improve AIS reliability assessment (via sea state context)
- 🎯 Visualize internet infrastructure vulnerabilities (via IXP/cable layers)
- 🎯 Enable space asset real-time tracking (ISS + future satellite focus)

---

## Next Steps

1. **This Week**:
   - ✅ Review this unified roadmap with team
   - ✅ Approve resource allocation
   - ✅ Finalize git workflow (branch already allocated)

2. **Next Week (W1 Start)**:
   - ☐ Create initial git commit with all research documentation
   - ☐ Begin GEO Phase 1 sprint (NDBC poller development)
   - ☐ Begin INFRA Phase 1 backend module scaffolding

3. **Ongoing**:
   - ☐ Daily standup (focus on parallel execution)
   - ☐ Weekly stakeholder demo (end of each phase)
   - ☐ Monthly architecture review (assess Jetson memory pressure)

---

## Documentation References

- **Geospatial Initiative**: `/home/user/Sovereign_Watch/agent_docs/research-geospatial-data-layers-implementation.md` (full technical evaluation)
- **Geospatial Consolidation**: `/home/user/Sovereign_Watch/agent_docs/poller-consolidation-strategy.md`
- **Geospatial Roadmap**: `/home/user/Sovereign_Watch/agent_docs/IMPLEMENTATION_ROADMAP.md`
- **Infrastructure Initiative**: `/home/user/Sovereign_Watch/agent_docs/infrastructure-layer-consolidation.md`
- **Project Backbone Research**: Provided by user (OSINT layer analysis)

---

**Status**: Ready for sprint planning
**Approval**: Pending team + leadership review
**Estimated Completion**: Week 10 (end of June 2026)


# Geospatial Data Layers Initiative — Research Documentation

This folder contains the complete research, architecture analysis, and implementation roadmap for integrating advanced geospatial intelligence sources into Sovereign Watch.

## Documents

### 1. **research-geospatial-data-layers-implementation.md**
   **Purpose**: Comprehensive technical evaluation of 5 intelligence data sources  
   **Content**:
   - Primary source analysis for each domain (NDBC, NGA MSI, NGA SMAPS, NASA VIIRS, FAA NOTAMs)
   - Alternative source evaluation (rejection/sidecar/primary routing decisions)
   - Deck.gl 9 layer implementation patterns (radiusUnits, z-ordering, rendering)
   - Cross-domain fusion workflow examples (dark vessel ID, GNSS spoofing, incident correlation)
   - Sidecar container architecture (memory budgets, Redpanda topics)
   - Implementation roadmap (sprint-level breakdown by domain)

   **Read This If**: You need detailed justification for data source selection, understand geospatial rendering constraints, or design fusion queries.

### 2. **poller-consolidation-strategy.md**
   **Purpose**: Architectural analysis of existing ingestion pollers + consolidation strategy  
   **Content**:
   - Detailed breakdown of 7 active pollers (aviation, maritime, space_pulse, rf_pulse, gdelt, infra)
   - Multi-source orchestration patterns (async loops, Kafka topics, Redis caching)
   - Consolidation options (Option A: extend infra_poller, Option B: new lightweight poller, Option C: extend all)
   - Detailed Option A implementation (NDBC + ASAM integration into infra_poller)
   - Code snippets: source modules, database schema, docker-compose modifications
   - Test strategy and risk mitigations

   **Read This If**: You're implementing the backend integration, extending pollers, or optimizing container overhead.

### 3. **IMPLEMENTATION_ROADMAP.md**
   **Purpose**: Sprint-level execution plan with task breakdown  
   **Content**:
   - Executive summary of strategic decision
   - Phase-by-phase deliverables (Phase 1: NDBC, Phase 2: ASAM, Phase 3: Fusion, Phase 4: NOTAM)
   - Task lists with estimated hours (30h Phase 1, 32h Phase 2, 27h Phase 3)
   - Database schema summary (new tables, continuous aggregates, retention policies)
   - New API endpoints (GET /api/buoys/latest, /api/asam/incidents, etc.)
   - Frontend layer specifications (ScatterplotLayer, HexagonLayer, IconLayer)
   - Success criteria and testing strategy (unit, integration, end-to-end)
   - Risk & mitigations table
   - Git workflow for branch management

   **Read This If**: You're planning sprints, assigning tasks, or tracking progress.

## Quick Reference

### Data Sources Being Added

| Domain | Source | Schedule | Layer Type | Effort |
|--------|--------|----------|-----------|--------|
| **Ocean** | NDBC latest_obs.txt | 15 min | ScatterplotLayer (radius=WVHT, color=WTMP) | 30h |
| **Maritime Threat** | NGA ASAM piracy shapefile | Weekly (Fri 15:00 ET) | HexagonLayer (zoom<6) + IconLayer (zoom≥8) | 32h |
| **Airspace** | AviationWeather.gov REST | 5 min | ScatterplotLayer (radiusUnits: meters) | 25h (Phase 4) |

### Architecture Decision

**Consolidation Strategy: Option A** — Extend `infra_poller` service
- ✅ Adds NDBC + ASAM without new containers
- ✅ Reuses proven async/Redis/PostgreSQL patterns (space_pulse model)
- ✅ Memory budget: 150MB → 210MB (fits Jetson Nano constraints)
- ✅ Effort: ~50 hours (vs 75 for extending multiple pollers)
- NOTAM deferred to separate lightweight poller (Phase 4 optional)

### Key Files to Create/Modify

**Backend**:
- `backend/ingestion/infra_poller/sources/ndbc.py` (new)
- `backend/ingestion/infra_poller/sources/asam.py` (new)
- `backend/ingestion/infra_poller/main.py` (modify: add ndbc_loop, asam_loop)
- `backend/db/init.sql` (add: ndbc_obs, asam_incidents tables + continuous aggregates)

**Frontend**:
- `frontend/src/layers/buildNDBCLayer.ts` (new)
- `frontend/src/layers/buildASAMLayer.ts` (new)
- `frontend/src/layers/composition.ts` (modify: z-order placement)
- `frontend/src/components/map/TacticalMap.tsx` (modify: add filters + API queries)

**Configuration**:
- `docker-compose.yml` (modify: infra_poller environment variables)
- `backend/ingestion/infra_poller/pyproject.toml` (add: geopandas, h3, pytz)

### Timeline

| Phase | Duration | Deliverable | Status |
|-------|----------|-------------|--------|
| Phase 1 | Weeks 1–2 | NDBC poller + layer | Ready to start |
| Phase 2 | Weeks 3–4 | ASAM piracy layer + threat scoring | Dependent on Phase 1 |
| Phase 3 | Weeks 5–6 | Cross-domain fusion queries + HUD | Dependent on Phase 2 |
| Phase 4 | Weeks 7–8+ | NOTAM integration (optional) | Deferred |
| **Total** | **~8–10 weeks** | All 3 critical domains + fusion | **~89 hours effort** |

## How to Use These Documents

### Sprint Planning
1. Read **IMPLEMENTATION_ROADMAP.md** Section "Executive Sprint Plan"
2. Extract Phase 1 tasks (30 hours across backend/frontend/DBA)
3. Assign to team members based on capacity

### Backend Development
1. Read **poller-consolidation-strategy.md** Section "Option A - Implementation Plan"
2. Follow Step 1–8 code structure
3. Use test patterns from **IMPLEMENTATION_ROADMAP.md** "Testing Strategy"

### Frontend Development
1. Read **research-geospatial-data-layers-implementation.md** Section 2.2 "Frontend Architecture"
2. Read **IMPLEMENTATION_ROADMAP.md** "Frontend Tasks" for each phase
3. Reference Deck.gl 9 patterns (radiusUnits, layer interleaving, z-order)

### Database Design
1. Review **poller-consolidation-strategy.md** "Step 4: Update Database Schema"
2. Apply retention policies (NDBC 30d, ASAM none, NOTAM 14d)
3. Implement continuous aggregates for anomaly detection

### Architecture Review
1. Skim **poller-consolidation-strategy.md** "Section 2: Each Active Poller" (understand existing patterns)
2. Review "Section 5: Consolidation Map" (trade-offs for Option A vs B vs C)
3. Approve or propose alternative consolidation strategy

## Cross-References

**Data Sovereignty**
- Research document Section 1: Architectural paradigm emphasizes government APIs, no commercial dependencies
- Consolidation document: All selected sources are open/free (NDBC, NGA, NASA, FAA)

**Deck.gl 9 Constraints**
- Research Section 2.2: Sovereign Glass rendering contract (z-order, radiusUnits, chevron markers)
- Research Section 7.2: Precise NOTAM radius rendering (radiusUnits: 'meters' mandatory)

**Fusion Workflow Examples**
- Research Section 9: Three analytical workflows that justify integrated architecture
- Roadmap Section "Phase 3": Implementation of fusion queries

**Sidecar Architecture**
- Research Section 8.1: Memory budget allocation (total ~670 MB for all future sidecars)
- Consolidation Section "Option A vs B": Container overhead comparison

## Deployment Checklist

- [ ] Review and approve consolidation strategy (Option A)
- [ ] Plan Phase 1 sprint with team
- [ ] Allocate backend developer (NDBC poller + API)
- [ ] Allocate frontend developer (NDBC layer)
- [ ] Allocate DBA (hypertable + continuous aggregate setup)
- [ ] Update CLAUDE.md with new verification commands (if needed)
- [ ] Provision GDAL system library in Dockerfile
- [ ] Create git branch: `claude/geospatial-data-layers-HIhaw` (specified in CLAUDE.md)
- [ ] Begin Phase 1 implementation

## Questions & Clarifications

**Q: Why consolidate into infra_poller instead of creating new maritime_data_poller?**
A: infra_poller already demonstrates multi-source orchestration (cables + outages + towers). Adding NDBC + ASAM reuses this pattern, avoiding container proliferation. The "maritime infrastructure" domain is cohesive (cables + hazards).

**Q: What about NOTAM integration in Phase 1?**
A: Deferred to Phase 4 (optional). NDBC + ASAM are higher priority (ocean baseline + maritime threats). NOTAM can be separate lightweight poller if needed.

**Q: How much memory do NDBC + ASAM add?**
A: ~60 MB additional (geopandas + shapefile parsing overhead). Current infra_poller ~150 MB → 210 MB total. Jetson Nano can accommodate with swap.

**Q: Can NDBC data feed VIIRS dark vessel detection?**
A: Yes! Phase 3 fusion queries use NDBC sea state to validate dark vessel candidates (low WVHT = high confidence). VIIRS integration deferred to Phase 5.

**Q: What if NGA ASAM API changes format?**
A: Graceful degradation: catch parse errors, log to Redis error key, skip that week's update. Manual inspection + format update needed.

## Document History

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-28 | 1.0 | Initial research documentation complete |

---

**For questions or feedback**: Refer to the specific document section or GitHub issue in the Sovereign Watch repository.

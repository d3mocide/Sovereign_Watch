# Sovereign Watch — Improvements Backlog

> **Created:** 2026-04-19  
> **Purpose:** Long-term tracking of open gaps, code health items, and deferred features.  
> Move items here when they are confirmed open; mark ✅ when resolved with a PR/commit reference.

---

## Open Gaps (Frontend ↔ Backend Coverage)

| ID | Priority | Description | Effort | Status |
|----|----------|-------------|--------|--------|
| GAP-05 | High | **Domain analysis (air/sea/orbital) via context menu** — `POST /api/ai_router/analyze/{air\|sea\|orbital}` endpoints exist but no frontend UI triggers them. Add right-click context menu action → DomainAnalysisPanel showing narrative, indicators, risk score. | M (3–8h) | ✅ Done 2026-04-19 |
| GAP-04 | Low | **NWS alert count badge** — `GET /api/infra/nws-alerts/summary` returns `{count, severe_count, extreme_count}` but no widget surfaces this. Small badge next to the NWS layer toggle in MapControls. | XS (<1h) | ✅ Done 2026-04-19 |

### Already Resolved (previously tracked in Backend_Frontend_Coverage_Gaps.md)

| ID | Description | Resolved |
|----|-------------|---------|
| GAP-01 | SatNOGS transmitter catalog in SatnogsView | Before 2026-04-19 |
| GAP-02 | SatNOGS observation timeline in SatnogsView | Before 2026-04-19 |
| GAP-03 | Space-weather R/S/G scales + signal-loss suppression banner | Before 2026-04-19 |
| ORPHAN-01 | ClausalChains hook + layer never imported | Before 2026-04-19 |

---

## Code Health

| ID | Severity | Description | File(s) | Status |
|----|----------|-------------|---------|--------|
| CH-01 | Medium | **Pool exhaustion risk** — `db.pool.fetchrow()` called directly in `analysis.py` without `async with db.pool.acquire()`. Under load this can exhaust the connection pool. | `backend/api/routers/analysis.py:159,219,238` | ✅ Done 2026-04-19 |
| CH-02 | Low | **Silent exception blocks** — ~50 bare `except` / `except Exception:` clauses in ingestion pollers swallow errors silently. Should log at `logger.debug()` at minimum for health diagnostics. | 16 files across `backend/ingestion/` | ✅ Done 2026-04-19 |
| CH-03 | Low | **Frontend `as any` casts** — Several `as any` type assertions in `App.tsx` and other components reduce type safety. Should be replaced with proper type guards. | `frontend/src/App.tsx` | Open |

---

## Deferred Features (from ROADMAP.md P3)

| ID | Description | Blocked By |
|----|-------------|------------|
| Test-01 | Playwright E2E golden-path tests | Manual test environment setup |
| Test-02 | Vitest coverage expansion for mission hooks + layer builders | Time |
| Sync-01 | Multi-user mission sync via WebSocket | Architecture decision |
| Analyt-01 | Mission heatmaps (density + historical movement) | Data volume requirements |
| Space-06 | WebGPU orbital propagation (SGP4 in headless worker) | WebGPU availability |
| Ingest-07 | Drone Remote ID ingestion | SDR hardware requirement |

---

## How to Use This Doc

- **Adding items**: Add a row with ID, priority, description, effort estimate, and `Open` status.
- **Resolving items**: Change status to `✅ Done YYYY-MM-DD` and note the commit/PR.
- **Archiving**: When a section is fully resolved, move it to the "Already Resolved" block below.

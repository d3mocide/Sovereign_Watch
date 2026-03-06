# Sovereign Watch — Roadmap Gap Analysis

**Date:** 2026-03-06
**Version Analyzed:** v0.18.2
**Analyst:** Claude Code (automated review)
**Branch:** `claude/roadmap-gap-analysis-xakzj`

---

## Executive Summary

Sovereign Watch has progressed significantly beyond what the current ROADMAP.md reflects. The roadmap was last updated on 2026-03-02, but the codebase has advanced through two full releases (v0.18.0 Glass & Signals, v0.18.1 Sovereign Glass Update, v0.18.2 Globe Rendering Fix) and several untracked feature implementations in the orbital and radio domains.

This analysis cross-references:
- `ROADMAP.md` (last updated 2026-03-02)
- `docs/tasks/` — active task files
- `frontend/src/` — actual component/layer/widget implementations
- `backend/api/` and `backend/ingestion/` — backend services
- Recent git history (v0.13.0 → v0.18.2)

---

## 1. Completed Work Not Yet Reflected in ROADMAP.md

The following features were implemented after the last roadmap update and are missing from the "Completed" table:

| ID | Feature | Evidence |
|:---|:--------|:--------|
| **FE-28** | Satellite Dashboard Shell | `OrbitalDashboard` view mode in `App.tsx`, `OrbitalSidebarLeft.tsx`, `OrbitalCategoryPills.tsx` all exist |
| **FE-29** | Terminator Layer (Day/Night) | `TerminatorLayer.tsx` exists at `frontend/src/components/map/TerminatorLayer.tsx` |
| **FE-30** | Satellite Telemetry Inspector | `SatelliteInspector` component, `DopplerWidget.tsx`, `PolarPlotWidget.tsx`, `PassPredictorWidget.tsx` all exist |
| **FE-31** | Orbital Category Pills | `OrbitalCategoryPills.tsx` implemented, GPS/COMMS/WEATHER/etc. filter pills |
| **Ingest-03a** | Celestrak Expanded Groups | 20 distinct ingestion categories added to `orbital_pulse/service.py` (was 5); TLE lines in payload |
| **Infra-03** | KiwiSDR Radio Integration | Merged PR #74 — `JS8Widget.tsx`, KiwiSDR TCP bridge, bearing layer |
| **Security-01** | DoS Prevention / Input Limits | Merged PR #73 — input length limits added |

---

## 2. Partially Implemented Features

> **Correction note:** Two items were incorrectly flagged as gaps based on stale planning docs in `docs/tasks/` and `docs/done/` that predate v0.18.x. Code verification and user confirmation show both are fully operational: (1) Orbital Pass Prediction — all backend and frontend components exist and render live data; (2) CoT Event Tracking (Fix-01) — events render on the tactical map and appear in IntelFeed. The planning task files are historical artifacts, not indicators of missing implementation.

### GAP-01 (Renumbered): Repeater Sub-Filter UI (FE-27)

**Symptoms:** The repeater on/off toggle lives in `SystemStatus.tsx` (not `LayerFilters.tsx`), and there are **no mode sub-filters** (FM / P25 / DMR / D-Star / Fusion / Open) anywhere in the UI.

**Status:** Data already present in RepeaterBook API response (`mode` field), backend proxy at `/api/repeaters/` fully operational. This is a pure frontend addition — add mode sub-filters under the existing repeater toggle in `SystemStatus.tsx`.

---

## 3. P0/P1 Features Not Yet Started

These are in the ROADMAP.md "Next Priority" queue and remain unimplemented:

| ID | Feature | Why It Matters |
|:---|:--------|:--------------|
| **FE-22** | Drone Tactical Layer | Drone classification is wired throughout the UI — `showDrone` filter toggle exists (under AIR in `LayerFilters.tsx`), drones receive the tactical halo glow, and get a `🛸` prefix in IntelFeed. The gap is the **map icon**: `buildEntityLayers.ts:181` returns `"aircraft"` for all non-vessel entities, so drones render with a generic chevron instead of a rotor icon, and drone_class has no color coding. Pure frontend fix in `buildEntityLayers.ts`. |
| **FE-25a** | NOAA Weather Radio Layer | Static NOAA transmitter visualization, amber coverage circles. No `useNoaaRadio` hook exists. Simple static JSON asset + layer — very low complexity. |
| **FE-25c** | PSAP / 911 Centers Layer | Bundled GeoJSON of dispatch centers with red/amber markers. No PSAP data or layer exists. Low complexity. |

---

## 4. P2 Backlog — Not Started

Full RF infrastructure expansion and UX features. None of these have any code:

### 4.1 RF Infrastructure (Phase 3)

| ID | Feature | Complexity | Blocker |
|:---|:--------|:----------|:--------|
| **Ingest-09** | P25 System Pulse | Medium | RadioReference API key required |
| **FE-23** | P25 System Layer | Low | Needs Ingest-09 |
| **Ingest-10** | APRS Stream Poller | Medium | APRS-IS TCP bridge + classification logic |
| **FE-24** | APRS Layer | Low | Needs Ingest-10 |
| **Ingest-12** | DMR Brandmeister Pulse | Medium | Brandmeister API, 1h cache |
| **FE-26** | DMR Activity Layer | Low | Needs Ingest-12 |
| **Ingest-11** | FCC ASR Tower Service | Medium | FCC public DB download + bounding-box filter |
| **FE-25b** | FCC Tower Layer | Low | Needs Ingest-11 |
| **Ingest-08** | Infra Caching (Backend) | Low | Move cables/stations from localStorage to backend |

### 4.2 UX Improvements

| ID | Feature | Complexity | Notes |
|:---|:--------|:----------|:------|
| **FE-09** | Coverage Viz | Low | H3 polling fidelity hexagons |
| **FE-12** | Settings UI | High | Full UI for API key/poller config |
| **FE-13** | Mission Labels | Low | Floating text labels for AOT areas |
| **FE-14** | Deep Linking | Medium | Encode mission state in URL |
| **FE-15** | Data Portability | Medium | Import/Export mission presets JSON |
| **Backend-04** | Auth / RBAC | High | No user management or access control exists |
| **Ingest-07** | Drone Remote ID | High | RTL-SDR hardware dependency, SDR pipeline |

---

## 5. Phase 3+ Future Work

| ID | Feature | Phase |
|:---|:--------|:------|
| **Backend-05** | Multi-Area concurrent surveillance | Phase 6 |
| **FE-16** | Analytics Dashboard / Heatmaps | Phase 6 |
| **FE-17** | Collaborative Multi-User Sync | Phase 6 |
| **Ingest-04** | SIGINT/Jamming (NIC/NACp H3) | Phase 6 |
| **Ingest-05** | Spectrum (SatNOGS) | Phase 6 |
| **FE-18** | WebGPU Physics Worker | Phase 6 |
| **AI-01** | AI Analyst Frontend Widget | Phase 4 — backend `/api/analyze/{uid}` done; needs a frontend panel to surface it |

---

## 6. Recommended Next Steps (Prioritized)

### Immediate (Sprint 1)

1. **FE-22 — Drone Tactical Layer**
   - Classification is already done. This is a pure frontend gap.
   - Create `DroneLayer.tsx` with rotor icon, drone_class color coding, and sub-filters in `LayerFilters.tsx`.

3. **FE-27 — Repeater Mode Sub-Filters**
   - Data already exists in the API. Frontend-only change to `LayerFilters.tsx`.
   - Lowest complexity of any open P1 item.

### Near-Term (Sprint 2)

3. **FE-25a — NOAA Weather Radio Layer**
   - Static data source, minimal backend work.

6. **FE-25c — PSAP / 911 Centers Layer**
   - Bundled GeoJSON, no backend required.

### Medium-Term (Sprint 3+)

7. **Ingest-08 — Infrastructure Caching** — Move submarine cable/stations to backend service.
8. **Ingest-09 + FE-23 — P25 Systems** — Begin RF infrastructure expansion.
9. **FE-14 — Deep Linking** — High operator value for mission sharing.
10. **FE-15 — Data Portability** — Mission preset export/import.

---

## 7. Health Assessment

| Domain | Status | Notes |
|:-------|:-------|:------|
| **Aviation (ADS-B)** | ✅ Fully Operational | Multi-source, arbitration, drone classification |
| **Maritime (AIS)** | ✅ Fully Operational | WebSocket, 11 vessel categories, DAM |
| **Orbital (Satellites)** | ✅ Fully Operational | Live tracking, pass prediction, Doppler, polar plot all working |
| **Submarine Cables** | ✅ Fully Operational | GeoJson + landing stations |
| **RF Repeaters** | ⚠️ Missing Sub-Filters | Data available, UI filter missing |
| **JS8Call / KiwiSDR** | ✅ Fully Operational | Merged v0.18.x |
| **Replay / Historian** | ✅ Fully Operational | 24h retention, time-slider |
| **Drone Layer** | ❌ Not Implemented | Classifier done, no dedicated layer |
| **P25 / APRS / DMR** | ❌ Not Implemented | Phase 3 |
| **NOAA / PSAP / FCC Towers** | ❌ Not Implemented | Phase 3 |
| **Auth / RBAC** | ❌ Not Implemented | Phase 4+ |
| **AI Analyst** | ⚠️ Backend Only | `/api/analyze/{uid}` fully implemented in `routers/analysis.py` — queries track history, constructs intel prompt, streams SSE via `litellm.acompletion`. No frontend widget calls it yet. |

---

_Generated by automated codebase gap analysis. See ROADMAP.md for full feature specs._

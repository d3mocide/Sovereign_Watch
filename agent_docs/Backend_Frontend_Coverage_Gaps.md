# Backend → Frontend Coverage Gaps

> **Generated:** 2026-04-04  
> **Branch:** `claude/phase-2-clustering-hmm-16JTJ`  
> **Scope:** All `backend/api/routers/` endpoints cross-referenced against
> `frontend/src/api/`, `frontend/src/hooks/`, and `frontend/src/components/`.  
> Internal/health endpoints excluded.

---

## Audit Summary

| Router file | Endpoints | Covered | Uncovered / Orphaned |
|-------------|:---------:|:-------:|:--------------------:|
| orbital.py | 3 | 3 | — |
| h3_risk.py | 2 | 2 | — |
| buoys.py | 2 | 2 | — |
| iss.py | 2 | 2 | — |
| stats.py | 7 | 7 | — |
| auth.py | 3 | 3 | — |
| tracks.py | 4 | 4 | — |
| metrics.py | 3 | 3 (internal) | — |
| holding_patterns.py | 2 | 2 | — |
| gdelt.py | 2 | 2 | — |
| news.py | 1 | 1 | — |
| jamming.py | 3 | 3 | — |
| maritime.py | 4 | 4 | — |
| rf.py | 3 | 3 | — |
| **satnogs.py** | 4 | 2 | **2 uncovered** |
| **space_weather.py** | 4 | 3 | **1 uncovered** |
| **infra.py** | 8 | 7 | **1 uncovered** |
| **ai_router.py** | 9 | 5 (+2 orphaned hooks) | **2 uncovered + 2 orphaned** |
| analysis.py | 2 | 2 | — |

**Total gaps: 6 endpoints with no UI · 2 orphaned hooks/layers with no mount point**

---

## Gap Details

---

### GAP-01 · `GET /api/satnogs/transmitters`

**Priority:** Medium  
**Router:** `satnogs.py:48`

#### What it returns
Array of satellite transmitter records from the `satnogs_transmitters` table:
```json
[
  {
    "uuid": "abc123",
    "norad_id": "25544",
    "sat_name": "ISS",
    "description": "APRS",
    "alive": true,
    "type": "Transmitter",
    "uplink_low": null,
    "uplink_high": null,
    "downlink_low": 145825000,
    "downlink_high": 145825000,
    "mode": "FM",
    "invert": false,
    "baud": null,
    "status": "active",
    "updated_at": "2026-04-04T00:00:00Z"
  }
]
```

**Query params:** `norad_id?`, `mode?`, `alive_only=true`, `limit=500`

#### Frontend status
`useSatNOGS.ts` calls `GET /api/satnogs/verify/{norad_id}` (spectrum check) but
**never fetches the transmitter catalog**. `SatnogsView.tsx` shows station status
but has no frequency/mode lookup.

#### Suggested UI
- **Where:** `SatnogsView.tsx` sidebar panel (triggered when a SatNOGS station entity is selected)
- **What:** A collapsible "Transmitters" section listing expected downlink frequencies and modes
  for the selected satellite (filtered by `norad_id`). Useful for operators cross-referencing
  what frequencies to listen on. Could also feed a frequency filter in the SatNOGS layer.
- **Component type:** Sidebar detail section / collapsible table

---

### GAP-02 · `GET /api/satnogs/observations`

**Priority:** Medium  
**Router:** `satnogs.py:107`

#### What it returns
Recent ground-station observation records:
```json
[
  {
    "observation_id": 9876543,
    "norad_id": "25544",
    "ground_station_id": 42,
    "transmitter_uuid": "abc123",
    "frequency": 145825000,
    "mode": "FM",
    "status": "good",
    "start_time": "2026-04-04T01:00:00Z",
    "rise_azimuth": 45.2,
    "set_azimuth": 210.8,
    "max_altitude": 62.4,
    "has_audio": true,
    "has_waterfall": true,
    "vetted_status": "good",
    "fetched_at": "2026-04-04T01:05:00Z"
  }
]
```

**Query params:** `norad_id?`, `ground_station_id?`, `hours=24`, `limit=200`

#### Frontend status
No frontend file calls this endpoint. `SatnogsView.tsx` uses the `verify/{norad_id}` endpoint
which internally queries observations but does not expose the raw time-series to the operator.

#### Suggested UI
- **Where:** `SatnogsView.tsx` — a collapsible "Recent Observations" timeline (similar to
  `TrackHistoryPanel` but for signal contacts)
- **What:** A scrollable list showing observation time, status (good/bad/failed), max elevation,
  and whether audio/waterfall data exist — giving operators a historical signal health view for
  the selected station or satellite.
- **Component type:** Sidebar timeline panel

---

### GAP-03 · `GET /api/space-weather/alerts`

**Priority:** High  
**Router:** `space_weather.py:131`

#### What it returns
Current NOAA R/S/G scale levels and the active signal-loss suppression state:
```json
{
  "scales": {
    "0": {
      "R": { "Scale": "R3", "Text": "Strong radio blackout" },
      "S": { "Scale": "S0", "Text": "None" },
      "G": { "Scale": "G1", "Text": "Minor geomagnetic storm" }
    }
  },
  "suppression": {
    "active": true,
    "reason": "R3 Radio Blackout",
    "r_scale": "R3",
    "g_scale": "G0",
    "expires_at": "2026-04-04T06:00:00Z",
    "set_at": "2026-04-04T02:00:00Z"
  },
  "fetched_at": "2026-04-04T03:00:00Z"
}
```

#### Frontend status
`SpaceWeatherPanel.tsx` fetches `GET /api/space-weather/status` (Kp index + storm level)
and `GET /api/space-weather/aurora` (GeoJSON) but **never fetches the R/S/G scale levels
or signal-loss suppression state**. The `suppression.active` field is particularly important:
it means the AI signal-loss detector is muted and operators may incorrectly assume all RF
signals are healthy.

#### Suggested UI
- **Where:** `SpaceWeatherPanel.tsx` — extend the existing panel with an R/S/G scale block
- **What:** Three coloured scale indicators (R0–R5 = radio blackout, S0–S5 = solar particle,
  G0–G5 = geomagnetic storm). When `suppression.active`, show a prominent amber banner:
  `"SIGNAL-LOSS SUPPRESSION ACTIVE — RF anomaly detection paused until {expires_at}"`.
- **Component type:** Status badge row + conditional alert banner
- **Alert integration:** If `suppression.active` transitions to `true`, emit an `onEvent()`
  intel event of type `"alert"`.

---

### GAP-04 · `GET /api/infra/nws-alerts/summary`

**Priority:** Low  
**Router:** `infra.py:74`

#### What it returns
Lightweight alert counts from Redis (used internally by the air-domain analyser):
```json
{
  "count": 12,
  "severe_count": 3,
  "extreme_count": 1,
  "fetched_at": "2026-04-04T02:00:00Z"
}
```

#### Frontend status
`GET /api/infra/nws-alerts` (full GeoJSON) is fetched and rendered as a layer.
The `/summary` variant is only read by the backend air-domain analyser. No frontend
component surfaces the alert counts.

#### Suggested UI
- **Where:** The existing NWS layer toggle area in `MapControls.tsx` or the status bar
- **What:** A small count badge `NWS: 12 (3 severe)` next to the NWS toggle that refreshes
  every 60 s. This is low-effort and gives instant situational awareness without opening the
  full GeoJSON layer.
- **Component type:** Status count badge
- **Note:** May be redundant if the operator already has the NWS layer enabled. Implement
  opportunistically alongside another map-controls pass.

---

### GAP-05 · `POST /api/ai_router/analyze/air`

**Priority:** High  
**Router:** `ai_router.py:924`

#### What it returns
Air Intelligence Officer LLM-fused assessment:
```json
{
  "domain": "air",
  "h3_region": "872830828ffffff",
  "narrative": "Air domain assessment: 14 ADS-B tracks active...",
  "risk_score": 0.42,
  "indicators": [
    "Emergency squawk codes active: 2 aircraft",
    "GPS degradation risk: Kp=5 (G1)"
  ],
  "context_snapshot": {
    "adsb_entity_count": 14,
    "emergency_squawk_count": 2,
    "kp_index": 5.0,
    "nws_alerts": { "severe_count": 1 }
  }
}
```

**Request body:** `{ "h3_region": "...", "lookback_hours": 24 }`

Equivalent endpoints for sea and orbital domains:
- `POST /api/ai_router/analyze/sea` — MDA specialist, fuses AIS + NDBC + IODA + GDELT
- `POST /api/ai_router/analyze/orbital` — Space/orbital analyst, fuses Kp + R/S/G + SatNOGS

#### Frontend status
The `AnalysisWidget` in each entity view triggers `POST /api/ai_router/evaluate` (regional
escalation) and `POST /api/analyze/{uid}` (single-entity track analysis via `analysis.py`).
The three **domain-specialist endpoints** (`/analyze/air`, `/analyze/sea`, `/analyze/orbital`)
are never called from the frontend.

#### Suggested UI
- **Where:** A new "Domain Intel" button in the **right-click context menu** (`MapContextMenu.tsx`)
  on an empty map region, triggering the appropriate domain analyser for the H3 cell under the cursor.
  Alternatively, add per-domain tabs to the existing `AnalysisWidget` slide-out panel.
- **What:** The `narrative` string displayed in the analyst panel + `indicators` list rendered as
  bullet points + `risk_score` shown as a threat meter. The three domains map naturally to the
  existing entity type split (air → `showAir`, sea → `showSea`, orbital → `showSatellites`).
- **Component type:** Context menu action → analyst panel tab
- **Note:** `analyze/sea` and `analyze/orbital` have the same request/response shape as
  `analyze/air` — one reusable `DomainAnalysisPanel` component covers all three.

---

## Orphaned Code (Hooks/Layers with No Mount Point)

These files exist and are syntactically correct but are **never imported** by any
component or consumed by the app.

---

### ORPHAN-01 · `useClausalChains` + `buildClausalChainLayer`

| File | Status |
|------|--------|
| `frontend/src/hooks/useClausalChains.ts` | Defined, **never imported** |
| `frontend/src/layers/buildClausalChainLayer.ts` | Defined, **never imported** by `composition.ts` |

`useClausalChains.ts` fetches `GET /api/ai_router/clausal-chains` and
`GET /api/ai_router/regional_risk` — both endpoints are therefore unreachable from the UI
even though the hooks are fully implemented.

`buildClausalChainLayer.ts` builds a PathLayer from `ClausalChain[]` data but is never
passed to `composeAllLayers()`.

#### To activate
1. Add `clusterChainsData?: ClausalChain[]` to `LayerCompositionOptions` in `composition.ts`
2. Import and call `buildClausalChainLayer` in the return array (above entity chevrons)
3. Add a `useClausalChains({ region: currentH3Cell, enabled: filters?.showClausalChains })` call
   in `useAnimationLoop.ts` (same pattern as `h3RiskCells`)
4. Add `showClausalChains?: boolean` to `MapFilters` and a toggle in `MapControls`

---

## Implementation Priority

| Rank | Gap | Effort | Operator Value |
|------|-----|--------|----------------|
| 1 | **GAP-03** Space-weather R/S/G scales + suppression banner | S | High — suppression active = silent degraded ops |
| 2 | **GAP-05** Domain analysis (air/sea/orbital) via context menu | M | High — exposes the most powerful AI fusion endpoints |
| 3 | **ORPHAN-01** Activate clausal-chain layer + hooks | S | Medium — infrastructure already built |
| 4 | **GAP-01** SatNOGS transmitter frequency lookup | S | Medium — useful for RF operators |
| 5 | **GAP-02** SatNOGS observation timeline | S | Medium — signal history for ISR workflow |
| 6 | **GAP-04** NWS alert count badge | XS | Low — informational only |

Effort key: XS < 1h · S = 1–3h · M = 3–8h

# Phase 2 Frontend Gap Analysis — Missing UI Components

> **Status:** Phase 2 backend (ST-DBSCAN clustering + HMM trajectory analysis) shipped in `fb91d39`.
> This document catalogues every remaining frontend gap that leaves Phase 2 analysis invisible or
> partially surfaced to operators.

---

## ✅ Implemented in This PR (Phase 2 Frontend Sprint)

| Component | File | Description |
|-----------|------|-------------|
| `buildClusterLayer` | `src/layers/buildClusterLayer.ts` | Deck.gl pulsed-amber ScatterplotLayer + TextLayer renders ST-DBSCAN cluster centroids on the map |
| `HMMTimelinePanel` | `src/components/widgets/HMMTimelinePanel.tsx` | Collapsible panel in entity detail sidebar showing state-sequence bar chart, dominant state, confidence, and anomaly score |
| `HMMStateBadge` | (same file) | Compact badge in entity header showing HMM dominant state with threat-coloured styling; pulses when anomaly > 30 % |
| `api/clusters.ts` | `src/api/clusters.ts` | `fetchClusters(h3Region)` typed wrapper for `GET /api/ai_router/clusters` |
| `api/trajectory.ts` | `src/api/trajectory.ts` | `fetchTrajectory(uid)` typed wrapper for `GET /api/ai_router/trajectory/{uid}` |
| Cluster layer wiring | `useAnimationLoop.ts`, `composition.ts` | Cluster data fetched every 30 s (centred on map viewport H3-7 cell) when `filters.showClusters` is on; passed through animation loop to layer composer |
| `MapFilters.showClusters` | `src/types.ts` | Toggle flag for cluster overlay |
| AircraftView integration | `AircraftView.tsx` | HMM badge + HMM_STATES button + timeline panel |
| ShipView integration | `ShipView.tsx` | HMM badge + HMM_STATES button + timeline panel |

---

## 🔴 Remaining Gaps — Not Yet Implemented

### G-1 · Cluster Layer Toggle in Map Controls / Filter Panel
**Severity:** High — the `showClusters` flag has no UI entry point yet.

- **Where it belongs:** `src/components/map/MapControls.tsx` (the floating filter toolbar) or the
  existing "Layers" panel wherever `showH3Risk` / `showJamming` toggles live.
- **What to build:** A simple checkbox/button row labelled "ST-DBSCAN Clusters" that calls
  `handleFilterChange("showClusters", !filters.showClusters)`.  Follow the existing `showH3Risk`
  toggle pattern in `App.tsx` lines 700–715.

---

### G-2 · Cluster Detail Panel / Click-to-Inspect
**Severity:** Medium — operators can see cluster circles on the map but cannot inspect their member UIDs.

- **Where it belongs:** A new sidebar view `ClusterView.tsx` in `src/components/layouts/sidebar-right/`
  or an inline tooltip/popover on the cluster circle.
- **What to build:**
  - Make `buildClusterLayer` pickable and emit `onEntitySelect`-compatible payloads with
    `type: "cluster"`.
  - Add a `ClusterView.tsx` component that lists member UIDs, start/end time, entity count, and
    a "Track All" button that selects each member in sequence.
- **Backend available:** `GET /api/ai_router/clusters` already returns `uids[]` per cluster.

---

### G-3 · HMM Timeline Panel for Satellites / Other Entity Types
**Severity:** Low-Medium — HMM analysis runs on all TAK-tracked entities; SatelliteView does not
surface it.

- **Where it belongs:** `src/components/layouts/sidebar-right/SatelliteView.tsx` (and any other
  entity view that uses trajectory data).
- **What to build:** Same `HMMStateBadge` + `HMMTimelinePanel` integration already done for
  `AircraftView` and `ShipView`.  Requires `useEffect`/`fetchTrajectory` + badge + toggle button.

---

### G-4 · HMM Anomaly Intel Event Feed
**Severity:** Medium — anomalous HMM results are never surfaced in the real-time Intel event stream.

- **Where it belongs:** `src/alerts/` — a new `HMMAlertEngine.ts`, consumed by `App.tsx` which
  already calls `onEvent()` to push items into the Intel Feed sidebar.
- **What to build:**
  - Poll `GET /api/ai_router/trajectory/{uid}` for any entity with `anomaly_score > 0.4`.
  - Emit `onEvent({ type: "alert", message: "HMM ANOMALY: ${uid} — ${dominant_state}", entityType: "air" })`.
  - De-duplicate by UID with a `notifiedRef` pattern (see `JammingAlertEngine.ts`).

---

### G-5 · Cluster Count Badge in Status Bar
**Severity:** Low — no operator awareness of how many active clusters exist in the current viewport.

- **Where it belongs:** The top status bar or the entity count row that shows `AIR / SEA / ORBITAL`
  counts (see `App.tsx` near the `countsRef` updates).
- **What to build:** Derive `clusterCount` from `clusterDataRef.current.length` in the animation loop
  and surface it alongside existing counts.  A small amber "CLSTR: N" indicator is sufficient.

---

### G-6 · Cluster Overlay Colour-coding by Risk
**Severity:** Low — cluster circles are currently uniformly amber.  Clusters containing entities
already classified as LOITERING or CONVERGING by HMM should be rendered red.

- **Where it belongs:** `buildClusterLayer.ts` — accept an optional `hmmStateMap: Map<string, string>`
  and colour each cluster based on the worst state among its `uids`.
- **Backend available:** Combine `GET /api/ai_router/clusters` with per-UID trajectory results
  already stored in `trajectory_states` hypertable.

---

### G-7 · HMM State Filter (Show Only Anomalous Entities)
**Severity:** Low — no way to filter the entity layer to show only entities currently in a threat state.

- **Where it belongs:** `MapFilters` + `EntityFilterEngine.ts` / the existing filter pipeline.
- **What to build:** A `filterHMMState?: "all" | "threat_only"` filter flag that restricts rendered
  entities to those with `dominant_state` in `["LOITERING", "MANEUVERING", "CONVERGING"]`.  Requires
  caching HMM results in a ref (e.g. `hmmStateMapRef: Map<uid, HMMResult>`) that the entity filter
  engine can read.

---

### G-8 · Trajectory State Timeline Scrubbing
**Severity:** Low — the current `HMMTimelinePanel` renders a static state-sequence bar but does not
allow the operator to scrub to a point in time and see where the entity was on the map.

- **Where it belongs:** `HMMTimelinePanel.tsx` + integration with the existing `historySegments`
  map layer.
- **What to build:** A click/hover handler on the state-bar SVG that emits a timestamp, which is
  used to highlight the corresponding point on the `history-track-solid` PathLayer.

---

## Implementation Priority Ranking

| Rank | Gap | Justification |
|------|-----|---------------|
| 1 | **G-1** — Cluster toggle in filter panel | Cluster layer is invisible without a toggle |
| 2 | **G-4** — HMM anomaly intel events | Operators need push-style alerts, not pull-style inspection |
| 3 | **G-2** — Cluster click-to-inspect | Required for triage: see which UIDs form a cluster |
| 4 | **G-3** — HMM in SatelliteView | Orbital entities are a primary ISR concern |
| 5 | **G-5** — Cluster count in status bar | Situational awareness of activity level |
| 6 | **G-6** — Risk-coloured clusters | Visual differentiation between benign and threat clusters |
| 7 | **G-7** — HMM state entity filter | Power-user workflow: declutter to threat-only view |
| 8 | **G-8** — State-bar timeline scrubbing | UX polish for deep investigation workflow |

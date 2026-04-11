# GDELT Mission Linkage Model — Implementation Plan

## Issue

GDELT events are admitted into the mission-area risk assessment via a 250 km centroid-radius
spatial proxy (`ST_DWithin` on the H3 polygon centroid). This produces two failure modes:

- **False positives**: events that happen to fall within the radius but have no causal relationship to the mission area.
- **False negatives**: events outside the radius (e.g., conflict in a neighboring country's capital) that will materially affect the mission area but are silently dropped.

The source-scope metadata already documents this as a known limitation:
`"Proxy filter only; explicit geopolitical linkage rules are still pending."`

Research in `agent_docs/ai_research/2026-04-08-gdelt-mission-linkage-research.md` defined five
candidate linkage categories and asked the open questions that need answering before
implementation can proceed.

---

## Key Findings from Codebase Audit

### Data available right now

| Data | Location | Format |
|------|----------|--------|
| GDELT `actor1_country`, `actor2_country` | `gdelt_events` table | **CAMEO/FIPS 10-4 2-letter codes** (e.g. `RS` = Russia, `CH` = China) |
| Cable-country topology | Redis `infra:cable_country_index` | `{countries: {key: {country: "Full Name", ...}}}` — normalized full names |
| Cable geometry | Redis `infra:cables` | GeoJSON LineStrings |
| Cable landing stations | Redis `infra:stations` | GeoJSON Points |
| Existing proximity helpers | `ai_router.py` | `_derive_cable_relevant_countries_from_index()` returns **full normalized names** |

### Critical code gap

The cable-country index uses **normalized full country names** (e.g., `"united states"`), but
GDELT stores **CAMEO 2-letter codes** (e.g., `"US"`). There is currently no bridge between these
two namespaces. The linkage model must add one.

### Existing H3 query gap

The current GDELT filter uses:
```sql
ST_DWithin(geom::geography, ST_Centroid(ST_GeomFromText($2, 4326))::geography, 250000)
```
This admits events that are near the polygon centroid but **outside** the H3 boundary. Swapping
to `ST_Within` for in-AOT events is a strict improvement with no downside.

---

## Recommended Linkage Model

### Three-tier admission gate

| Tier | Criterion | Source scope tag | Confidence |
|------|-----------|-----------------|-----------|
| **1 — In-AOT** | `ST_Within(geom, h3_polygon)` | `mission_area` / `in_aot_intersection` | 1.0 |
| **2A — State actor / border** | `actor1_country` or `actor2_country` is the mission-area country or a 1st-order geographic neighbor; quad_class ≥ 3 | `impact_linked_external` / `state_actor_border_linkage` | 0.8 (direct) / 0.5 (neighbor) |
| **2B — Cable infrastructure** | `actor1_country` or `actor2_country` maps to a cable-connected landing country within 250 km of the H3 centroid; quad_class ≥ 3 | `impact_linked_external` / `cable_infra_linkage` | 0.7 |
| **2C — Maritime chokepoint** | Event coordinates are within 150 km of a named strategic chokepoint that serves the mission region; quad_class ≥ 3 | `impact_linked_external` / `maritime_chokepoint_linkage` | 0.6 |
| **Ambient** | Fails all tiers | Excluded | — |

**Key design decisions:**
- Tiers 2A/2B/2C are restricted to **conflict-coded events only** (quad_class 3 or 4). Cooperation
  events outside the AOT are not admitted — they create narrative noise without operational
  relevance.
- Linkage is binary per rule but each event carries a `linkage_tier` tag so callers know how
  it was admitted.
- The existing `_compute_gdelt_conflict_score()` function is unchanged — it already correctly
  weights by quad_class and tone.

---

## What Needs to Be Built

### 1. CAMEO → normalized country name mapping (new static dict)

GDELT actor country fields use CAMEO country codes. These must be mapped to the normalized full
names that the cable-country index uses.

**File to add**: `backend/api/routers/gdelt_country_codes.py`

Contains a dict: `CAMEO_TO_NORMALIZED: dict[str, str]` mapping ~240 CAMEO 2-letter codes to
normalized full names (e.g., `"CH" → "china"`, `"RS" → "russia"`). This is a one-time
static data file; CAMEO codes are stable and rarely change.

### 2. Country neighbor graph (new static dict)

A dict mapping CAMEO country codes to sets of neighboring CAMEO codes.
`CAMEO_NEIGHBORS: dict[str, set[str]]`

**Scope**: 1st-order geographic neighbors only. ~240 countries × average 5 neighbors ≈ ~1,200
pairs. This is a public dataset (derivable from CIA World Factbook / Natural Earth).

**File**: Same `gdelt_country_codes.py` or a separate `gdelt_neighbors.py`.

### 3. Mission-area country detection

Given the H3 centroid `(lat, lon)`, identify which CAMEO country code it falls in. Options:

**Option A (Recommended)**: Embed a list of ~240 country capital coordinates keyed by CAMEO code.
Find the nearest capital to the H3 centroid. This is a lightweight, O(240) scan with no
dependencies. Accuracy is acceptable because H3 cells are small (~5 km² at resolution 7) and
missions within a country will have a centroid close to that country's territory.

**Option B** (deferred): PostGIS country boundary lookup (requires adding a country polygons
table to the DB — more accurate but adds ingestion complexity).

Capital-proximity approach goes in `ai_router.py` as `_detect_mission_country(lat, lon) -> str`.

### 4. Strategic chokepoint list

Embed a static list of ~20 named maritime chokepoints with lat/lon and associated region tags:

```python
_STRATEGIC_CHOKEPOINTS = [
    {"name": "Strait of Hormuz",    "lat": 26.5, "lon": 56.3, "regions": {"CENTCOM", "INDOPACOM"}},
    {"name": "Strait of Malacca",   "lat": 1.25, "lon": 103.8, "regions": {"INDOPACOM"}},
    {"name": "Suez Canal",          "lat": 30.7, "lon": 32.3, "regions": {"CENTCOM", "AFRICOM", "EUCOM"}},
    {"name": "Gibraltar",           "lat": 36.0, "lon": -5.35, "regions": {"EUCOM", "AFRICOM"}},
    {"name": "Bosphorus/Dardanelles", "lat": 41.0, "lon": 29.0, "regions": {"EUCOM"}},
    {"name": "Bab-el-Mandeb",       "lat": 12.6, "lon": 43.3, "regions": {"CENTCOM", "AFRICOM"}},
    {"name": "Luzon Strait",        "lat": 20.5, "lon": 121.5, "regions": {"INDOPACOM"}},
    {"name": "Taiwan Strait",       "lat": 24.5, "lon": 119.5, "regions": {"INDOPACOM"}},
    {"name": "English Channel",     "lat": 50.9, "lon": 1.4,  "regions": {"EUCOM"}},
    {"name": "Cape of Good Hope",   "lat": -34.4, "lon": 18.5, "regions": {"AFRICOM"}},
    {"name": "Drake Passage",       "lat": -58.0, "lon": -68.0, "regions": {"SOUTHCOM"}},
    {"name": "Danish Straits",      "lat": 55.5, "lon": 10.5, "regions": {"EUCOM"}},
    {"name": "Sunda Strait",        "lat": -6.0, "lon": 105.8, "regions": {"INDOPACOM"}},
    {"name": "Lombok Strait",       "lat": -8.8, "lon": 115.7, "regions": {"INDOPACOM"}},
    {"name": "Panama Canal",        "lat": 9.0,  "lon": -79.6, "regions": {"SOUTHCOM", "NORTHCOM"}},
]
```

The region tags are not used for hard-gating yet — chokepoint linkage is based on distance only.
Region tags are preserved for future Phase 2 weighting.

### 5. Refactor GDELT SQL query in ai_router.py

**Current** (lines 642–689):
- One query: `ST_DWithin` radius proxy
- All events tagged with same `h3_centroid_radius_proxy` linkage reason

**Target**:
```sql
SELECT
    event_id AS event_id_cnty,
    to_char(COALESCE(event_date, time::date), 'YYYYMMDD') AS event_date,
    lat AS event_latitude,
    lon AS event_longitude,
    event_code,
    headline AS event_text,
    quad_class,
    tone,
    goldstein,
    actor1_country,
    actor2_country,
    CASE
        WHEN ST_Within(geom, ST_GeomFromText($2, 4326)) THEN 'in_aot'
        WHEN actor1_country = ANY($3) OR actor2_country = ANY($3) THEN 'state_actor'
        WHEN actor1_country = ANY($4) OR actor2_country = ANY($4) THEN 'cable_infra'
        ELSE 'chokepoint'  -- pre-filtered in Python or added via UNION
    END AS linkage_tier
FROM gdelt_events
WHERE time > now() - ($1 * interval '1 hour')
  AND (
      ST_Within(geom, ST_GeomFromText($2, 4326))
      OR (
          quad_class >= 3
          AND (
              actor1_country = ANY($3)  -- mission country + 1st-order neighbors
              OR actor2_country = ANY($3)
              OR actor1_country = ANY($4)  -- cable-connected countries
              OR actor2_country = ANY($4)
          )
      )
  )
ORDER BY time DESC
```

Where:
- `$3` = array of CAMEO codes for (mission country ∪ 1st-order neighbors)
- `$4` = array of CAMEO codes for cable-connected countries (derived from cable index → reverse
  mapped through CAMEO_TO_NORMALIZED)

Chokepoint linkage (Tier 2C) is handled in Python after the query, filtering events whose
lat/lon falls within 150 km of a relevant chokepoint.

### 6. Update source_scope metadata

Replace the "pending" note with explicit linkage breakdown:

```python
"gdelt": _build_scope_descriptor(
    "mission_area" if in_aot_count > 0 else "impact_linked_external",
    "explicit_geopolitical_linkage",
    lookback_hours=lookback_hours,
    notes=(
        f"{in_aot_count} in-AOT, "
        f"{state_actor_count} state-actor/border, "
        f"{cable_infra_count} cable-infra, "
        f"{chokepoint_count} maritime-chokepoint"
    ),
)
```

---

## What Is NOT Being Built (Deferred)

| Feature | Reason deferred |
|---------|-----------------|
| Alliance/basing linkage | No machine-readable reference data in the codebase. Requires external dataset (NATO, SOFA agreements, etc.). Phase 3. |
| Weighted (non-binary) linkage scores | Phase 2 — needs regression corpus to tune weights. |
| PostGIS country boundary table | Phase 2 — adds ingestion complexity. Capital-proximity is adequate for now. |
| 2nd-order country neighbors | Phase 2 — 1st-order neighbors only to start, to limit false-positive blast radius. |
| Theater-level grouping (INDOPACOM, EUCOM, etc.) | Phase 2 — useful for chokepoint relevance refinement. |
| Regression corpus | Phase 2 — requires labeled historical scenarios. |

---

## Implementation Phases

### Phase 1 — Core Linkage Model (This Sprint)

**Files changed:**
1. `backend/api/routers/gdelt_country_codes.py` *(new)* — CAMEO→name mapping + neighbor graph + capital coordinates
2. `backend/api/routers/ai_router.py` — Refactor GDELT query, add linkage helpers, update source_scope metadata

**New helper functions in ai_router.py:**
- `_detect_mission_country(lat, lon) -> str | None` — find nearest capital, return CAMEO code
- `_build_mission_country_set(mission_cameo: str) -> set[str]` — mission + 1st-order neighbors
- `_build_cable_country_set(cable_countries: set[str]) -> set[str]` — reverse-map normalized names to CAMEO codes
- `_classify_gdelt_linkage(events: list[dict]) -> dict[str, list[dict]]` — bucket events by linkage tier
- `_filter_chokepoint_events(events: list[dict], region_lat, region_lon) -> list[dict]` — Tier 2C

**Tests to add:**
- `backend/api/tests/test_gdelt_linkage.py` *(new)* — unit tests for each linkage function
- Extend `test_ai_router_evaluate.py` — assert source_scope no longer contains "pending" note; assert in_aot events use ST_Within logic

### Phase 2 — Regression + Refinement

- Build labeled corpus (3-5 historical mission scenarios)
- Measure false-positive/false-negative delta vs. old centroid-radius proxy
- Tune neighbor depth (1st vs. 2nd order)
- Tune conflict-only threshold (currently quad_class ≥ 3; may relax to allow Goldstein < -5)
- Decide binary vs. weighted linkage score contribution

### Phase 3 — Alliance/Basing Linkage

- Source NATO, basing, SOFA reference data
- Add to static config or new DB table
- Implement `_build_alliance_country_set()` for Tier 2D

---

## Exit Criteria for Phase 1

- [ ] GDELT source_scope no longer contains "Proxy filter only; explicit geopolitical linkage rules are still pending."
- [ ] In-AOT events use `ST_Within` not `ST_DWithin` centroid proxy
- [ ] Out-of-AOT events are only admitted for quad_class ≥ 3 AND meet at least one linkage rule
- [ ] Each admitted event carries a `linkage_tier` field (`in_aot`, `state_actor`, `cable_infra`, `chokepoint`)
- [ ] All existing evaluate tests pass
- [ ] New linkage unit tests pass
- [ ] `ruff check` clean

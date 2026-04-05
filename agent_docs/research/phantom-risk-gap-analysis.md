# Phantom-Risk Gap Analysis: Phantomtide Methodology vs. Sovereign Watch Implementation

**Date:** 2026-04-04
**Source Document:** `agent_docs/research/phantom-risk.md`
**Scope:** Risk score calculation architecture, data ingestion fidelity, identity resolution, memory management, and forensic auditability.

---

## Executive Summary

The Phantomtide research document describes a battle-hardened maritime GRC intelligence platform that evolved through several catastrophic failure modes before arriving at a resilient, mathematically defensible risk scoring architecture. Sovereign Watch shares some structural DNA — both use asynchronous Python backends, Redis caching, time-series databases, and Kafka-brokered ingestion — but diverges significantly in the _depth_ and _rigor_ of its risk calculation model.

Eleven discrete gaps are identified below. The most severe concern the absence of an Evidence-First claim model, missing maritime-domain threat intelligence feeds (MARAD, ICC-CCS, VIIRS), no temporal decay on signal confidence, and the lack of holistic multiplicative threat synthesis.

---

## Risk Score Formula Comparison

| Dimension | Phantomtide | Sovereign Watch | Gap |
|---|---|---|---|
| **Primary formula** | Temporally-decayed weighted claim aggregation: `C = Σ(w_i·v_i) / Σ(w_i)` where `w_i = c_i · λ(t − t_i)` | Additive weighted sum: `C = 0.6·Density_norm + 0.4·Sentiment_norm` | No temporal decay; no per-source confidence interval |
| **Escalation model** | Multiplicative synthesis across 4 threat vectors (entity ownership × AIS anomaly × geopolitical zone × environmental) | Additive: `0.40·pattern_confidence + 0.35·anomaly_score + 0.25·alignment_score` with a capped multiplier | Additive vs. multiplicative; no ownership/entity dimension |
| **Score output range** | Continuous [0, 1] with Warning Level taxonomy (Low / Medium / High) | Continuous [0, 1] emitted as H3 cell risk heat map | No explicit tiered severity taxonomy |
| **Claim storage** | Append-only evidence ledger — every claim preserved with source, value, confidence, and timestamp | Standard TimescaleDB upserts — conflicting signals resolved destructively | **Critical: evidence is destroyed on ingest** |
| **Auditability** | Full forensic replay — analysts can re-run score derivation at any historical moment | No replay capability — overwritten records cannot be reconstructed | Scores are unverifiable after the fact |

---

## Gap Inventory

### GAP-01 — Missing Evidence-First Claim Model (Critical)

**Phantomtide:** Every ingested intelligence signal is stored as an immutable, probabilistic _claim_ rather than a resolved truth. The persistent store retains `{field, value, source_api, confidence_interval, capture_timestamp}` for every signal, including conflicting values from competing APIs. Score recalculation requires only adjusting confidence multipliers — no re-ingestion needed.

**Sovereign Watch:** TimescaleDB hypertables use standard upsert semantics. When a maritime poller ingests a vessel position, any prior record for that MMSI at that timestamp is overwritten. Conflicting signals from multiple sources (e.g., a vessel's AIS-reported position vs. a VIIRS thermal coordinate) have no storage mechanism — only the last writer wins.

**Impact:** Analysts cannot distinguish between a confident, corroborated signal and a single low-fidelity data point. Fraud evasion via conflicting data injection is undetectable. Risk score manipulation through source poisoning leaves no forensic trace.

**Files affected:** `backend/db/init.sql`, `backend/api/services/historian.py`

---

### GAP-02 — No Temporal Decay on Signal Confidence (High)

**Phantomtide:** The effective weight of each stored claim incorporates a temporal decay function `λ(Δt)`. Intelligence gathered 72 hours ago is treated as less authoritative than intelligence gathered 10 minutes ago. The decay function is domain-tunable per signal type.

**Sovereign Watch:** The escalation detector uses fixed-window lookbacks (24h / 7d / 30d in `spatial_temporal_alignment.py`) as binary filters — signals either fall within the window or are excluded entirely. There is no continuous confidence decay. A GDELT event from 23.9 hours ago carries identical weight to one from 30 seconds ago.

**Impact:** Stale intelligence inflates or deflates risk scores with the same force as current intelligence. This is particularly harmful for fast-moving maritime scenarios (vessel route changes, fleet deployments) where situational context can reverse within hours.

**Files affected:** `backend/api/routers/h3_risk.py:14-99`, `backend/api/services/spatial_temporal_alignment.py`

---

### GAP-03 — Absent Maritime Threat Intelligence Feeds (High)

Phantomtide ingests eight domain-specific upstream sources. Sovereign Watch covers the general-purpose and environmental domains but is entirely missing the maritime-specific threat intelligence layer.

| Phantomtide Feed | Purpose | Sovereign Watch Status |
|---|---|---|
| **NDBC** (Oceanographic/Meteorological) | Environmental routing hazard baseline | **Missing** — no wave height, wind shear, or barometric data |
| **MARAD** (Maritime Administration) | State-level maritime hostility/blockade zones | **Missing** — no geopolitical maritime zone feed |
| **ICC-CCS** (Piracy Reporting) | Kinetic threat density grids, piracy clusters | **Missing** — no piracy or armed robbery feed |
| **GPS Advisories** | Electronic warfare, spoofing, jamming zones | **Partial** — local jamming detection exists (`jamming.py`) but no advisory _feed_ consumed |
| **USGS / DART** | Seismic and tsunami alerts | **Missing** — no geological threat integration |
| **ECCC** (Arctic Weather) | Polar routing and ice-edge hazards | **Missing** — no high-latitude weather source |
| **VIIRS** (Satellite Infrared) | Dark fleet detection via AIS-off thermal cross-reference | **Missing** — most critical gap for sanctions evasion |
| **NGA MIS** (Defense/Navigational Safety) | Ordnance zones, military exercise perimeters | **Missing** |

GDELT and space weather partially overlap with the geopolitical and environmental categories, but none of the maritime-domain threat feeds are present.

---

### GAP-04 — No Dark Fleet / AIS-Off Detection (Critical)

**Phantomtide:** VIIRS satellite infrared thermal signatures are cross-referenced against known AIS broadcast positions. A discrepancy between a thermal heat signature and no corresponding AIS coordinate triggers a large anomaly multiplier — the primary signal for sanctions evasion via "going dark."

**Sovereign Watch:** AIS ingestion (`maritime_poller/`) tracks active transponders only. There is no mechanism to detect a vessel that has disabled its AIS transponder. A vessel that goes dark simply disappears from the track feed with no anomaly raised.

**Impact:** Complete blind spot for the most common maritime sanctions evasion technique. The "dark fleet" operating in support of sanctioned state actors (e.g., Iranian oil, Russian crude transfers) is entirely invisible to the current system.

**Files affected:** `backend/ingestion/maritime_poller/service.py`, no VIIRS poller exists

---

### GAP-05 — No Multiplicative Holistic Threat Synthesis (High)

**Phantomtide:** The final vessel risk score `R_vessel` is the _multiplicative_ synthesis across four independent threat vectors: entity ownership risk, AIS/positional anomaly, geopolitical zone intersection, and environmental conditions. All four must align — a clean ownership profile cannot offset a confirmed MARAD zone incursion combined with AIS anomalies.

**Sovereign Watch:** Both the H3 risk router and the escalation detector use _additive_ weighted sums. A single dominant signal (e.g., extreme GDELT Goldstein score) can overwhelm the contribution of other indicators. Cross-domain threat convergence — the scenario where three independent risk signals co-locate — produces only incrementally higher scores rather than an exponential escalation.

**Impact:** Sophisticated actors who maintain plausible deniability in one or two threat dimensions can suppress their overall risk score even when multiple other indicators are aligned. The system cannot model threat convergence.

**Files affected:** `backend/api/routers/h3_risk.py:14-99`, `backend/api/services/escalation_detector.py:521-578`

---

### GAP-06 — No Cross-Domain Entity Resolution (High)

**Phantomtide:** A vessel's risk profile is inseparable from the entities that own and operate it. The enrichment layer performs OSINT screening of corporate entities against PEP databases, sanctions lists, terror watchlists, and court records — correlating vessel-level telemetry to legal-entity-level compliance risk.

**Sovereign Watch:** Entity identity is siloed by domain. Aviation uses ICAO24 hex, maritime uses MMSI, satellites use NORAD IDs. There is no mechanism to associate a vessel (MMSI) to its registered operating company, flag-state entity, or beneficial owner. The vessel classification system (`classification.py`) performs AIS type-code categorization but no entity-level enrichment.

**Impact:** A sanctioned entity operating vessels under shell companies or flag-of-convenience registrations cannot be detected. The risk score captures only what the vessel _does_, not who _owns_ it.

**Files affected:** `backend/ingestion/maritime_poller/classification.py`, no entity enrichment service exists

---

### GAP-07 — Identity Clustering Has No Signal-Strength Hierarchy (Medium)

**Phantomtide:** Learned from a critical bug where merging entities on weak identifiers (name + city) caused high-risk actors to inherit trust signals from legitimate entities. Resolution: deterministic identifiers (verified phone, cryptographic email) are the _only_ permitted merge keys; probabilistic identifiers (names, addresses) are demoted to heuristic score hints.

**Sovereign Watch:** Entity identity within each domain is correctly anchored to strong hardware identifiers (ICAO24, MMSI). However, no explicit framework governs cross-source or cross-domain entity linking. If future enrichment features attempt to correlate entities across domains using weak signals (vessel name, port city), the Phantomtide failure mode could be re-introduced.

**Files affected:** No entity resolution service exists — this is a preventive architectural gap

---

### GAP-08 — Unbounded In-Process Cache Risks (Medium)

**Phantomtide:** After the OOM crisis, the engineering team instituted hard caps: `MAX_REDIS_EVENTS = 8_000`, 24-hour lookback limits, streaming generator hydration via `zscan_iter`, and chunked ClickHouse writes at `chunk_size=1000`.

**Sovereign Watch:** Several in-process data structures lack hard upper bounds:
- `arbitration.py` — per-hex dict is bounded only by 30s TTL eviction; under high-traffic scenarios with slow eviction cycles, memory growth is unbounded
- `holding_pattern.py` — per-aircraft heading deques have no maximum length (only time-window pruning)
- `jamming.py` — per-cell observation lists are likewise time-pruned only, not size-capped
- Historian batch consumer holds up to 100 messages per flush cycle, but there is no circuit breaker for Kafka consumer lag spikes that could cause the batch buffer to overflow before flush

**Files affected:** `backend/ingestion/aviation_poller/arbitration.py`, `backend/ingestion/aviation_poller/holding_pattern.py`, `backend/ingestion/aviation_poller/jamming.py`, `backend/api/services/historian.py`

---

### GAP-09 — No Risk Score Severity Taxonomy (Low–Medium)

**Phantomtide:** The OSINT enrichment layer produces a formally defined Warning Level designation: **Low / Medium / High**, accompanied by a binary/ternary recommendation ("suitable" / "caution" / "avoid"). This provides a human-readable decisional output anchored to the numerical score.

**Sovereign Watch:** Risk scores are emitted as continuous floats `[0, 1]` on the H3 risk heatmap. The frontend renders a color gradient (green → red), but there is no schema-level severity taxonomy, no threshold-anchored label, and no recommended action field. Operators must mentally interpret the color gradient against an unstated threshold.

**Files affected:** `backend/api/models/schemas.py:32-39`, `backend/api/routers/h3_risk.py`

---

### GAP-10 — Startup Hydration Concurrency Not Bounded at API Layer (Low)

**Phantomtide:** The "deterministic burst load" failure resulted from all collectors initializing at the same `datetime.now()`. Resolution: staggered chronological hydration windows with slow collectors starting before fast-loop collectors.

**Sovereign Watch:** The per-domain pollers run as isolated containers with independent startup sequences, which inherently avoids the same-timestamp burst problem at the infrastructure level. However, the `historian_supervisor` background task and the H3 risk router's first-request Redis hydration both fire concurrently at API startup without any explicit staggering. Under a cold-start with a populated Redis/TimescaleDB state, the initial materialization could produce a localized burst.

**Files affected:** `backend/api/main.py:42-73`, `backend/api/routers/h3_risk.py`

---

### GAP-11 — No Programmatic Confidence Intervals Per Ingested Claim (Medium)

**Phantomtide:** Each source is assigned an explicit confidence coefficient before aggregation (e.g., `email_api → 0.60`, `phone_api → 0.90`). These source-level confidence scores directly modulate the claim's contribution to the aggregated certainty parameter `C`.

**Sovereign Watch:** The H3 risk formula assigns fixed architectural weights (`ω_D = 0.6`, `ω_S = 0.4`) but these reflect _domain_ importance, not _source_ reliability. There is no mechanism to express that a particular GDELT article originated from a low-credibility outlet, or that an AIS position report came from a satellite feed (lower position accuracy) rather than a terrestrial receiver (higher accuracy). All sources within a domain are treated as equally authoritative.

**Files affected:** `backend/api/routers/h3_risk.py:14-99`, `backend/ingestion/gdelt_pulse/service.py`

---

## Gap Summary Matrix

| Gap | Domain | Severity | Effort Estimate |
|---|---|---|---|
| GAP-01: No Evidence-First claim model | Architecture / Storage | Critical | Large (schema redesign) |
| GAP-02: No temporal decay on confidence | Scoring Algorithm | High | Medium |
| GAP-03: Missing maritime threat feeds | Data Ingestion | High | Large (8 new pollers) |
| GAP-04: No dark fleet / AIS-off detection | Maritime Intelligence | Critical | Large (VIIRS integration) |
| GAP-05: Additive vs. multiplicative synthesis | Scoring Algorithm | High | Medium |
| GAP-06: No cross-domain entity resolution | Entity Intelligence | High | Large |
| GAP-07: No signal-strength hierarchy for clustering | Identity Resolution | Medium | Small–Medium |
| GAP-08: Unbounded in-process caches | Memory Management | Medium | Small |
| GAP-09: No risk severity taxonomy | API / Schema | Low–Medium | Small |
| GAP-10: API-layer startup hydration burst | Scheduling / Init | Low | Small |
| GAP-11: No per-source confidence intervals | Scoring Algorithm | Medium | Medium |

---

## Recommended Priority Order

1. **GAP-04** (Dark Fleet / VIIRS) — The most immediate blind spot for the stated maritime intelligence mission. No VIIRS integration means sanctions evasion via AIS deactivation is completely undetectable.
2. **GAP-01** (Evidence-First Model) — Foundational architectural change. Without it, all risk scores are forensically indefensible and manipulation-resistant behavior cannot be reconstructed after the fact.
3. **GAP-03** (Maritime Threat Feeds) — MARAD and ICC-CCS feeds directly enable kinetic threat zone scoring. Adding these pollers follows the established Kafka ingest pattern and is well-scoped.
4. **GAP-05** (Multiplicative Synthesis) — Moderate algorithmic change to the escalation detector; high impact on detection of multi-vector threat convergence.
5. **GAP-02** (Temporal Decay) — Requires per-claim timestamp tracking; easier once GAP-01 is addressed.
6. **GAP-06** (Entity Resolution) — High value but requires external data relationships (vessel registries, sanctions databases).
7. **GAP-11 → GAP-07 → GAP-08 → GAP-09 → GAP-10** — Hardening and hygiene items; addressable incrementally.

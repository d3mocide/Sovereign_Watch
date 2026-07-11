# Clausal Chain & AI Analysis Pipeline Fixes

Implements the critical/high findings from
`agent_docs/ai_research/2026-07-10-clausal-chain-pipeline-review.md`.

## Issue

Several correlation legs of the clausal-chain → risk-scoring pipeline were
silently inert or unsound:

1. The multi-INT context tables (`internet_outages`, `space_weather_context`,
   `satnogs_signal_events`) had no writers — `/api/ai_router/evaluate`'s
   context correlation always saw empty tables.
2. GDELT escalation patterns used English tokens against numeric CAMEO codes
   (never matched) and were evaluated newest-first (backwards).
3. The clausalizer's jitter filter dropped messages before state-change
   evaluation, suppressing all non-positional transitions (a vessel anchoring
   can never move >100 m; altitude/type/battery changes while stationary lost).
4. Squawk was published by the ADS-B poller but discarded by the clause
   emitter, so 7700/7600/7500 emergency detection never fired on real data.
5. GDELT/TAK temporal alignment parsed `event_date` to midnight UTC, making
   the ±2 h alignment window meaningless.
6. SatNOGS "signal loss < −10 dBm" was physically inverted (normal reception
   is −70…−120 dBm) — and SatNOGS observations don't carry dBm at all.
7. Risk composition: weak context evidence could *lower* risk (averaging
   blend); space weather was boosted then dampened; the cross-domain
   convergence boost could never see aviation; the LLM could overrule the
   heuristic score gated only on its own self-reported confidence.
8. The semantic cache could serve a neighboring H3 region's assessment
   (prompt-embedding similarity 0.94 with only the cell ID differing) and ran
   blocking embedding/Redis I/O on the event loop.
9. `detect_rendezvous` never fired from `/evaluate` or `/api/analyze/{uid}` —
   neither caller passed clause `time`, so every clause was discarded.
10. `tak_clausalizer/tests/test_escalation_detector.py` failed collection
    (stale sys.path hack) so ~20 tests never ran.

## Solution

Feed the context data through tables that actually have writers; fix the
detector vocabulary/ordering; evaluate state changes before jitter gating;
carry squawk end-to-end; make risk composition monotonic in evidence; scope
the LLM cache by region and clamp LLM score revisions.

## Changes

**Clausalizer (`backend/ingestion/tak_clausalizer/`)**
- `service.py`: state changes are evaluated *before* the jitter check; jitter
  now only suppresses `LOCATION_TRANSITION` (positional noise). Extracted
  `_build_medial_clause()` (deduplicates cache-clause construction, now
  includes squawk).
- `state_change_evaluator.py`: new `SQUAWK_EMERGENCY` transition
  (7500/7600/7700, confidence 1.0, de-duplicated against the cached squawk);
  `COURSE_CHANGE` gated on both samples moving (stationary GPS heading is
  noise).
- `clause_emitter.py`: `adverbial_context.squawk` carried from
  `detail.classification.squawk` when present.

**Detectors & scoring (`backend/api/services/escalation_detector.py`)**
- `ESCALATION_PATTERNS` rewritten as CAMEO root-code sequences
  (14→17→18, 14→19, 13→15→19, 15→18, 18→20); `_cameo_root()` extraction;
  events sorted oldest→newest before matching; subsequence match now
  requires ≥2 matched elements and ≥66 % of the pattern.
- Clustering score rescaled: threshold ⇒ 0.5, 2× threshold ⇒ 1.0 (was /100,
  which made the >0.5 indicator gate require 50+ entities in one H3-9 cell).
- Directional anomalies sort each trace by time (previously compared the two
  *oldest* clauses because rows arrive DESC).
- SatNOGS scoring: NULL-strength events (curated bad/failed observations)
  score by `confidence`; dBm readings gated at a −90 dBm weak-signal floor
  with deviation-based score (was: everything below −10 dBm flagged, weaker
  = higher score).
- `compute_risk_score`: context adds bounded headroom-scaled risk (never
  decreases the base); space weather excluded from the additive term
  (dampener only); convergence counts domains across behavioral + context
  anomalies via new `behavioral_anomalies` param; NOAA G-scale labels fixed
  (G1=Kp5 … G5=Kp9).

**AI Router (`backend/api/routers/ai_router.py`)**
- Space-weather queries point at `space_weather_kp` (the table the space
  poller actually feeds) instead of the never-written `space_weather_context`.
- SatNOGS queries accept NULL `signal_strength` rows, select `confidence`,
  order by recency; thresholds updated to −90 dBm.
- GDELT queries select `time`; pattern-detection input includes it.
- `tak_dicts` include clause `time` (activates rendezvous + correct
  directional ordering).
- `compute_risk_score` call passes active behavioral anomalies.
- LLM risk override clamped to ±0.25 of the heuristic score.

**Alignment (`backend/api/services/spatial_temporal_alignment.py`,
`gdelt_linkage.py`)**
- GDELT events align on the real `time` column (event_date midnight parse is
  now only a fallback); linkage queries select `time`.

**Context feeds**
- `backend/ingestion/infra_poller/main.py`: IODA outage snapshots persisted
  to `internet_outages` (new `_insert_outages_sync`).
- `backend/ingestion/space_pulse/sources/satnogs_network.py`: also fetches
  `bad` and `failed` observations (page-bounded).
- `backend/api/services/historian.py`: bad/failed/vetted-failed observations
  additionally inserted into `satnogs_signal_events` (signal_strength NULL,
  confidence 0.7/0.9, NOT EXISTS dedup).

**Harness (`backend/api/services/semantic_cache.py`,
`sequence_evaluation_engine.py`, `ai_service.py`, `routers/analysis.py`)**
- Semantic cache entries tagged with a scope (the H3 region); scope mismatch
  = miss; legacy plain entries only served scopeless; RedisVL check/store run
  via `asyncio.to_thread`.
- `analysis.py` vicinity query selects `time` (rendezvous fix) and no longer
  reports zero-score clustering as a behavioral signal.
- `AIService._load_model_map` skips models whose env vars are unset with a
  clear warning instead of passing `"os.environ/..."` placeholders to LiteLLM.

**Tests**
- `test_escalation_detector.py` moved to `backend/api/tests/` (was failing
  collection in the clausalizer package) and updated to the new semantics;
  new coverage: reverse-chronology matching, de-escalation non-match,
  monotonic context evidence, cross-domain convergence with behavioral
  anomalies, SatNOGS NULL-strength events.
- New `test_service_jitter_ordering.py` (anchoring/squawk emit despite zero
  movement; positional jitter still dropped).
- Squawk passthrough tests in `test_clause_emitter.py`; course-gating and
  squawk tests in `test_state_change_evaluator.py`.
- New `test_semantic_cache_scope.py`.
- `test_ai_router_clausal.py` mocks updated to `space_weather_kp`;
  `test_satnogs_network.py` updated for the per-status fetch split.

## Verification

- `backend/api`: 238 passed (ruff clean on changed files)
- `backend/ingestion/tak_clausalizer`: 51 passed (ruff clean)
- `backend/ingestion/space_pulse`: 64 passed, 1 skipped
- `backend/ingestion/infra_poller`: 88 passed (ruff clean)

## Benefits

- Multi-INT context correlation (outages, space weather, satellite signal
  loss) actually fires in `/evaluate` — dampening, boosting, and convergence
  are live for the first time.
- GDELT escalation sequences are detectable and directional.
- The most operationally significant state changes (vessel anchoring,
  emergency squawk, altitude change in place) now produce clausal chains.
- Risk scores are monotonic in evidence and cannot be silently zeroed by a
  single overconfident LLM completion.
- Regional assessments can no longer bleed across H3 cells via the LLM cache,
  and cache I/O no longer blocks the event loop.

# Clausal Chain & AI Analysis Pipeline Review — 2026-07-10

Scope: end-to-end audit of the causality/clausal-chain stack — TAK Clausalizer
(`backend/ingestion/tak_clausalizer/`), spatial-temporal alignment, escalation
detection and risk scoring (`backend/api/services/`), the AI Router
(`/api/ai_router/*`), the per-entity analyst loop (`/api/analyze/{uid}`), and
the AI harness (AIService / LiteLLM / semantic cache / personas).

Overall verdict: the architecture is sound — pollers → Kafka → clausalizer →
TimescaleDB → heuristic detectors → LLM synthesis, with heuristics as ground
truth and the LLM as narrator, graceful fallbacks at every layer. But several
of the *correlation* legs the design depends on are currently inert: they
run, return zeros, and the composite risk score silently degrades to
"GDELT conflict ratio + TAK anomaly max". All 185 API tests pass because the
tests hand-craft data shaped the way the detectors expect, not the way the
pipeline actually produces it.

---

## Critical — correlation legs that never fire

### 1. The three multi-INT context tables have no writers
`/api/ai_router/evaluate` queries `internet_outages`, `space_weather_context`,
and `satnogs_signal_events` for context anomalies (dampening/boosting, the
convergence boost, escalation indicators). **Nothing in the repo inserts into
any of these tables.**
- IODA outages → Redis `infra:outages` only (`infra_poller/main.py`).
- Space weather → Redis `space_weather:kp_current` / `noaa_scales` /
  `suppress_signal_loss` only (`space_pulse/sources/space_weather.py`).
- SatNOGS observations → Kafka topic only (`space_pulse/sources/satnogs_network.py`);
  no consumer writes `satnogs_signal_events`.

The newer domain agents (`/analyze/air|sea|orbital`) correctly read the Redis
keys — that's why they work. The Phase-1C context correlation inside
`/evaluate` (and the context enrichment in `/clausal-chains`) reads
permanently-empty tables, so `context_anomalies` is always empty there:
no outage boosting, no space-weather dampening, no orbital signal-loss input,
and the cross-domain convergence boost is unreachable.
**Fix:** either persist the Redis/Kafka feeds into the tables (small consumers)
or port `/evaluate`'s context step to the same Redis reads the domain agents use.

### 2. GDELT escalation-pattern matching can never match
`EscalationDetector.ESCALATION_PATTERNS` uses English tokens
(`"PROTEST"`, `"POLICE_DEPLOYMENT"`, `"VIOLENT_CLASHES"` …) but
`gdelt_events.event_code` contains numeric CAMEO codes (`"190"`, `"141"`) for
GDELT rows and ReliefWeb category names ("Conflict and Violence") otherwise
(see `gdelt_pulse/service.py:231,436`). `detect_pattern` therefore always
returns `(None, 0.0)`; the only GDELT contribution to risk is
`_compute_gdelt_conflict_score` via `max(pattern_confidence, gdelt_conflict_score)`.
**Fix:** express patterns as CAMEO root-code sequences (14 protest → 17 coerce →
19 fight → 20 mass violence) matched against `event_root_code`.

Related: events are fed in `ORDER BY time DESC`, so even a fixed vocabulary
would match escalation sequences *backwards* (de-escalation would score as
escalation). Sort ascending before matching.

### 3. Jitter filter swallows non-positional state changes
`service.py:process_message` drops the whole message when Haversine movement
< 100 m — **before** `evaluate_transitions` runs. Five of the six transition
types don't require movement, so the most operationally interesting events are
systematically suppressed:
- `SPEED_TRANSITION` moving→stationary (a vessel anchoring / aircraft landing)
  is *definitionally* under 100 m of movement → can never be emitted.
- `TYPE_CHANGE` (affiliation/category flips) while loitering → dropped.
- `ALTITUDE_CHANGE`: haversine is 2-D, so a climbing/descending aircraft at a
  fixed position is "jitter".
- `BATTERY_CRITICAL` on a stationary asset → dropped.

**Fix:** run the evaluator first and use the jitter check only to gate
`LOCATION_TRANSITION` / cache refresh noise, or bypass the filter when
type/speed-class/altitude/battery deltas are material.

### 4. Emergency squawk never reaches the chain
The aviation poller publishes `detail.classification.squawk` on `adsb_raw`,
but `clause_emitter.py` builds `adverbial_context` with only
speed/course/altitude/battery — squawk is discarded. Downstream,
`detect_emergency_transponders` looks for `adverbial_context.squawk` then
`clause.detail.classification.squawk`; neither exists on real
`clausal_chains` rows, so 7700/7600/7500 detection in `/evaluate` and
`/analyze/{uid}` **never fires on production data**. (Unit tests pass because
they inject squawk directly.) There is also no `SQUAWK_CHANGE` transition, so
an emergency squawk alone may not even produce a clause.
**Fix:** carry squawk into `adverbial_context` and add an emergency-squawk
transition (confidence 1.0) in `state_change_evaluator.py`.

### 5. GDELT/TAK temporal alignment compares against midnight
`SpatialTemporalAlignment._parse_event_time` parses `event_date` (YYYYMMDD) →
00:00 UTC, then `_calculate_alignment_score` checks `|gdelt.time − tak.time| < 2h`.
The alignment score is effectively "was there TAK activity within 2 h of
midnight UTC" — noise. The `gdelt_events` table has a real `time` column (it's
already used in the WHERE clause); select it and align on it, or widen the
window to daily granularity when only a date is available.

---

## High — scoring and harness soundness

### 6. SatNOGS "signal loss" threshold is physically inverted
`SATNOGS_SIGNAL_LOSS_DBM = -10.0` with `score = |dBm|/100` treats any signal
below −10 dBm as a loss and scores *weaker* (i.e. often perfectly normal)
signals higher. Typical ground-station reception is −70…−120 dBm; −10 dBm
would be an extraordinarily strong signal. Once feed #1 is fixed this would
flag essentially every observation. Score against a per-station/per-satellite
baseline or use SatNOGS observation status (good/bad/failed) instead of
absolute dBm.

### 7. `compute_risk_score` context blending can *reduce* risk
`risk = 0.8·risk + 0.2·avg(context_scores)`: a strong TAK-driven risk (0.8)
plus one mild outage (severity 0.1) drops to 0.66 — adding evidence lowers the
alert. Related inconsistencies:
- Space weather is first blended *in* (raises risk) then dampened 10 % — a
  Kp 6 storm with zero TAK/GDELT change *raises* regional escalation risk,
  contradicting the "expected degradation" rationale. Space weather should be
  an explainer/dampener only (the Redis suppression gate already does this
  correctly for signal loss).
- Convergence boost counts domains only among `context_anomalies`
  (orbital/infrastructure); `emergency → aviation` in `ANOMALY_DOMAIN_MAP` is
  unreachable because TAK anomalies aren't passed in. Pass all active
  anomalies to the domain count, or document convergence as context-only.

### 8. Semantic cache can serve a neighboring region's assessment
Cache key = full prompt embedding, threshold 0.94 cosine. Prompts for adjacent
H3 cells with similar quiet contexts differ only in the cell ID → similarity
well above 0.94 → cross-region hits return the wrong region's narrative/score.
TTL 120 s limits exposure but doesn't fix correctness. Scope the cache by
region (include `h3_region` in the cache name/filter, or verify region match
on hit). Also `check()`/`store()` run the embedding + Redis I/O synchronously
inside async handlers — use redisvl's async variants or a thread executor.

### 9. LLM can silently override the heuristic risk score
In `/evaluate`: `if confidence > 0.7: risk_score = assessment.risk_score`. The
model's *self-reported* confidence gates a full override; the consistency
guard repairs the narrative but not the score, so an overconfident low-ball
response zeroes a heuristic 0.7 alert. Clamp the override (e.g. ±0.25 of the
heuristic, or only allow upward revisions without corroborating indicators).

---

## Medium

10. **Clustering score scale is self-inconsistent** — score = uids/100, so the
    5-entity threshold yields 0.05 and the indicator gate (`score > 0.5`)
    requires 50+ entities inside one H3-9 cell (~0.1 km²) — effectively never.
    Meanwhile `rendezvous` saturates at 10 in the same cell size. Normalize
    relative to `CLUSTERING_THRESHOLD` and align the indicator gate.
11. **Directional anomaly reads the two oldest clauses** — inputs are ordered
    `time DESC`, so `trace[-1]`/`trace[-2]` are the oldest pair in the window,
    not "recent". Sort ascending per UID (as the HMM path already does).
12. **Domain-agent heuristics are mislabeled**
    - "Dark vessel" = one state-change row in the window. Clausal chains are
      sparse by design (steady vessels emit few rows), so normal traffic gets
      flagged; real dark-vessel logic should key off AIS gap + FIRMS
      cross-reference (the `dark_vessel` taxonomy entry already anticipates this).
    - "Holding pattern" = ≥5 rows in the window — any maneuvering aircraft.
      The aviation poller already computes real holding-pattern detection
      (`detail.classification.holding_pattern`) that the clausalizer drops,
      and the HMM has a HOLDING_PATTERN state; wire either through.
    - `entity_count * 0.005` baselines make busy-but-normal areas look risky.
13. **LiteLLM `router_settings` and Presidio callback are dead config** —
    `AIService` calls `litellm.acompletion` directly and only reads
    `model_list`; there is no LiteLLM proxy container. The
    `public-flash → deep-reasoner` fallback and PII redaction never execute.
    Use `litellm.Router(model_list=…, fallbacks=…)` in AIService (and register
    callbacks) or run the proxy.
14. **Env substitution leaves placeholders** — `_load_model_map` falls back to
    the literal `"os.environ/GEMINI_MODEL"` when the variable is unset,
    producing confusing call-time failures. Warn and skip the entry instead.
15. **`tak_clausalizer/tests/test_escalation_detector.py` fails collection** —
    the sys.path hack inserts `api/services`, but `escalation_detector` now
    imports `services.hmm_trajectory` etc., so the whole file errors with
    `ModuleNotFoundError` and its ~20 tests never run. Insert the API root as
    well, or move/merge the file into `backend/api/tests/`.

---

## Low / hygiene

- `service.py` batch machinery (`message_batch`, `flush_batch`,
  `batch_flush_loop`) is dead code — every clause is a synchronous
  `send_and_wait` + individual INSERT, contradicting the docs' "batch flush
  loop reduces database writes".
- `hourly_clausal_summaries` continuous aggregate has no consumer.
- `clausal_chains.source = 'GDELT'` is promised by schema/docs/frontend types
  but nothing ever writes GDELT rows; the `/clausal-chains?source=GDELT`
  filter always returns [].
- `_LLM_EVAL_TIMEOUT_SECONDS = 8` will time out most local models → the
  heuristic fallback becomes the de-facto narrative; make it per-model config.
- `_cells_proximate` ignores its `max_distance` parameter and approximates
  adjacency by shared res-6 parent (misses adjacent cells across parent
  boundaries, admits non-adjacent siblings).
- Docs drift in `TAK_Clausalizer.md`: POST `/api/clausal-chains` (actual:
  GET `/api/ai_router/clausal-chains`), Ollama/llama3 config (actual: LiteLLM
  3-provider map), 7-day vs 90-day retention.
- Space-weather category map labels Kp 6 as G1/Kp 7 as G2 (NOAA: G1=Kp5,
  G2=Kp6, G3=Kp7).

---

## What's working well

- Layering is clean and each stage degrades gracefully (LLM overload →
  heuristic narrative; cache miss → LLM; invalid H3 → global scope with an
  explicit `source_scope` descriptor). The scope descriptors are a genuinely
  good explainability pattern.
- The Redis-based space-weather suppression gate (R3+/G3+ suppresses
  signal-loss alerts) is correctly honored in `/evaluate` and the orbital agent.
- `hmm_trajectory.py` (log-domain Viterbi, lazy model build) and `stdbscan.py`
  (row-capped, thread-offloaded) are correct, well-documented implementations.
- `risk_taxonomy.py` as a single source of truth for thresholds/decay/
  reliability is the right shape — the fix for several findings above is to
  route more of the ad-hoc constants through it.
- Persona harness (`get_persona`) is consistent across streaming and static
  paths, with format lockdown and mode/sitrep/hold/gdelt selection; frontend
  hooks match the actual endpoints and auth headers.
- Test suites: 185 API tests and 39 clausalizer tests pass (modulo finding #15).

## Suggested fix order

1. Feed the context tables (or port `/evaluate` to the Redis context reads) — #1
2. CAMEO-based patterns + ascending sort — #2
3. Jitter/evaluator ordering + squawk passthrough — #3, #4
4. Alignment on real GDELT timestamps — #5
5. Risk-score composition rework (no downward blending, dampen-only space
   weather, domain counting) — #7
6. Region-scoped semantic cache + async calls — #8
7. LLM override clamp — #9
8. The medium/low items opportunistically.

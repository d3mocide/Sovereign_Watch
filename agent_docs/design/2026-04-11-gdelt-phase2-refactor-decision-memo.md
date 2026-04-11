# GDELT Phase 2 Refactor Decision Memo (2026-04-11)

## Decision

Choose how to evolve the current Phase 1 GDELT mission-linkage model in [backend/api/services/gdelt_linkage.py](c:/Projects/Sovereign_Watch/backend/api/services/gdelt_linkage.py).

Current behavior is already better than the old centroid-radius proxy:
- In-AOT events are admitted via `ST_Within`.
- Out-of-AOT events are admitted only through explicit external-linkage gates.
- Current linkage tiers are `in_aot`, `state_actor`, `cable_infra`, and `chokepoint`.
- The same service is already reused by regional risk, H3 risk mission mode, and mission-aware GDELT routes.

The remaining question is not whether a GDELT linkage model exists. It does. The Phase 2 question is how much smarter it should become without making analyst output less explainable.

## Current System Impact

Right now GDELT affects the analyst system in three core ways:
- Regional escalation and mission-aware risk surfaces admit geopolitical context through `fetch_linked_gdelt_events()` and expose linkage counts in scope metadata.
- H3 mission risk depends on the same linkage service, so any refactor changes both local analyst narratives and map-level sentiment surfaces.
- Raw/global GDELT endpoints still exist separately, so the refactor must not blur the difference between analyst-linked context and the raw feed.

That means Phase 2 is not just a data-quality improvement. It changes what analysts see as mission-relevant geopolitical pressure and how much they trust those results.

## What Phase 1 Already Solves

Phase 1 fixed the most dangerous problems:
- No more primary centroid-radius admission for in-AOT events.
- No more automatic admission of every nearby out-of-AOT event.
- Conflict-only gating for external events reduces ambient geopolitical noise.
- Explicit `linkage_tier` tags make the model auditable.

Phase 2 should therefore be about precision and calibration, not about replacing everything that already works.

## Remaining Gaps

These are the real Phase 2 issues still visible in code and backlog:
- Neighbor depth is limited to first-order adjacency.
- Chokepoints are distance-based, not theater-aware.
- Alliance and basing linkage do not exist.
- External linkage is still binary rather than weighted.
- Country detection relies on country-center proximity, not true boundaries.
- There is no regression corpus to tune false-positive and false-negative tradeoffs.

## Option A

Keep the current deterministic tier model and only add more hard gates.

Example changes:
- Add second-order neighbors.
- Add alliance and basing country sets.
- Add theater tags to chokepoints.
- Keep admission binary: event is either admitted or excluded.

### Pros
- Preserves explainability. Analysts and engineers can still say exactly why an event was admitted.
- Lowest disruption to current consumers of `linkage_tier` and source-scope counts.
- Fits the current service design naturally.
- Easier to test with deterministic regressions.

### Cons
- Can become brittle as more rules accumulate.
- Binary decisions hide relative confidence among very different external events.
- Harder to tune subtle cases where one weak rule should not outweigh several weak negatives.
- Risk of rule sprawl inside one service file.

### Effect On Analyst System
- Analyst outputs stay stable and auditable.
- Mission narratives improve incrementally, but some admitted events will still feel overly equal even when their real relevance differs.
- H3 risk sentiment remains simple to explain because admitted events are still a yes/no set.

### Best Use Case
- If the main goal is precision improvement without introducing probabilistic ambiguity.

## Option B

Replace hard-gated tiers with a weighted linkage score across all candidate events.

Example model:
- In-AOT gets a high base score.
- Direct mission-country actor match gets a strong score.
- Neighbor-country, cable-country, chokepoint, alliance, and basing add partial weights.
- Admit events only if total score crosses a threshold.

### Pros
- Most flexible and expressive model.
- Can represent relative relevance better than a flat tier list.
- Better long-term fit if the project wants richer mission scoring and learned calibration.
- Makes it possible to differentiate strong external drivers from weak ambient signals.

### Cons
- Highest complexity.
- Harder for analysts to trust if the scoring rationale is not obvious.
- Harder to debug and maintain without a labeled regression corpus.
- High risk of looking precise without being well-calibrated.

### Effect On Analyst System
- Analysts may get better prioritization of geopolitical context, but only if the model is well tuned and surfaced clearly.
- If badly tuned, the system will become less predictable: events may appear or disappear for reasons users cannot easily inspect.
- H3 mission risk could become more nuanced, but also harder to explain in operator terms.

### Best Use Case
- If the team is ready to invest in calibration data and wants a more sophisticated scoring model rather than just better rule design.

## Option C

Hybrid model: keep deterministic admission tiers, then add a secondary relevance score only within admitted events.

Example contract:
- Admission remains hard-gated and auditable.
- Every admitted event also gets a `linkage_score` or `linkage_strength` derived from tier, distance, actor match quality, theater match, or alliance evidence.
- Callers may sort or weight admitted events by this score, but exclusion still uses deterministic rules.

### Pros
- Best balance of explainability and refinement.
- Preserves the current analyst trust model: users can still see why an event got in.
- Enables Phase 2 improvements like chokepoint weighting or neighbor-depth tuning without making the entire model opaque.
- Safer path for H3 risk, where weighted sentiment can use a stronger ordering without letting every weak signal through.

### Cons
- More complex than pure deterministic tiers.
- Requires design discipline so score semantics do not drift.
- Still needs a small regression corpus if the score is used for ranking or weighting.
- May tempt future code to use score thresholds inconsistently across routes.

### Effect On Analyst System
- Analysts keep explicit admission reasons and gain a better notion of relative importance.
- Mission narratives can prioritize stronger external events instead of treating all Tier 2 events as equivalent.
- H3 risk can benefit from weighted geopolitical influence without reopening the full false-positive problem.

### Best Use Case
- If the team wants better prioritization and later scoring flexibility without sacrificing auditability now.

## Recommendation

Recommend Option C.

Reasoning:
- Phase 1 already established a good deterministic trust boundary. Throwing that away for a fully scored gate is premature.
- The biggest current weakness is not admission logic alone. It is that all admitted external events at a given tier are treated too similarly.
- A hybrid model lets Phase 2 add theater tags, deeper adjacency, and alliance/basing evidence while keeping the analyst-facing contract inspectable.

## Suggested Phase 2 Scope

1. Keep current admission tiers as the hard gate.
2. Add optional `linkage_score` or `linkage_strength` to admitted events only.
3. Add theater tags to chokepoints and use them to downweight regionally irrelevant choke-point matches.
4. Add second-order neighbors only behind tests and scenario review, not by default everywhere.
5. Add alliance and basing linkage only if the reference data is explicit and auditable.
6. Build a small regression corpus before changing any admission thresholds.

## Suggested Field Contract

For each admitted event:
- `linkage_tier`: deterministic reason for admission.
- `linkage_score`: relative strength among admitted events.
- `linkage_evidence`: optional machine-readable details such as matched country code, matched chokepoint name, cable-country match, or theater tag.

This keeps the current trust model while making the ranking more useful.

## Analyst-System Consequences By Choice

- Option A: safest and simplest, but analysts still get flat relevance among different external events.
- Option B: most powerful in theory, but highest risk of making geopolitical context feel opaque or arbitrary.
- Option C: best balance for current platform maturity because it preserves clear admission reasons while improving prioritization.

## Practical Recommendation For Next PR

The next GDELT PR should not try to solve everything at once.

Recommended order:
1. Build a small labeled scenario corpus.
2. Add theater-aware chokepoint tagging and scoring.
3. Add `linkage_score` to admitted events without changing hard admission yet.
4. Review whether second-order neighbors improve recall enough to justify the extra blast radius.
5. Defer alliance and basing linkage until the reference dataset is explicit and reviewable.

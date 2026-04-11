# Clausal Space-Weather Scope Decision Memo (2026-04-11)

## Decision

Choose how `space_weather_context` should behave in mission-scoped clausal-chain enrichment.

Current behavior in [backend/api/routers/ai_router.py](c:/Projects/Sovereign_Watch/backend/api/routers/ai_router.py) is:
- Clausal chains are mission-scoped by H3 or radius.
- Outages are now mission-relevant via cable topology.
- SatNOGS is now mission-scoped.
- Space weather is still fetched globally over the lookback window and labeled `impact_linked_external`.

That means the remaining question is not whether space weather is local today. It is not. The question is whether that is the right contract for analysts going forward.

## Current System Impact

Today this affects the analyst system in three places:
- The clausal-chain payload returned by `/api/ai_router/clausal-chains` includes a single `space_weather_context` item for the whole response window, not a chain-specific mission relevance result.
- The live tactical map pulls those chains through [frontend/src/hooks/useAnimationLoop.ts](c:/Projects/Sovereign_Watch/frontend/src/hooks/useAnimationLoop.ts), so any future change will alter what analysts see when they inspect clausal entities.
- The clausal sidebar in [frontend/src/components/layouts/sidebar-right/ClausalView.tsx](c:/Projects/Sovereign_Watch/frontend/src/components/layouts/sidebar-right/ClausalView.tsx) does not currently explain scope metadata in detail, so if space weather is included it is easy for analysts to over-read it as local causal context.

## Option A

Keep space weather explicitly global-as-driver for clausal enrichment.

### Pros
- Lowest implementation cost. The current backend contract already does this.
- Matches the physics better for many space-weather signals. Kp, radio blackout scales, and SEP events are not cleanly local in the same way as outages or tracks.
- Keeps the analyst aware of mission-impacting external drivers even when there is no precise geographic footprint available.
- Preserves consistency with orbital and parts of regional risk, which already use `impact_linked_external` as the exception contract.

### Cons
- Analysts may still mentally attach a global storm record to a local clausal anomaly just because they are shown together.
- Weakens causal precision compared with the new outage and SatNOGS logic.
- Makes the clausal endpoint heterogeneous: some sources are mission-scoped, while one source remains effectively global.
- The frontend does not currently foreground the distinction strongly enough, so the contract can be misunderstood.

### Effect On Analyst System
- Minimal backend change.
- Main improvement would need to be UX: expose source scope and linkage reason more clearly in the clausal UI.
- Analysts would continue seeing a single external-driver record for the window, which is useful for context but not for proving a local causal chain.

### Best Use Case
- If the product goal is to preserve broad operational awareness and avoid hiding major storms that plausibly affect mission systems everywhere.

## Option B

Make clausal space weather geography-aware and mission-filtered.

Example shapes:
- Only include space weather when auroral footprint or another geospatial proxy intersects the mission area.
- Only include when a mission-area system class is plausibly affected and the geographic proxy supports it.

### Pros
- Strongest mission-first contract.
- Makes clausal enrichment internally consistent with the new topology-aware outage path and mission-scoped SatNOGS path.
- Reduces analyst temptation to infer local causality from a merely concurrent global signal.
- Better for forensic or evidentiary workflows where every attached context item should survive a locality challenge.

### Cons
- Hardest to implement correctly. The current `space_weather_context` table is basically temporal severity context, not a full spatial impact model.
- Some important effects are not well represented by a simple geographic mask. HF/GNSS degradation can be broad, altitude-dependent, or route-dependent.
- Risk of false negatives: a storm that really matters operationally may disappear from clausal context because the proxy is too strict.
- Adds model complexity before the data model is ready.

### Effect On Analyst System
- Analysts would see fewer space-weather attachments in clausal views.
- The remaining attachments would be higher-confidence and easier to defend as mission-relevant.
- The downside is silent omission risk: analysts may assume “no space weather shown” means “no mission impact,” which may not be true if the filter is too narrow.

### Best Use Case
- If the product goal is high evidentiary precision and the team is willing to build or accept a more explicit impact model.

## Option C

Hybrid model: keep space weather as `impact_linked_external`, but threshold and type-gate it before it enters clausal enrichment.

Example rule set:
- Always require a meaningful severity threshold such as `Kp >= 5` or NOAA R/S/G thresholds.
- Include only specific mission-relevant categories, such as radio blackout or geomagnetic storm, not every quiet-context row.
- Keep the label explicit: this is an external driver, not a local event.

### Pros
- Best balance between signal preservation and noise reduction.
- Aligns with what the air route already does by thresholding Kp before it enters the local narrative.
- Avoids pretending space weather is fully local when the underlying data does not support that claim.
- Lower implementation cost than full geospatial filtering.

### Cons
- Still not truly geography-aware.
- Requires careful threshold tuning to avoid suppressing meaningful but moderate events.
- Analysts still need UI help to understand that the attached signal is external-driver context, not local proof.

### Effect On Analyst System
- Analysts would see fewer but more meaningful space-weather attachments in clausal chains.
- The clausal output would become easier to interpret because quiet or weak global context would stop riding along with every local anomaly.
- This is the safest way to improve trust without losing the operational value of global storm context.

### Best Use Case
- If the goal is pragmatic improvement now without committing to a full spatial impact model yet.

## Recommendation

Recommend Option C now, with a path to Option B later if better spatial impact data becomes available.

Reasoning:
- The current system already distinguishes `mission_area` from `impact_linked_external`, so a hybrid thresholded model fits the existing contract.
- The analyst system benefits most from reducing weak global noise, not from forcing an immature geospatial model into production.
- Option C can be paired with a small frontend clarification so analysts can see that space weather is an external driver admitted by threshold, not a local event.

## Suggested Near-Term Implementation

1. Change clausal space-weather enrichment so it only attaches context when the event crosses a mission-relevance threshold.
2. Preserve `context_scope.space_weather.scope = impact_linked_external` and keep `linkage_reason = global_propagation` unless a stronger model exists.
3. Add a compact `relevant_to_mission` or `threshold_passed` field in the payload so the frontend can explain why the context is present.
4. Update the clausal UI to display external-driver labeling instead of presenting the context as if it were local evidence.

## Analyst-System Consequences By Choice

- Option A: Analysts keep broad awareness, but local-causality precision stays weak.
- Option B: Analysts get the cleanest locality story, but may lose real mission-impacting context because the spatial model is incomplete.
- Option C: Analysts keep only stronger mission-impacting external context, which is the best fit for the current platform maturity.

## Issue
The sea-domain AI route was mixing mission-area AIS tracks with global context signals. It used the global maximum NDBC wave height from Redis and counted every outage feature that had any nearby cable landing, regardless of whether the outage was relevant to the requested H3 region. During the audit, the H3 risk layer was also confirmed to ignore outage and sea-state context entirely, and the clausal-chain view only joins outages temporally rather than by mission-area cable relevance.

## Solution
Scope sea-domain ocean and infrastructure context to the requested mission area. Wave height is now derived only from nearby buoys, and cable-correlated outage counts are limited to landing countries that are locally relevant to the mission area, including countries connected by cables that run through the area of interest.

## Changes
- Updated backend/api/routers/ai_router.py:
  - Added mission-area sea-context helpers for H3 centroids, haversine distance, nearby buoy filtering, landing-country extraction, cable endpoint matching, and outage country filtering.
  - Changed /analyze/sea to read Redis infrastructure/ocean snapshots concurrently, scope NDBC data to nearby buoys, use the persisted cable-country topology index when available, and count only outages in cable-relevant landing countries.
  - Added mission-area context details to the sea-domain response snapshot for nearby buoys, relevant landing countries, and sampled cable-correlated outages.
- Updated backend/ingestion/infra_poller/main.py:
  - Added pure helpers to normalize landing-country names, flatten cable geometries, and build a persisted cable-country topology index.
  - Published infra:cable_country_index to Redis during cable/station refreshes so request paths do not need to infer cable endpoint countries repeatedly.
- Updated backend/api/routers/h3_risk.py and backend/api/models/schemas.py:
  - Added an outage component to the H3 risk response and projected outage severity onto cable-landing H3 cells using the persisted cable-country index instead of country-centroid placement.
  - Rebalanced the H3 risk composite to density 0.5, sentiment 0.3, outage 0.2.
- Updated backend/api/routers/ai_router.py clausal-chain endpoint:
  - Reused the same H3/radius spatial filter builder for clausal-chain fetches and outage enrichment.
  - Replaced the coarse string labels with the same per-source scope metadata contract now used elsewhere in the AI router.
  - Kept outages mission-area scoped, marked space weather as impact-linked external, and explicitly labeled SatNOGS as still-global pending a future relevance gate.
- Updated backend/api/routers/ai_router.py evaluate and air endpoints:
  - Added consistent per-source scope metadata to regional risk evaluation responses so TAK, GDELT, outages, space weather, and SatNOGS declare how they are allowed into the result.
  - Marked GDELT as a mission-area proxy source for now, with an explicit note that true geopolitical linkage rules are still pending.
  - Tightened /analyze/air so quiet global Kp values no longer leak into the prompt as ambient local context; space weather is now treated as an impact-linked external driver and only surfaced when it crosses the mission relevance threshold.
- Updated backend/api/routers/ai_router.py orbital endpoint:
  - Added mission-area-first scope metadata to distinguish impact-linked external space-weather drivers from AOT-local orbital signals.
  - Filtered SatNOGS signal-loss events to satellites whose propagated subpoint falls inside the requested H3 mission area at event time, instead of treating all recent global signal-loss events as locally relevant.
  - Removed the new NumPy dependency path from the AI router by using local scalar SGP4 helpers so backend API tests remain runnable on this machine.
- Added backend/api/tests/test_ai_router_sea.py:
  - Regression for mission-area wave-height scoping so distant global maxima no longer leak into the sea analyst prompt.
  - Regression for cable-connected outage scoping so unrelated global outage regions do not inflate the maritime indicator.
- Added backend/api/tests/test_h3_risk_scope.py:
  - Regression proving cable-correlated outages are projected onto landing-point cells in the H3 layer.
- Added backend/api/tests/test_ai_router_air.py coverage:
  - Regression proving quiet global Kp does not leak into the air analyst prompt and that the air route now exposes impact-linked external scope metadata for space weather.
- Added backend/api/tests/test_ai_router_orbital.py:
  - Regression proving orbital analysis keeps only mission-area-relevant SatNOGS signal-loss events and labels space weather as impact-linked external context.
- Added backend/api/tests/test_ai_router_evaluate.py:
  - Regression proving evaluate_regional_escalation returns per-source scope metadata, including the current GDELT proxy note and the explicit global SatNOGS label.
- Updated backend/ingestion/infra_poller/tests/test_infra.py:
  - Added pure helper coverage for cable-country index generation.

## Audit Snapshot
- AOT-scoped now:
  - /analyze/sea uses mission-area AIS, nearby NDBC buoys, and cable-relevant outage countries.
  - /api/h3/risk now uses cell-local density and sentiment plus cable-landing outage projection.
  - /clausal-chains endpoint now applies the same radius-based or H3-based spatial scoping to both returned chains and outage enrichment, while still honoring the lookback window, and it now reports that scope using the shared per-source metadata contract.
  - evaluate_regional_escalation spatially filters TAK, GDELT, and internet_outages to the requested region.
  - /analyze/air spatially filters ADS-B tracks to the requested H3 region, intersects NWS alert geometries with that same region, and only surfaces space weather when it crosses a mission relevance threshold.
  - /analyze/orbital now treats space weather as an impact-linked external driver and filters SatNOGS signal-loss events down to satellites propagated over the mission area.
- Still global or partially global:
  - evaluate_regional_escalation still uses a centroid-radius proxy for GDELT rather than explicit geopolitical linkage.
  - space_weather_context remains global in origin for evaluate_regional_escalation and clausal-chain enrichment, though it is now labeled as impact-linked external rather than local.
  - satnogs_signal_events remain globally sourced in evaluate_regional_escalation and clausal-chain enrichment, though they are now labeled explicitly as global/ungated rather than local.
  - clausal_chains_enriched joins internet_outages by time window only, not by cable topology or mission area.
  - The raw clausal chain materialization path itself does not persist AOT-specific cable or sea-state context into each chain.
  - Explicit GDELT linkage research is now tracked separately in agent_docs/ai_research/2026-04-08-gdelt-mission-linkage-research.md.

## Audit Matrix
- evaluate_regional_escalation:
  - TAK input: H3 + temporal.
  - GDELT input: centroid-radius approximation around the requested H3 cell + temporal.
  - Internet outages: H3 + temporal.
  - Space weather: impact-linked external + temporal.
  - SatNOGS: global + temporal.
- /regional_risk heatmap:
  - Scope model inherits evaluate_regional_escalation for the center cell and its H3 ring neighbors.
  - Result quality is only as local as the underlying evaluation inputs; global space-weather and SatNOGS still bleed into every neighbor cell.
- /clausal-chains:
  - Clausal chains: H3 or radius AOT + temporal.
  - Outage enrichment: same H3 or radius AOT + temporal.
  - Space weather: impact-linked external + temporal.
  - SatNOGS: global + temporal.
  - Returned payload now labels this explicitly via context_scope.
- /analyze/air:
  - ADS-B chains: H3 + temporal.
  - NWS alerts: mission-area geometry intersection.
  - Space weather: impact-linked external current-state cache, threshold-gated at Kp>=5 before it enters the local narrative.
  - Net result: mission-area first with an explicit external-driver exception.
- /analyze/sea:
  - AIS chains: H3 + temporal.
  - Wave height: nearby buoy subset around the mission area.
  - Outages: cable-relevant landing countries tied to the mission area.
  - Net result: strongest local scoping of the current domain routes.
- /analyze/orbital:
  - Kp, NOAA scales, suppression state: impact-linked external current-state cache.
  - SatNOGS loss events: mission-area only after TLE propagation to event-time subpoints.
  - Net result: mixed by design, but now explicit and consistent with the mission-area-first contract.
- Frontend consumers:
  - useAnimationLoop sends radius AOT params when a mission is active, so the map's live clausal polling can use exact mission radii.
  - useClausalChains still sends only region, so hook-driven consumers remain H3-scoped rather than radius-scoped.

## Scope Rules
- Spatial + temporal together:
  - Sea-domain outage context: mission-area cable relevance plus current lookback window.
  - H3 risk outage projection: cable-landing cells plus current lookback window from the outage cache.
  - Clausal-chain outage enrichment: H3/radius mission-area filter plus current lookback window.
- Temporal only for now:
  - SatNOGS signal-loss context in regional risk and clausal chains.
- Impact-linked external:
  - Orbital space-weather context is still global in origin, but it is now explicitly treated as a mission-impact driver rather than local ambient context.
  - Regional risk and clausal-chain space weather are also now explicitly marked as impact-linked external rather than local ambient context.

## Recommended Scope Contract
- Default rule:
  - Mission area first. Analyst routes, risk layers, and clausal enrichment should not pull raw signals from outside the active AOT unless the external signal has a defensible causal path into the AOT.
- Allowed exception:
  - Impact-linked external context is allowed when the relationship to the AOT is explicit and machine-readable.
  - Examples:
    - GDELT events outside the AOT are acceptable if they involve a state, force, route, cable system, or orbital asset that materially affects the AOT.
    - Cable outages outside the AOT are acceptable if they terminate at or traverse landing infrastructure relevant to the AOT.
    - Space-weather state is acceptable globally only when it is presented as a global driver that can degrade systems inside the AOT, not as a local event occurring inside the AOT.
- Disallowed pattern:
  - Pulling global feeds into a local narrative just because they occurred in the same time window.
  - This is the current weakness in orbital, space-weather enrichment, and SatNOGS enrichment.
- Required metadata for exceptions:
  - Any non-local context kept in a local response should declare:
    - source scope: mission_area, impact_linked_external, or global.
    - linkage reason: country conflict, cable topology, orbital footprint, global propagation, or equivalent.
    - time scope: explicit lookback window.
- Practical implementation rule:
  - Prefer filtering at query time rather than post-processing after broad polling.
  - If a feed cannot be spatially filtered directly, convert it into an AOT relevance test before attaching it to the response.

## Recommended Next Refactor Order
- First:
  - Replace the GDELT centroid-radius proxy with explicit geopolitical or infrastructure linkage rules.
- Second:
  - Add a mission-area relevance gate for SatNOGS inside evaluate_regional_escalation and /clausal-chains, similar to the orbital route.
- Third:
  - Decide whether clausal-chain enrichment should attach only filtered context payloads or also include filtered-out source counts for analyst transparency.
- Fourth:
  - Align all frontend clausal consumers on the same AOT mode so mission radius and region-based requests do not diverge silently.

## Verification
- Ran infra poller verification: uv tool run ruff check . && uv run python -m pytest
  - Passed.
- Ran backend API lint: uv tool run ruff check .
  - Passed.
- Ran backend API suite: uv run python -m pytest
  - Collection failed due an existing NumPy wheel / CPU baseline incompatibility on this machine, unrelated to the sea-domain change.
- Ran targeted regressions: uv run python -m pytest tests/test_ai_router_sea.py tests/test_h3_risk_scope.py
- Ran targeted regressions: uv run python -m pytest tests/test_ai_router_sea.py tests/test_h3_risk_scope.py tests/test_ai_router_clausal.py tests/test_ai_router_air.py tests/test_ai_router_orbital.py tests/test_ai_router_evaluate.py
  - Passed (7 tests).

## Benefits
- Maritime analyst output now aligns wave and cable-outage signals with the mission area instead of mixing in global noise.
- Cable-related outage context is harder to misread because it is anchored to landing countries that are actually nearby or connected to cables crossing the AOT, and that same topology can now be reused by other services through Redis.
- The H3 risk layer now reflects cable-landing outage pressure instead of ignoring infrastructure degradation entirely.
- Clausal-chain consumers now have an explicit contract for what is AOT+temporal versus what is still global+temporal, which reduces ambiguity in analyst interpretation and future audits.
- Orbital analysis now matches the mission-area-first policy more closely by treating space weather as an impact-linked external driver and ignoring SatNOGS signal-loss events that are not propagated over the AOT.
- Regional risk and clausal-chain responses now expose the same source-scope contract, which makes the remaining gaps explicit instead of implicit.
- Air analysis now avoids leaking quiet global space-weather values into local prompts while still admitting truly mission-relevant external drivers.
- The remaining audit gap is narrower now: GDELT still uses a regional proxy instead of true mission linkage, and SatNOGS relevance gating still needs to move from orbital into regional risk and clausal enrichment.
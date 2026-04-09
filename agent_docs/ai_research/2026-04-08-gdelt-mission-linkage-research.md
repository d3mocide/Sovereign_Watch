## Problem
GDELT is still admitted into mission-area regional risk using a centroid-radius proxy around the requested H3 region. That is better than a global time-window join, but it is not the same as proving that an out-of-AOT event materially affects the mission area.

## Why This Was Deferred
The current task tightened source-scope consistency first:
- Regional risk and clausal-chain responses now expose explicit source-scope metadata.
- Air analysis now treats space weather as an impact-linked external driver only when it crosses a mission relevance threshold.
- Orbital analysis already filters SatNOGS events to propagated mission-area overflight relevance.

GDELT needs a more careful linkage model than those changes because bad linkage rules will either suppress real geopolitical drivers or reintroduce broad ambient noise.

## Current Behavior
- Endpoint: /api/ai_router/evaluate
- Current filter: H3 centroid plus fixed-radius spatial proxy and lookback window
- Current source-scope label: mission_area with linkage_reason h3_centroid_radius_proxy
- Current note in code: explicit geopolitical linkage rules are still pending

## Research Goal
Replace the regional proxy with explicit impact-linked logic so out-of-AOT GDELT events are included only when they have a defensible causal path into the mission area.

## Candidate Linkage Model
Admit an out-of-AOT GDELT event only if at least one of these is true:
- State actor linkage: the event involves a country, force, or proxy actor with direct operational relevance to the mission area.
- Border or theater linkage: the event occurs in a contiguous or same-theater region that can realistically spill into the mission area.
- Maritime linkage: the event affects a shipping lane, choke point, EEZ, or port chain connected to the mission area.
- Infrastructure linkage: the event affects submarine cables, landing points, satellite systems, power assets, or logistics corridors that materially support the mission area.
- Alliance or basing linkage: the event involves allied basing, overflight, staging, or support nodes that materially affect the mission area.

## Open Questions
- What country and theater graph should define geopolitical adjacency or operational relevance?
- Should maritime linkage use explicit route topology or a simpler choke-point and port dependency model first?
- How should alliance linkage be represented so it is auditable instead of heuristic-only?
- What confidence threshold should be required before an external GDELT event is allowed into a local narrative?
- Should linkage be binary or weighted by category such as direct, supporting, and ambient?

## Suggested Data Inputs
- Mission-area country ownership and neighboring state graph
- Cable-country and landing-point topology already built in infra poller
- Port, choke-point, and shipping corridor datasets
- Satellite constellation and ground-segment dependency metadata
- Alliance, basing, and military access reference data

## Suggested Evaluation Plan
1. Build a labeled set of historical mission areas and relevant out-of-AOT GDELT events.
2. Compare current centroid-radius proxy vs explicit linkage rules.
3. Measure false positive reduction in local narratives.
4. Measure false negative impact on real escalation cases.
5. Decide whether linkage should be hard-gated or contribute a weighted relevance score.

## Exit Criteria
This research is ready for implementation when the team can define:
- a machine-readable linkage graph,
- a deterministic admission rule for out-of-AOT GDELT events,
- and a regression corpus showing improved mission-area precision without unacceptable recall loss.

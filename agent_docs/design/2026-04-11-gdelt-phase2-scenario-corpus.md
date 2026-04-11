# GDELT Phase 2 Scenario Corpus (2026-04-11)

## Purpose

This is a small labeled scenario set for Phase 2 Option 3 work.

It is not a statistical benchmark. It is a deterministic review corpus used to verify that:
- hard admission remains explainable,
- score ordering improves prioritization among admitted events,
- and new weighting logic does not silently widen the blast radius.

## Scenario 1

### Name
Direct in-AOT conflict

### Mission
H3 or radius mission centered on active conflict territory.

### Event shape
- Event occurs inside the mission area.
- Conflict-coded GDELT event.

### Expected admission
- Admit.
- `linkage_tier = in_aot`

### Expected ranking
- Highest possible score.
- Must rank above all linked external events.

### Analyst expectation
- Analysts should treat this as primary local geopolitical evidence, not secondary support context.

## Scenario 2

### Name
Neighbor-country spillover

### Mission
Mission in a border state where adjacent-country escalation plausibly spills into the AOT.

### Event shape
- Event occurs outside the mission area.
- Actor country matches a first-order geographic neighbor.
- Conflict-coded event.

### Expected admission
- Admit.
- `linkage_tier = state_actor`

### Expected ranking
- Rank below direct in-AOT conflict.
- Rank below a direct mission-country state-actor event.
- Rank above weak chokepoint-only matches.

### Analyst expectation
- Analysts should see this as linked external pressure, not local proof.

## Scenario 3

### Name
Cable-connected infrastructure disruption

### Mission
Mission area sits on or near submarine cable routes and landing infrastructure.

### Event shape
- Event occurs outside the AOT.
- Actor country matches a cable-relevant landing country tied to the mission topology.
- Conflict-coded or infrastructure-disruption event.

### Expected admission
- Admit.
- `linkage_tier = cable_infra`

### Expected ranking
- Rank above unrelated neighbor-country noise when the cable dependency is strong.
- Rank below direct in-AOT conflict.

### Analyst expectation
- Analysts should see this as a strong mission-support-system threat even when geographically external.

## Scenario 4

### Name
Chokepoint disruption with theater alignment

### Mission
Mission depends on a strategic maritime chokepoint within the same operational theater.

### Event shape
- Event occurs outside the AOT.
- Conflict-coded event near a named chokepoint.
- Chokepoint aligns with the mission theater.

### Expected admission
- Admit.
- `linkage_tier = chokepoint`

### Expected ranking
- Rank above non-theater chokepoint matches.
- Usually rank below strong state-actor or cable-infra matches unless severity modifiers are extreme.

### Analyst expectation
- Analysts should see it as a theater-relevant supply or access risk, not a generic maritime headline.

## Scenario 5

### Name
External ambient geopolitical noise

### Mission
Any mission where unrelated global conflict is present elsewhere.

### Event shape
- Event occurs outside the AOT.
- No mission-country match.
- No cable-country match.
- No relevant chokepoint linkage.

### Expected admission
- Exclude.

### Expected ranking
- No score because it should not enter the admitted set.

### Analyst expectation
- This is the core guardrail scenario. The system must not let ambient global conflict bleed into local mission narrative just because it is concurrent.

## Scenario 6

### Name
Direct mission-country actor versus first-order neighbor actor

### Mission
Mission in a state with active bordering adversaries or spillover risk.

### Event shape
- Both events are out-of-AOT and conflict-coded.
- One event matches the mission country directly.
- One event matches only a first-order neighbor.

### Expected admission
- Admit both.
- Both use `linkage_tier = state_actor`.

### Expected ranking
- Direct mission-country event must score above first-order neighbor event.

### Analyst expectation
- Analysts should still see both as relevant, but not as equally important.

## Scenario 7

### Name
Second-order neighbor candidate

### Mission
Mission in a state where first-order neighbors are already admitted, but a second-order actor may provide additional context only in selected theaters.

### Event shape
- Event occurs outside the AOT.
- Actor country does not match the mission country or a first-order neighbor.
- Actor country does match a second-order neighbor reached through the country graph.
- Conflict-coded event.

### Expected admission
- Exclude in the live model.
- Mark as an experimental recall candidate only.

### Expected ranking
- No live score because it should remain outside the admitted set until scenario review proves the wider radius is worth the blast radius.

### Analyst expectation
- Analysts should not see this in current mission output unless the team explicitly enables deeper neighbor review for the scenario set.

## Scenario 8

### Name
Alliance or basing support node candidate

### Mission
Mission depends on allied support, staging, or basing relationships that are real but geographically external to the AOT.

### Event shape
- Event occurs outside the AOT.
- Actor country does not match the live mission-country or cable-country rules.
- Actor country does match an explicit, versioned alliance or basing reference set.
- Conflict-coded event.

### Expected admission
- Exclude in the live model.
- Track as an experimental candidate only when the reference data is explicit and auditable.

### Expected ranking
- No live score because the event should remain outside the admitted set until the support graph is formally adopted.

### Analyst expectation
- Analysts should not receive this as live mission evidence until the support-country reference set is reviewed and promoted beyond experiment status.

## Review Rules

1. Do not use this corpus to justify a hidden score threshold replacing deterministic admission.
2. Any future second-order-neighbor rollout must add at least one scenario showing why the broader radius improves precision enough to justify the risk.
3. Any alliance or basing rule must add a scenario that uses explicit reference data, not heuristic assumptions.

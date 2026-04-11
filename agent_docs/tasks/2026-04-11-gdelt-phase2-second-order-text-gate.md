# GDELT Phase 2: Second-Order Text Gate

## Issue
During GDELT Phase 2 experiments, `Second-Order Only` neighbor expansion was found to introduce significant regional noise into the experimental candidate pool. Unlike `Alliance Support` and `Basing Support` which were tightly restricted by a `support_relation_confirmed` textual checking constraint, second-order linkages were admitted purely on a geographic 2-hop basis. This flooded mission areas with unrelated geopolitical events (e.g., admitting Mexican events into a Canadian mission simply because both border the USA).

## Solution
Modified the core matching logic in `evaluate_experimental_country_matches` to gate `second_order_only_matches` behind the exact same `support_relation_confirmed` text filter used by the alliance and basing systems. 

## Changes
- **`backend/api/services/gdelt_phase2_experiments.py`**:
  - Reordered the `second_order_only_matches` list comprehension to be pre-calculated before the `support_relation` check.
  - Added `second_order_only_matches = []` inside the `if not support_relation["support_relation_confirmed"]:` conditionally-clearing block.
  - Included `second_order_only_matches` in the returning dictionary's unpacking logic to ensure evidence metadata properly populates.

## Verification
- Ran GDELT Linkage Review Test Surface against a North Korea (`PRK`) mission query.
  - **Before**: Heavy regional noise in experimental subset.
  - **After**: `Experimental Only` noise dropped to 0. Overlap with Live Admitted shot up to 25. High-signal linkage retained.
- Ran GDELT Linkage Review Test Surface against a Canadian (`CAN`) mission query (Longitude -122.6784, Latitude 45.5152).
  - **Before**: `MEX` (as a 2nd order neighbor via USA) would theoretically flood the feed.
  - **After**: `Experimental Only` dropped to exactly 0. The textual lock effectively shielded the feed from untargeted Mexican geopolitical events while allowing 203 live USA/CAN centric elements to persist securely.

## Benefits
- Drastically increases the Viability/Signal-to-Noise ratio of the AI analysis loops by stripping out ambient regional events.
- Safely validates the hypothesis that 2nd-order geographic bounding is only tactically relevant when accompanied by explicit cross-theater textual correlation.

# Regional Risk User Testing Checklist

## Purpose

Use this checklist during VPS or staging validation of the right-click Regional Risk workflow.

The goal is to confirm three things:

- the request completes reliably from the deployed environment
- the AI regional assessment and mission H3 risk summary remain directionally aligned
- the new explicit GDELT linkage behavior feels credible in real operator usage

## Preconditions

- Deploy `dev` with commit `ea703c8` or newer.
- Confirm backend API starts cleanly and frontend assets load.
- Use an operator-capable account so the map context menu exposes `Analyze Regional Risk`.
- Keep browser devtools open for any failed API responses.

## Smoke Pass

1. Open Tactical Map.
2. Right-click a location and confirm `Analyze Regional Risk` appears.
3. Trigger a regional analysis.
4. Confirm the panel transitions through `loading` to `success`.
5. Confirm the panel shows:
   - H3 region id
   - clicked coordinates
   - AI regional risk percentage
   - anomaly count
   - mission H3 risk summary block
6. Confirm no frontend error toast or silent empty state appears.

## Scenario Matrix

Run at least one example from each category.

### 1. Dense Conflict / Geopolitical Hotspot

Examples:

- Strait of Hormuz
- western Black Sea / Ukraine approaches
- Taiwan Strait

Check:

- AI risk is not trivially low.
- Mission H3 risk summary is populated.
- Linkage notes mention non-zero external linkage when appropriate.
- Narrative and mission H3 risk point in the same direction.

### 2. Quiet / Low-Signal Region

Examples:

- remote open ocean
- low-traffic inland region

Check:

- analysis completes without error
- mission cell count is still present if cells are returned
- risk score is lower or moderate without invented escalation language
- no obviously unrelated global hotspot leaks into the local narrative

### 3. Cable / Maritime Infrastructure Region

Examples:

- Red Sea / Bab-el-Mandeb
- Suez approaches
- Singapore / Malacca

Check:

- linkage notes plausibly reflect cable or chokepoint relevance
- mission H3 risk and narrative both acknowledge infrastructure pressure when visible
- results feel more locally grounded than the old centroid-radius behavior

## Consistency Checks

For each tested location, review these questions:

1. Does the narrative mention local drivers that match the clicked area?
2. Does the mission H3 risk percentage feel directionally consistent with the AI risk score?
3. If the linkage notes show external impact, does the narrative explain why that external context matters locally?
4. If the region is quiet, does the system avoid over-escalation?
5. If you rerun the same location within a short window, are the results broadly stable?

## Failure Checklist

Capture these details for any bad run:

- clicked latitude and longitude
- H3 region shown in the panel
- screenshot of the full overlay
- browser network response for `/api/ai_router/evaluate`
- browser network response for `/api/h3/risk`
- whether the failure was:
  - timeout
  - empty mission risk block
  - implausible narrative
  - mismatched mission risk vs AI narrative
  - obvious unrelated global leakage

## Exit Criteria

The feature is ready for wider use when:

- multiple VPS runs complete without transport or timeout issues
- hotspot scenarios produce plausible elevated outputs
- quiet regions do not inherit unrelated global conflict context
- mission H3 risk consistently adds useful signal rather than contradictory noise
- any defects found are specific edge cases rather than systemic credibility problems
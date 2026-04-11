# Mission Stats Namespace Decision Memo (2026-04-11)

## Decision

Choose how mission-scoped statistics should coexist with the current global stats dashboard.

Current behavior is:
- The admin stats dashboard in [frontend/src/components/views/StatsDashboardView.tsx](c:/Projects/Sovereign_Watch/frontend/src/components/views/StatsDashboardView.tsx) calls only global endpoints such as `/api/stats/fusion` and `/api/stats/clausalizer`.
- The backend stats routes in [backend/api/routers/stats.py](c:/Projects/Sovereign_Watch/backend/api/routers/stats.py) aggregate across the whole deployment.
- The fusion audit storage numbers shown in [frontend/src/components/stats/FusionAuditTab.tsx](c:/Projects/Sovereign_Watch/frontend/src/components/stats/FusionAuditTab.tsx) are global database and ingest metrics, not mission-specific numbers.

The question is whether mission stats should live in a separate namespace or be layered onto the current global routes.

## Current System Impact

This decision affects the analyst system in two different user modes:
- Admin and platform operators use the stats dashboard as system observability. For them, global truth is the point.
- Mission analysts increasingly expect the rest of the product to be mission-scoped. If they are shown stats in a mission workflow, global storage and throughput numbers can feel inconsistent or misleading.

So this is partly a technical decision and partly a product-boundary decision: are stats an operator observability surface, an analyst mission surface, or both?

## Option A

Create a separate mission-stats namespace.

Examples:
- `/api/mission-stats/fusion`
- `/api/mission-stats/clausalizer`
- `/api/mission-stats/activity`

Mission inputs would mirror the mission-mode contract already used elsewhere: H3 or lat/lon/radius.

### Pros
- Cleanest separation of intent. Global stats remain observability; mission stats become analyst-facing mission telemetry.
- Lowest risk of accidentally corrupting or overloading the existing global dashboard semantics.
- Easier to explain in UI and docs because the routes and data models have distinct meanings.
- Lets you design mission metrics specifically for analysts instead of forcing them into admin-shaped responses.

### Cons
- More API surface area to maintain.
- Some logic will duplicate or need shared abstraction under two route families.
- Frontend will need a second dashboard or a mission-stats panel rather than a small patch to the current one.
- Can drift if global and mission metrics are implemented differently over time.

### Effect On Analyst System
- Strong positive effect on clarity. Analysts would get explicitly mission-scoped metrics instead of inferred subsets of system metrics.
- Minimal disruption to current admin users because the existing stats dashboard can stay unchanged.
- Best fit if mission stats are expected to appear inside tactical or analyst workflows rather than the admin stats route.

### Best Use Case
- If you want mission stats to become a first-class analyst product surface and not just a filter on admin telemetry.

## Option B

Extend the existing stats endpoints with optional mission filters.

Examples:
- `/api/stats/fusion?h3_region=...`
- `/api/stats/clausalizer?lat=...&lon=...&radius_nm=...`

### Pros
- Smaller API surface.
- Reuses current route structure and many existing response types.
- Faster to prototype.
- Frontend can add mission mode incrementally inside the existing dashboard.

### Cons
- Semantics become mixed. The same endpoint now means either system-wide observability or mission-scoped analyst telemetry depending on query params.
- Easier to confuse users and future maintainers.
- Some current metrics do not make clean mission-scoped sense. For example, global dedup efficiency or total tracks table footprint are fundamentally platform metrics, not mission metrics.
- Risks accidental apples-to-oranges comparison in the same UI tab.

### Effect On Analyst System
- Analysts could get mission-filtered numbers quickly, but the dashboard would blur operator and analyst use cases.
- Current widgets like Fusion Audit would need careful redesign or labeling so analysts do not mistake mission-relative numbers for system-health numbers.
- This is the most likely option to create user confusion unless the UI is very explicit.

### Best Use Case
- If the goal is short-term delivery and the team is comfortable with mixed semantics in the stats area.

## Option C

Hybrid model: keep global stats endpoints untouched, and add a thin mission-stats layer only for metrics that are truly mission-meaningful.

Examples:
- Keep `/api/stats/fusion` global.
- Add mission endpoints only for analyst-relevant subsets such as mission clausal activity, mission track counts, mission-local source density, or mission risk-supporting storage estimates.

### Pros
- Best semantic discipline. Global stays global; mission-specific views exist only where the metric genuinely supports mission analysis.
- Avoids inventing fake mission versions of platform-health metrics.
- Lower implementation burden than a full duplicate namespace.
- Gives the frontend a clean split: system dashboard remains admin-only, while mission widgets appear in tactical or analyst surfaces.

### Cons
- Requires product discipline to decide which metrics deserve mission variants.
- Less uniform than a full mirrored namespace.
- Some stakeholders may want a one-to-one mission equivalent for every global metric and not get it.

### Effect On Analyst System
- Strongest fit for the current product shape.
- Analysts would get mission-relevant metrics where they matter, likely near the tactical map or analyst panel rather than buried in admin stats.
- Admin users keep a stable system dashboard with no semantic drift.

### Best Use Case
- If the product intends to keep `/stats` as an operator dashboard while still giving analysts mission-scoped operational context.

## Recommendation

Recommend Option C.

Reasoning:
- The current stats dashboard is clearly a system-operations surface, not an analyst mission surface.
- Several current metrics are inherently global: dedup efficiency, total table footprint, backup status, poller health, and full-pipeline throughput.
- Trying to force mission scoping into those metrics will create dashboards that look precise but answer the wrong question.
- A hybrid approach lets you add mission-scoped metrics where they are analytically valid without eroding the meaning of the existing operator dashboard.

## What Should Be Mission-Scoped

These are good candidates for mission-scoped analytics:
- Clausal-chain volume and latest entries within the active mission area.
- Track counts and source breakdown within the mission area.
- Mission-relevant outage pressure, SatNOGS activity, or GDELT linkage counts.
- Mission-relative storage estimate for retained mission observations, if clearly labeled as an estimate rather than total DB usage.

## What Should Stay Global

These are better left as platform metrics:
- Total database footprint.
- Ingest velocity across the whole deployment.
- Dedup efficiency.
- Backup status.
- Poller health.
- End-to-end system latency.

## Suggested Product Shape

1. Keep `/stats` global and admin-oriented.
2. Add mission analytics as a separate analyst-facing surface, likely not as a new tab inside the existing admin dashboard.
3. If a route family is needed, prefer a narrow namespace such as `/api/mission-stats/*` for analyst metrics only.
4. Avoid building mission-scoped versions of every global metric just for symmetry.

## Analyst-System Consequences By Choice

- Option A: Analysts gain a clean mission telemetry surface, but the platform takes on more route and UI surface area.
- Option B: Analysts get faster delivery, but the current stats dashboard becomes semantically muddy and easier to misread.
- Option C: Analysts get the mission metrics they actually need, while operators keep a trustworthy global observability dashboard.

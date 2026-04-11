# Clausal Outage Topology Scope (2026-04-11)

## Issue

The clausal-chain enrichment endpoint still treated outage context as a time-window plus geometry join. That meant outages were either pulled only by raw AOT geometry or, in earlier audit language, effectively attached by time window without expressing cable relevance. This was weaker than the sea-domain logic, which already limited outage relevance to cable-connected landing countries tied to the mission area.

## Solution

Reused the existing mission-area cable-topology model for clausal enrichment. When the request is in H3 or radius mission mode, the endpoint now derives cable-relevant countries from the persisted cable-country index and cable geometries, maps those countries back to outage country codes from the cached outage feed, and then queries outage rows by that relevant country set. If topology data is unavailable, the endpoint falls back to the previous spatial filter.

## Changes

- `backend/api/routers/ai_router.py`
  - Imported `build_aot_context()` to compute a consistent mission center for H3 and radius requests.
  - Added `_derive_relevant_outage_country_codes()` to map cable-relevant countries to outage country codes.
  - Updated `get_clausal_chains()` to prefer cable-topology outage scoping in mission mode, with spatial fallback when topology data is unavailable.
  - Updated `context_scope.outages` so topology-linked outage context is labeled as `impact_linked_external` with linkage reason `cable_topology`.
- `backend/api/tests/test_ai_router_clausal.py`
  - Added H3 regression proving the clausal outage query filters by topology-derived country codes.
  - Added radius regression proving the same topology rule works for mission-radius requests.
- `agent_docs/ai_research/4-11-26-gaps.md`
  - Removed the closed outage-topology backlog item and refreshed the next-actions list.

## Verification

- `cd backend/api && uv tool run ruff check .`
  - Passed
- `cd backend/api && uv run python -m pytest`
  - Passed, `109 passed`

## Benefits

- Clausal outage enrichment now follows the same mission-relevance policy already used in the sea domain instead of relying on coarse locality alone.
- Cable-connected outages outside the exact AOT can still be included when they have a defensible topology link, while unrelated global outages are excluded.
- H3 and radius mission modes now behave consistently for outage enrichment, which reduces divergence between live-map and mission-scoped consumers.

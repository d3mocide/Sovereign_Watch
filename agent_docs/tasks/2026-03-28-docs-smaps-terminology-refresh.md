# 2026-03-28 - Docs SMAPS Terminology Refresh

## Issue
After runtime migration to SMAPS naming, several active roadmap and research documents still referenced ASAM-era terms, endpoints, and table names.

## Solution
Applied a documentation terminology cleanup across active `agent_docs` planning/reference files to align wording and examples with the current SMAPS naming used in backend/frontend runtime paths.

## Changes
Updated the following files:
- `agent_docs/IMPLEMENTATION_ROADMAP.md`
- `agent_docs/GEOSPATIAL_SUMMARY.md`
- `agent_docs/infrastructure-layer-consolidation.md`
- `agent_docs/README.md`
- `agent_docs/poller-consolidation-strategy.md`
- `agent_docs/UNIFIED_ROADMAP.md`
- `agent_docs/research-geospatial-data-layers-implementation.md`

Key terminology updates include:
- `ASAM` -> `SMAPS` (prose and technical references)
- `/api/asam/incidents` -> `/api/smaps/incidents`
- `asam_incidents` -> `smaps_incidents`
- legacy helper/loop/source examples renamed to SMAPS equivalents where referenced

Historical task logs under `agent_docs/tasks/` were intentionally left unchanged to preserve audit/history context.

## Verification
- Ran targeted documentation search:
  - `grep_search` over `agent_docs/*.md` for `ASAM|asam`
- Result:
  - No ASAM references remain in active top-level `agent_docs/*.md` documentation.
  - Remaining ASAM references are confined to historical records in `agent_docs/tasks/`.

## Benefits
- Aligns active engineering docs with current SMAPS implementation.
- Reduces confusion between historical ASAM terminology and current runtime naming.
- Keeps historical task/audit trail intact.

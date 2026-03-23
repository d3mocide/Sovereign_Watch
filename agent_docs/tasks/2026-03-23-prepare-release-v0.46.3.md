# Task: Prepare Release v0.46.3 Notes (Sidebar Modularization + GDELT Fixes)

## Issue

Release artifacts needed to capture a combined frontend architecture refactor and GDELT correctness fixes:

- SidebarRight decomposition from monolith to per-domain views.
- Missing `actor1` propagation in GDELT API/frontend mapping.
- Tooltip metric mismatch where `TONE (GS)`/`STATUS` used AvgTone instead of Goldstein Scale.

## Solution

Prepared a patch release entry (`v0.46.3`) in both `RELEASE_NOTES.md` and `CHANGELOG.md` that consolidates:

1. Sidebar modularization details and new shared sidebar contracts.
2. Backend/API and frontend GDELT `actor1` data-flow correction.
3. Tooltip Goldstein threshold alignment with map color semantics.

## Changes

| File | Change |
|------|--------|
| `RELEASE_NOTES.md` | Replaced prior release body with `v0.46.3` summary, key features, technical details, and updated targeted verification/upgrade commands |
| `CHANGELOG.md` | Added new `[0.46.3] - 2026-03-23` section with Added/Changed/Fixed entries for sidebar and GDELT fixes |

## Verification

- `get_errors` on modified documentation files:
  - `RELEASE_NOTES.md` — no errors.
  - `CHANGELOG.md` — no errors.
- Documentation-only task: skipped code lint/test suites per targeted verification rule.

## Benefits

- Produces a release-ready narrative that matches shipped code changes.
- Preserves historical traceability of architecture and data-quality fixes.
- Clarifies operational upgrade and verification steps for deployers.

# V1 Readiness Validation & ROADMAP Update

## Issue

ROADMAP.md was stale — still referenced v0.58.0 and listed all four P0 blockers as pending. The actual code had completed all of them without the roadmap being updated.

## Solution

Audited all four P0 blockers against live code and confirmed completion. Updated ROADMAP.md to reflect current state and mark v1.0.0 as ready to tag.

## Changes

**`ROADMAP.md`**
- Updated current status from v0.58.0 → v0.66.0
- Marked all P0 blockers as ✅ Done with specific evidence from code
- Added "Last Updated" note confirming v1.0.0 readiness

## Verification

Each P0 blocker confirmed against source:

| Blocker | Evidence |
|---------|----------|
| **DevOps-01** | `.github/workflows/ci.yml` — full pipeline: path-change detection + Frontend (Lint+Typecheck+Test+Build) + API + 7 pollers + JS8Call, all with Lint+Test |
| **Fix-02** | `App.tsx:906–933` — `<TimeControls>` rendered when `replayMode` active; `onClose` calls `setReplayMode(false)` + `setIsPlaying(false)` |
| **Fix-03** | `OrbitalLayer.tsx:191–224` — footprint `ScatterplotLayer` with `2 * R_EARTH * acos(R/(R+alt))` math. `buildInfraLayers.ts` — `onHover: setHoveredInfra` on 5 layer types; `TacticalMap.tsx:228` synthesizes `CoTEntity` → `<MapTooltip>` |
| **Fix-04** | Only 2 `eslint-disable` comments in entire `frontend/src/` (`main.tsx`, `useAuth.tsx`) — both intentional |

## Benefits

- ROADMAP accurately reflects project state
- Clear signal that v1.0.0 is ready to tag
- Versioning context clarified: `0.66.0` is pre-1.0 by SemVer convention (major=0 means "initial development"), not "66 releases past v1". The next step is simply tagging `v1.0.0`.

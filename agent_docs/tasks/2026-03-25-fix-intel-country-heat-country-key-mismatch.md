# 2026-03-25 - Fix Intel Country Heat Country-Key Mismatch

## Issue
Intel country heat shading could fail entirely because `buildCountryHeatLayer.ts` expected Natural Earth keys (`NAME`, `ISO_A2`, `ADM0_A3`) while `frontend/public/world-countries.json` uses different keys (`name`, `ISO3166-1-Alpha-2`, `ISO3166-1-Alpha-3`).

## Solution
Hardened country matching to support both key schemas and improved actor alias/code matching so actor country codes (for example `US`) correctly resolve to matching country polygons.

## Changes
- Updated `frontend/src/layers/buildCountryHeatLayer.ts`:
  - Added resilient property lookup helper for multiple key variants.
  - Added support for `name` + `ISO3166-1-Alpha-*` properties from `world-countries.json`.
  - Fixed alias/code matching to map actor code/aliases to feature `iso2` and country names.
- Updated `Documentation/INTEL_Globe_Mode.md`:
  - Clarified country heat description to reflect threat-level tinting derived from actor1-country average Goldstein.

## Verification
- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run test`

## Benefits
- Restores reliable country heat rendering for Intel globe.
- Prevents silent data-to-geometry mismatches when GeoJSON schemas vary.
- Keeps documentation aligned with the implemented threat-level behavior.

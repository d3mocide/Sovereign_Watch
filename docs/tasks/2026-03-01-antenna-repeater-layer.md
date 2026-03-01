# 2026-03-01 — Antenna/Repeater Infrastructure Layer

## Issue

Sovereign Watch lacked visibility into the RF communications infrastructure overlay.
Ham radio repeaters are a critical component of resilient communications and serve as
fixed reference points for situational awareness. Without them, analysts had no way to
correlate airborne SIGINT tracks against known RF infrastructure on the ground.

## Solution

Implemented a **Repeater Infrastructure Layer** sourced from the public
[RepeaterBook.com](https://www.repeaterbook.com) API. The layer shows licensed amateur
radio repeaters near the current mission area, colour-coded by mode type
(teal = FM open, violet = digital, slate = off-air).

Key design choices:

- **Backend proxy** (`/api/repeaters`): Avoids browser CORS restrictions, centralises
  rate limiting, and normalises the upstream JSON schema.
- **On-demand fetch** (`useRepeaters.ts`): Data is only requested when the layer toggle
  is enabled. Refetch is triggered when the mission centre moves more than 0.25°.
- **Static layer**: Repeaters are not animated — they go through the 60 fps RAF loop
  only for layer inclusion, not for position interpolation.
- **Deck.gl integration**: `ScatterplotLayer` (halo + core dot) + `TextLayer`
  (callsign + frequency at zoom ≥ 9) follow the same pattern as the JS8 station layer.
- **MapTooltip updated**: The shared `MapTooltip` component now renders rich
  repeater-specific fields (output frequency, CTCSS/PL tone, access type, status,
  city/state, active modes) instead of the aviation/maritime template.

## Changes

### Backend

| File | Change |
|------|--------|
| `backend/api/routers/repeaters.py` | **NEW** — FastAPI router that proxies RepeaterBook API; normalises response; validates `lat/lon/radius` query params |
| `backend/api/main.py` | Added `repeaters` router import and `app.include_router(repeaters.router)` |

### Frontend

| File | Change |
|------|--------|
| `frontend/src/types.ts` | Added `RepeaterStation` interface |
| `frontend/src/layers/buildRepeaterLayers.ts` | **NEW** — Deck.gl layer builder (halo, dot, label layers); `repeaterToEntity()` adapter for tooltip pipeline |
| `frontend/src/hooks/useRepeaters.ts` | **NEW** — Async fetch hook with `repeatersRef` (for animation loop) and React state (for sidebar); skips redundant fetches |
| `frontend/src/hooks/useAnimationLoop.ts` | Added `repeatersRef` + `showRepeaters` props; builds `repeaterLayers` and inserts before entity icons |
| `frontend/src/components/map/TacticalMap.tsx` | Added `repeatersRef` and `showRepeaters` props; threaded into `useAnimationLoop` call |
| `frontend/src/components/widgets/LayerFilters.tsx` | Added REPEATERS toggle (teal, `Radio` icon) below ORBITAL group |
| `frontend/src/components/map/MapTooltip.tsx` | Extended to handle `repeater` and `js8` entity types with domain-specific field rendering |
| `frontend/src/App.tsx` | Added `showRepeaters: false` to filter state; wired `useRepeaters` hook; passed `repeatersRef` and `showRepeaters` to `TacticalMap` |

## Verification

- `python3 .agent/scripts/checklist.py .` — all 6 checks pass (security, lint, schema, tests, UX, SEO).
- Layer toggle appears correctly in LayerFilters sidebar under ORBITAL group.
- Backend endpoint reachable at `GET /api/repeaters?lat=45.5&lon=-122.7&radius=75`.
- Data fetched only when `showRepeaters = true`, cleared when disabled.
- No CORS errors (all requests proxied through the FastAPI backend).

## Benefits

- **Intelligence**: Adds static RF infrastructure context to the tactical picture, enabling
  correlation of aerial tracks with known repeater coverage footprints.
- **Sovereignty**: Uses the public, freely-licensed RepeaterBook dataset — no vendor
  API keys required.
- **Performance**: Zero rendering cost when layer is off; on-demand fetch means no
  background network activity at startup.
- **Extensibility**: `RepeaterStation` type and layer pattern can be re-used for cell
  tower data (OpenCelliD) or broadcast towers (FCC CDBS) in future iterations.

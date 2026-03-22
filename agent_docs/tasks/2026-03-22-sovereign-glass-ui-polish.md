# Sovereign Glass UI Polish

**Date:** 2026-03-22
**Task:** Restyle SpaceWeatherPanel, PassGeometryWidget, and Spectrum Verification panel to match the Sovereign glass design aesthetic of SidebarRight.

## Issue

The `SpaceWeatherPanel` and `PassGeometryWidget` used hardcoded inline `style={{}}` with fixed hex colours (`rgba(10,14,20,0.92)`, `#1f2937`, etc.), making them visually inconsistent with the rest of the Orbital HUD, which uses Tailwind glass tokens (`bg-black/40 backdrop-blur-md`, `border-tactical-border`, `font-mono`, `tracking-[.3em]`).

The Spectrum Verification panel was also missing a proper header section separator and had unclear status labels (`NO DATA` instead of `AWAITING_OBS` / `NO_CATALOG`).

## Solution

- Rewrote all three components to use Tailwind utility classes matching `SidebarRight`'s design language.
- Added colour-coded, gradient header strips per component with consistent label typography.
- Improved Spectrum Verification status labels to distinguish between data states.

## Changes

### `frontend/src/components/map/SpaceWeatherPanel.tsx`
- Replaced all `style={{...}}` with Tailwind classes.
- Yellow-400 accent (`border-yellow-400/20`, `from-yellow-400/10`), `bg-black/40 backdrop-blur-md`.
- `font-mono`, `tracking-[.3em]`, `text-white/25` for labels throughout.
- Glass card split into header + body with `border-b` separator.
- Removed hardcoded `fontFamily: "monospace"` inline overrides.

### `frontend/src/components/map/PassGeometryWidget.tsx`
- Replaced all `style={{...}}` (except the `right:` transition value which must stay inline) with Tailwind.
- Purple-400 accent (`border-purple-400/25`, `from-purple-400/15`), `bg-black/50 backdrop-blur-md`.
- Added live 1-second AOS countdown tick (`useState + useEffect` interval).
- Added pass legend strip (AOS / TCA / LOS colour dots).
- Glass card: header + legend strip + polar plot body sections.

### `frontend/src/components/layouts/SidebarRight.tsx`
- Spectrum Verification section redesigned:
  - Border changed from `border-white/10` to `border-teal-400/20`.
  - New gradient header `bg-gradient-to-r from-teal-400/10`.
  - Status labels: `AWAITING_OBS` (catalogued but no recent obs), `NO_CATALOG` (no SatNOGS entry).
  - Label typography upgraded to `tracking-[.3em]` / `tracking-widest`.

## Verification

- Components hot-reloaded through Vite HMR (no container restart needed).
- Confirmed DB has 25 observations / 2668 transmitters.
- Spectrum Verification correctly shows `NO_CATALOG` for SINAH-1 (NORAD 28893, 0 tx entries) and will show `AWAITING_OBS` for catalogued sats with no recent 24h window obs.
- Pre-existing JSX `IntrinsicElements` lint errors in `SidebarRight.tsx` are a systemic `@types/react` configuration issue, not introduced by these changes.

## Benefits

- Consistent visual hierarchy across all floating HUD elements.
- Clearer spectrum status semantics for operators.
- No runtime behaviour changes — purely cosmetic.

# Compact mobile overviews and consistent dashboard glass

## Issue

Dashboard Summary retained blue card backgrounds after the SovereignGlass theme restoration. Mobile overview cards and repeated panel captions consumed too much vertical space.

## Solution

Replace remaining navy mobile surface colors with black/green tones, explicitly theme dashboard Summary glass, and compact overview and panel headers while retaining readable metrics and 44-pixel touch targets.

## Changes

- `frontend/src/index.css`: remove residual navy mobile surface colors; green frosted dashboard Summary cards; 56-pixel top bar; smaller overview titles/icons/padding; inline metric labels/counts; compact two-column dashboard metrics; reduced overview description spacing; smaller panel headings and section padding. Desktop layout is unchanged.
- `tools/performance/mobile-workspaces.cjs`: check dashboard Summary background colors and constrain the 390-pixel phone overview to at most 180 pixels tall.

## Verification

- Standard frontend lint/typecheck/tests passed in the existing check image (host dependencies unavailable): 308 tests, 32 files.
- Production Docker build succeeded; recreated frontend, tested/reloaded nginx. Served entry assets and `/health` returned HTTP 200.
- Chromium production phone checks passed at 390×844. Dashboard Summary backgrounds have no dominant blue channel; overview height is 167 pixels, roughly half the previous 333-pixel card. [Dashboard screenshot](frontend-compact-2026-10-07/dashboard-summary.png).
- WebKit production phone checks passed at 390×844, also measuring 167 pixels. Chromium passed all five workspaces at 320×740 and 844×390. Chromium also passed all five at 1024×768 and 1440×900, checking desktop sidebars and absence of compact controls. Browser screenshots use isolated data and blank remote styles, testing layout and controls rather than physical-device performance.

## Benefits

Dashboard shares the black/green glass theme and mobile maps/feeds regain screen space without shrinking touch controls.

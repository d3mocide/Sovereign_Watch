# Immediate mobile details and dedicated Tools workspace

## Issue

Selecting an object on mobile only adds a Details launcher to the map dock. Opening it requires a second tap, and its narrow drawer retains desktop dimensions. Tools similarly presents desktop actions and popovers rather than a coherent mobile workspace.

## Solution

Open a full-width details sheet immediately on explicit selection. Give Tools a dedicated full-width sheet with Layers, Display and System tabs, a persistent header, safe-area-aware bounds and one scrolling content area.

## Changes

- `frontend/src/hooks/useEntitySelection.ts`: explicit selection revision increments for entity and NORAD selection, including repeat selection. Live updates do not increment it.
- `frontend/src/App.tsx`: pass selection identity and revision to the HUD.
- `frontend/src/components/layouts/MainHud.tsx`: automatically open mobile Details on selection, focus its close button and dismiss it on deselection; expose dialog semantics and coordinate Tools/drawer state.
- `frontend/src/components/layouts/MobileTools.tsx`: dedicated mobile portal sheet, Layers/Display/System tabs, labeled display actions, embedded preferences/watchlist and system health; focus trapping/restoration, keyboard tabs and Escape dismissal.
- `frontend/src/components/layouts/TopBar.tsx`: desktop toolbar remains desktop-only; mobile Tools uses the new component rather than expanding that toolbar.
- `frontend/src/components/widgets/SystemSettingsWidget.tsx` and `SystemHealthWidget.tsx`: optional inline rendering for reuse inside the mobile System tab.
- `frontend/src/index.css`: full-width details and Tools, stable headers/tabs, scrolling content, touch controls, and hidden underlying dock/map controls during Tools.
- Tests verify mobile opening, dismissal across updates, repeat selection and desktop behavior. Browser checks exercise the chevron directly, all Tools tabs and full-width Details opening twice for the same pass selection.

## Verification

- Frontend lint and typecheck passed; 316 tests across 35 files passed with host-mounted source in the existing frontend check image (host dependencies unavailable).
- Docker Compose production frontend build passed; frontend recreated and ingress nginx configuration tested/reloaded.
- Production phone Chromium and WebKit checks passed at 390×844 with simulated iPhone safe areas. Checks directly expand/collapse the chevron, visit all Tools tabs, and select the same satellite pass twice; Details opens automatically at full width and clears bottom navigation.
- Production Chromium checks also passed at 320×740, 844×390, 1024×768 and 1440×900. An initial tablet position measurement failed during the combined run; two isolated tablet follow-up runs passed without a source change. The desktop follow-up passed. The helper allows the opening animation to settle before measuring Details.
- Ingress health returned HTTP 200; `git diff --check` passed. Browser checks use API fixtures and blank map styles; they validate interactions/layout, not physical-device performance.

## Benefits

Object selection opens useful detail immediately. Tools offers labeled, grouped mobile controls without stacking desktop popovers over a cramped menu. Desktop presentation remains available at the wide-screen breakpoint.

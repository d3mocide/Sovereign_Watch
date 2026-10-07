# Dedicated mobile workspaces

## Issue

The mobile shell and safe areas worked, but Tactical, Orbital, Intel, Dashboard, and Radio still exposed desktop panel compositions. Long stacks of widgets made common tasks difficult to reach. Radio's heard-station sidebar was hidden on phones, and its listening console required three wide columns.

## Solution

Below the existing 1280px breakpoint, expose task-specific sections with touch navigation and bounded scrolling. Keep one mobile dashboard map mounted at a time. Reuse the existing data, widgets, streaming, and mapping engines.

## Changes

- `MainHud.tsx`, `App.tsx`: map workspaces have a bottom dock with Map, view-specific panel, selected Details/News, and Status. Compact context strips show domain counts. Status widgets move out of the mobile map into a panel; map controls and Intel ticker reserve space above the dock.
- `MobileSections.tsx`, `useCompactLayout.ts`: shared mobile section navigation, arrow/Home/End keyboard support, viewport subscription, and persistent widget state across section changes. Desktop section wrappers use `display: contents`.
- `SidebarLeft.tsx`: Mission/search, Feeds, Layers, and HF sections.
- `OrbitalSidebarLeft.tsx`: Satellites/search, Passes, and Doppler sections, including a prompt when no satellite is selected.
- `IntelSidebar.tsx`: Overview/time window, Threats, Countries, and SITREP sections.
- `DashboardView.tsx`: Summary, Maps, Intel, and Feeds sections; Mission/Global map selector; Passes/Outages/News feed selector. Inactive mobile maps unmount rather than continuing hidden rendering. Satellite names remain complete and wrap on mobile.
- `RadioTerminal.tsx`: Messages, Heard, Listen, and Receivers navigation; expandable Setup; compact transmit form; heard stations and GhostNet schedule become accessible on phones.
- `ListeningPost.tsx`, `KiwiNodeBrowser.tsx`: Waterfall/Tuning/Audio sections replace the wide listening console on mobile; receiver browser respects the safe viewport.
- `LayerFilters.tsx`: instance-scoped IDs prevent labels in one retained section from toggling controls in another.
- `index.css`: workspace-specific mobile layouts and scrolling, including short landscape screens.
- Unit tests cover section search-state persistence, keyboard navigation, orbital map/panel transitions, and independent checkbox labels.
- `tools/performance/mobile-workspaces.cjs`: isolated, populated browser checks for all five views; existing menu/profile tools updated for section navigation.

## Verification

- Frontend lint and typecheck passed. The new checkbox test initially included controls with no ID; its uniqueness assertion was corrected to inspect assigned IDs. The label-to-checkbox behavior passed after that correction. The final full suite passed all 306 tests in 31 files; the changed test also passed targeted lint and the final typecheck.
- Chromium checks passed at 390×844, 320×740, 844×390, and 1024×768, exercising all workspace sections, both dashboard maps, populated pass/news feeds, heard stations/GhostNet, and listening controls.
- WebKit 390×844 checks passed with simulated 59px top and 34px bottom safe insets.
- Browser fixtures isolate authentication, APIs, WebSockets, and map styles. No real transmit actions are performed. Known WebKit ResizeObserver loop notifications are excluded from fatal application exception checks. Physical device GPU performance is not measured by these layout tests.
- Browser screenshots and machine-readable results: `agent_docs/tasks/frontend-workspaces-2026-10-07/`.
- Chromium desktop 1440×900 checked all five views: desktop sidebars remained visible and mobile section navigation stayed hidden.
- Production Docker build passed; frontend recreated and nginx configuration validation/graceful reload passed. Proxy `/health`, entry assets, and lazy App bundle returned HTTP 200. A final Chromium 390×844 interaction run against the served production bundle passed across all five views. All 14 application services remained running.

## Benefits

Each domain has a mobile task flow, rather than a long desktop widget column. Common controls are reachable by touch; sections retain local input state; heard radio stations are accessible; and mobile dashboard rendering is bounded to the selected map.

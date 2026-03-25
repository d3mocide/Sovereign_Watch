# Release - v0.47.2 - Settings Modularity + Preset Expansion

This release focuses on operator workflow speed and maintainability in the tactical settings stack. The System Settings and Listening Post flows were decomposed into focused modules, and new quick presets were added to switch instantly between orbital-only and terrestrial map-layer views.

## High-Level Summary
The frontend now treats System Settings and JS8 Listening Post concerns as composable building blocks instead of monolithic components. At the same time, filter preset coverage was expanded so operators can move between space-only and map-only perspectives with one click while keeping clear/all behavior consistent.

## Key Features
- **New Presets**: Added **Orbital Only** and **Map Layers** presets in `frontend/src/components/widgets/FilterPresets.tsx`.
- **Settings Refactor**: Decomposed `SystemSettingsWidget` responsibilities by extracting watchlist/state concerns into `frontend/src/hooks/useWatchlist.ts` and `frontend/src/components/widgets/WatchlistManager.tsx`.
- **Listening Post Refactor**: Extracted KiwiSDR configuration constants into `frontend/src/components/js8call/kiwi/RadioModeConfig.ts` and `frontend/src/components/js8call/kiwi/WaterfallColorMaps.ts` and wired `ListeningPost.tsx` to consume them.
- **Search UX Accessibility**: Improved `frontend/src/components/widgets/SearchWidget.tsx` accessibility with stronger labeling and clear-action semantics.

## Technical Details
- **Filter Key Coverage**: Preset management now includes `showSatNOGS`, `showH3Coverage`, and `showTerminator` for consistent all/clear transitions.
- **Risk Reduction**: Splitting settings and listening-post concerns reduces coupling, improves testability, and lowers regression risk during future UI iteration.
- **No Protocol Changes**: No TAK schema or backend API contract changes are introduced in this release.

## Upgrade Instructions
1. Pull latest refs and checkout the release branch tip.
2. In `frontend/`, install dependencies if needed: `pnpm install`.
3. Run verification: `pnpm run lint && pnpm run test`.
4. Rebuild runtime image for parity checks: `docker compose build sovereign-frontend`.
5. Restart frontend service: `docker compose up -d --build sovereign-frontend`.

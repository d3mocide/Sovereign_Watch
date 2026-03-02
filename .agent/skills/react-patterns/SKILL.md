# Frontend Design & React - Sovereign Watch

> **CRITICAL:** Sovereign Watch is a mapping application built with **React (Vite)**, **Tailwind CSS**, and **Deck.gl (v9)**.

## Core Rules

1.  **Map Rendering**: The core component is `frontend/src/components/map/TacticalMap.tsx`. It uses a **Hybrid Architecture** (WebGL2). It dynamically imports **Mapbox GL JS** or **MapLibre GL JS** based on the environment, heavily overlaid with **Deck.gl v9**.
    *   **Anti-Pattern**: DO NOT downgrade to or use Leaflet.
2.  **Deck.gl Globe Mode**: In Deck.gl Globe mode, `IconLayer` and `TextLayer` components using `billboard: true` must have `wrapLongitude` set to `false` (e.g., `!globeMode`) to prevent rendering failures.
3.  **GeoJSON Data**: Frontend infrastructure mapping data (e.g., submarine cables) is managed via the `useInfraData` hook, which fetches GeoJSON assets asynchronously from the `/data/` directory.
4.  **Dependencies**: Frontend dependencies must be installed using `npm install --legacy-peer-deps` due to existing peer dependency conflicts (e.g., with eslint packages).
5.  **Replay Processing**: Replay data processing logic is centralized in `frontend/src/utils/replayUtils.ts`. Do not re-sort data on the client side; rely on the backend's time-sorted order (ASC).

## Testing
Run frontend tests using:
`npm run test` or `npx vitest run` from the `frontend/` directory.
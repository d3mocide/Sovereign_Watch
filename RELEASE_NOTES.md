# Release - v0.49.0 - Intel Globe Stabilization + Unified Map Controls

This release stabilizes Intel map rendering around a single MapLibre-based path, removes the experimental Cesium branch, and unifies the map control experience so Intel mirrors Tactical and Orbital. The result is more predictable operator workflows, cleaner runtime behavior, and improved visual readability for GDELT overlays.

## High-Level Summary

v0.49.0 focuses on Intel map reliability and cross-view consistency. During the prior iteration cycle, Intel rendering diverged across multiple code paths and controls. This release consolidates rendering to MapLibre, resolves globe API compatibility edge cases, improves arc/heat depth behavior, and aligns Intel's control layout with Tactical and Orbital to reduce operator mode-switch friction.

## Key Features

- **Unified Map Control UX**
  - Intel now uses the same bottom-center segmented control structure as Tactical and Orbital.
  - Projection/globe/style/zoom controls follow the same interaction language and visual hierarchy.

- **Intel 2D/3D Render Mode Support**
  - Persistent Intel render mode (`2D` / `3D`) with MapLibre projection switching.
  - Globe-mode-specific behavior is now consistent with shared map ergonomics.

- **Intel Arc Visual Improvements**
  - Enhanced globe arc rendering readability with segmented 3D styling and endpoint emphasis.
  - Better directional clarity in dense OSINT event paths.

- **MapLibre Globe Compatibility Hardening**
  - Guarded atmosphere/fog calls to support version differences (`setAtmosphere` / `setFog`).
  - Reduced runtime fragility across local environments.

## Technical Details

- **Renderer Path Consolidation**
  - Removed Intel's Cesium map component and related frontend gating.
  - Intel now runs on a single MapLibre-backed rendering pipeline.

- **Depth/Ordering Tuning**
  - Updated country heat depth bias behavior so overlays remain legible in globe mode.
  - Improved layer ordering behavior for Intel overlay stack.

- **Style Simplification**
  - Intel map styles narrowed to operational presets (`dark`, `debug`) to avoid unnecessary mode spread.

## Upgrade Instructions

1. Pull latest code:
   ```bash
   git pull origin main
   ```
2. Reinstall frontend deps if needed:
   ```bash
   cd frontend
   pnpm install
   ```
3. Verify frontend quality gates:
   ```bash
   pnpm run lint
   pnpm run test
   ```
4. Rebuild frontend container image:
   ```bash
   cd ..
   docker compose build sovereign-frontend
   ```
5. Restart services:
   ```bash
   docker compose up -d --build sovereign-frontend
   ```

## Breaking Changes

- **None expected for external APIs/protocols**.
- Internal Intel renderer path changed by removing Cesium integration and standardizing on MapLibre.

## Verification Summary

- Frontend lint: pass
- Frontend test suite: pass (36/36)
- Frontend compose build: required in release workflow (run as part of deployment validation)

## Included Change Records

Task records for this release are documented under `agent_docs/tasks/` with 2026-03-25 entries, including:

- Cesium gating and removal tasks
- MapLibre restoration and compatibility fixes
- Intel control parity and UI refinements

---

Release date: 2026-03-25

# Release - v0.50.0 - Tactical Command Dashboard

v0.50.0 introduces the **Tactical Command Dashboard**, a high-fidelity monitoring station for the Sovereign Watch ecosystem. This release transforms the static stats view into a dynamic, reactive, and highly accurate operational station.

## High-Level Summary

This release modernizes the dashboard into a "Tactical Command" interface. We have moved beyond basic metrics to provide real-time situational awareness via a **Tactical Alert System**, an interactive **Log Terminal**, and high-precision **Telemetry Analytics**. By using native flexbox layouts and server-side aggregation filters, we have ensured a pixel-perfect, zero-drift experience optimized for mission-critical monitoring.

## Key Features

### 1. Tactical Alert System
- **Warning-Reactive Badge**: The header navigation now features a dynamic notification badge that increments in real-time whenever a `[WARN]` log entry is detected in the system bus.
- **Header Shortlink Interaction**: 
    - **Bell Icon**: View and clear active system alerts.
    - **Terminal Icon**: Absolute toggle shortcut for the bottom log bar.

### 2. Collapsible Log Terminal
- **Dynamic Logic**: Fully interactive log bar with state-driven height transitions.
- **Smart Startup**: Loads in a collapsed state by default to maximize data visibility while maintaining background alerting.
- **Auto-Scroll & Follow**: Intelligent scrolling behavior that maintains focus on recent commands unless manually overridden.

### 3. High-Density Container Health
- **Tactical Ribbons & Pips**: Redesigned poller list with status-weighted ribbons and 12-pip uptime indicators.
- **Node Synchronization**: Fully synchronized with user-defined node identities (`NODE-01`).

### 4. Telemetry Precision (No-More-Cliff)
- **Time-Bucket Filtering**: Server-side logic now excludes the current, incomplete 15-minute bucket, ensuring charts no longer "crash" at the right edge.
- **ECharts Refinement**: Removed cumulative data stacking to ensure domain-specific counts are accurate and non-summed.

## Technical Details

- **Layout Engine**: Migrated from `fixed` positioning with manual offsets to a native **Flexbox `flex-col`** flow, eliminating 'ghost footer' anomalies and improving responsiveness.
- **Telemetry Aggregation**: Uses TimescaleDB `time_bucket` on a 24-hour moving window via the new `/api/stats` router.
- **Routing**: Implemented React `Suspense` and `lazy` loading for the `/stats` route, ensuring zero overhead for non-dashboard users.

## Upgrade Instructions

### 1. Update & Build
```bash
git pull origin dev
docker compose up -d --build sovereign-frontend sovereign-backend
```

### 2. Verification
Run the verification suite on the host for rapid feedback:
```bash
cd frontend && pnpm run lint && pnpm run test
cd backend/api && pytest
```

---

**Release Date**: 2026-03-26  
**Stability**: Stable (Dashboard V1)  
**Lead Contributor**: Sovereign Watch Team  

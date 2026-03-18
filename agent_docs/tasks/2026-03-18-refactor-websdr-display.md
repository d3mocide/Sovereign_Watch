# 2026-03-18 Refactor WebSDR Display

## Issue
The WebSDR receiver was originally integrated into the `KiwiNodeBrowser` widget, which created a muddy user experience where two different SDR networks (KiwiSDR and WebSDR) shared the same selection states and tools.

## Solution
Architectural separation of discovery tools:
1. Specialized the `KiwiNodeBrowser` to handle only KiwiSDR nodes.
2. Created a new `WebSDRDiscovery` component dedicated to WebSDR nodes with a map-first UI.
3. Integrated `WebSDRDiscovery` as the primary discovery page for the `WEBSDR` mode in the Radio Terminal.

## Changes
- **frontend/src/components/js8call/WebSDRDiscovery.tsx (NEW)**:
    - Dedicated component for WebSDR discovery.
    - Defaults to **Map View**.
    - **Global Visibility**: Removed radius and coverage filters; shows all available WebSDR nodes by default.
    - **Full-Screen Integration**: Selecting a node now switches the terminal to a dedicated full-page receiver view, removing the redundant floating widget clutter.
    - Tailored UI with violet-themed markers and status info bar.
- **frontend/src/components/js8call/KiwiNodeBrowser.tsx**:
    - Simplified to handle ONLY KiwiSDR nodes.
    - Removed WebSDR source switching, markers, and specialized row rendering.
    - Re-focused on its role as a floating widget for the JS8Call terminal.
- **frontend/src/components/js8call/RadioTerminal.tsx**:
    - Updated to import and use `WebSDRDiscovery` for the `WEBSDR` operating mode.
    - **Renamed** the "Listen" mode to "**KiwiSDR**" for naming consistency with WebSDR.
    - Cleaned up props for the floating `KiwiNodeBrowser` widget.

## Verification
- Verified the `WEBSDR` mode in Radio Terminal opens the map-first WebSDR discovery area.
- Verified the "Browse SDR Nodes" popup still correctly lists and connects to KiwiSDR nodes.
- Confirmed that KiwiSDR and WebSDR discovery are now fully isolated from each other.

## Benefits
- Cleaner user experience with dedicated tools for different tasks.
- Improved component maintainability through specialized focus.
- Faster UI interactions by removing unnecessary source-switching logic.

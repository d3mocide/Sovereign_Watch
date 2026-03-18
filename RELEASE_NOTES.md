# Release - v0.36.0 - WebSDR Discovery & Tactical UI Separation

## High-Level Summary

This feature release significantly refines the SDR (Software Defined Radio) node discovery architecture, introducing a global map-first WebSDR explorer and specializing the existing KiwiSDR widget. It resolves a long-standing "muddy" user experience by architecturally isolating the two receiver networks, ensuring that discovery tools and selection states remain clean and focused on their respective domains.

## Key Features

- **Global WebSDR Discovery**: A new map-integrated explorer for the global WebSDR receiver network. It provides a full-page view without geographic restrictions, allowing operators to discover and connect to hundreds of nodes worldwide.
- **Architectural Isolation**: Discovery tools for KiwiSDR and WebSDR are now fully separated. `KiwiNodeBrowser` has been specialized for KiwiSDR nodes, while a new `WebSDRDiscovery` component handles the WebSDR map.
- **Tactical UI Separation**:
    - Renamed the base "Listen" mode to "**KiwiSDR**" for clarity.
    - WebSDR receiver now transitions to a dedicated full-page receiver view, unmounting automatically when not in use to conserve system resources.
- **Themed SDR Popups**: WebSDR node popups have been styled with a custom violet tactical theme, consistent with the application's dark aesthetic and removing unwanted white default outlines.

## Technical Details

- **Frontend Separation**: Created `WebSDRDiscovery.tsx` and updated `RadioTerminal.tsx` to handle the new full-screen mode state.
- **Container Fix**: Updated the `js8call` service Dockerfile to include `websdr_directory.py`, resolving a discovery outage caused by a missing logic file in the container image.
- **Documentation**: Comprehensive updates to the `UI_Guide.md` and `Configuration.md` to reflect the new Discovery architecture.

## Upgrade Instructions

1. **Pull the latest changes**:
   ```bash
   git pull origin dev
   ```

2. **Rebuild and Restart**:
   ```bash
   docker compose up -d --build js8call frontend
   ```

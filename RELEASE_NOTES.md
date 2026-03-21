# Release - v0.41.4 - Dynamic RadioReference & RF Range Enhancements

This release significantly enhances the geographical intelligence handling for RadioReference ingestion and expands backend querying capabilities for the tactical map.

### High-Level Summary
Previously, the overarching map limits constrained the RadioReference ingestion engine exclusively to the Pacific Northwest (Oregon/Washington) and capped visual tower mapping to a rigid 5000 pins inside the view. This resulted in sharp geographical constraints extending outward into the contiguous United States. By introducing dynamic US state discovery metrics based on your custom `CENTER_LAT`/`CENTER_LON`, the system now dynamically auto-extracts infrastructure boundaries to envelop your localized area flawlessly.

### Key Changes
- **Dynamic State Generation (RadioReference)**: The ingestion container natively leverages FIPS lookup tables instead of hardcoded environment inputs. Providing `RADIOREF_STATE_IDS="AUTO"` measures states encompassing your predefined `RR_RADIUS_MI`, mapping dynamically selected states perfectly for targeted ingestion.
- **RF Map Capacity Expansion**: Lifted backend database retrieval restrictions from generating a strict `LIMIT 5000` to `LIMIT 15000` nodes natively. This prevents harsh geographic drop-offs during macro-tactical views of radio and infrastructure elements.
- **Optimized UI Range Toggles**: Altered the legacy system parameters out of large bounds (e.g. 1000, 2000 NM filters) focusing exclusively on the most accurate radar presentation intervals: `150`, `300` (Default), and `600` NM radius views.

### Upgrade Instructions
Pull the newest source configurations and launch a forced service rebuild for the `sovereign-rf-pulse` polling engine:

```bash
docker compose up -d --build sovereign-rf-pulse
```
No frontend static bundles are strictly required since Vite's HMR manages mapping files automatically, but users navigating back out of the environment can run `pnpm run build` as needed.

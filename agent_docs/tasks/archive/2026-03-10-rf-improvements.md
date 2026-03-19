# RF Improvements & Architecture Overhaul

**Date:** 2026-03-10
**Task Slug:** rf-improvements

## Issue
The RF infrastructure ingestion system required a major overhaul to support advanced multi-source polling natively, specifically integrating authenticated SOAP access for the RadioReference databases, alongside RepeaterBook, Amateur Radio Directory (ARD), and NOAA NWR. Additionally, the tactical map required enhanced UI feedback to physically classify RF hardware by its band (e.g., `2m`, `70cm`).

## Solution
1. **Multi-Source Poller Integration**: Transitioned the backend to use the highly concurrent `rf_pulse` Python microservice. This required adding specialized dependencies (`zeep` for SOAP, `beautifulsoup4` and `lxml` for HTML scraping) to parse complex undocumented data structures dynamically.
2. **RadioReference Auth**: Registered `.env` variables (`RADIOREF_APP_KEY`, `RADIOREF_USERNAME`, `RADIOREF_PASSWORD`) for secure upstream session management.
3. **Frontend Band Badges**: Extended the `SidebarRight.tsx` entity inspector to dynamically compute the physical frequency band using `getHamBand()` and render it as an amber tactical pill cleanly integrated with the `IDENTIFIED_TARGET` header alignment block.

## Changes
- **Modified**: `frontend/src/components/layouts/SidebarRight.tsx` - Engineered the `getHamBand` function, applied new CSS alignment to cluster the band badge seamlessly to the left next to the `RF_INFRASTRUCTURE` pill.
- **Modified**: `README.md` - Overhauled the architecture diagrams, `.env` config checklist, and Data Sources tables to thoroughly document `rf_pulse` capabilities.
- **Modified**: `frontend/package.json` - Bumped version down to `0.23.0`
- **Added**: `CHANGELOG.md` & `RELEASE_NOTES.md` records.

## Verification
- Validated TypeScript typing and ESLint integrity for `SidebarRight.tsx` modifications through the Docker container.
- Executed `vitest` unit test suite locally to verify no core `geoUtils` breakages.
- Visually reviewed Markdown structure for the `README.md` presentation layers.

## Benefits
The Sovereign Watch RF layer is now profoundly more robust. By centralizing scraping logic inside the `rf_pulse` service and enabling authoritative trunked-radio source imports via RadioReference, intelligence density has exponentially increased. Operator UX is additionally enhanced via immediate physical layer (Band) identification without requiring deep metadata inspection.

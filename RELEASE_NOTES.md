# Release - v0.42.1 - Strategic Update

## Summary

This update marks a critical transition from core track ingestion toward high-level analytical utility. Following a deep-dive research phase across GDELT and External SIGINT datasets, we are formally prioritizing features that provide global situational context.

This release also performs a "Repo Hygiene" pass, pruning over 17,000 lines of obsolete documentation in `agent_docs` to ensure token-efficient AI operations and faster workspace loading on tactical edge hardware.

## Key Features (Backlog)

*   **GDELT Intelligence Pulse**: Integrated planned support for the Global Database of Events, Language, and Tone (15-min interval mapping).
*   **SIGINT Jamming Index (ADS-B)**: Strategic roadmap now includes inference models for GPS jamming detection via ADS-B integrity categories (NIC/NACp).
*   **Environmental Layer**: Added NOAA Space Weather (Kp-index & Auroral Oval) to the operational backlog.
*   **Multi-INT HUD Suite**: Roadmap now includes integrated widgets for Polymarket (predictive OSINT), Live News Grids, and Global Threat Levels (DEFCON).

## Technical Details

*   **Pruning**: Cleaned up historical `agent_docs/tasks/archive/` directory to remove hundreds of obsolete markdown task logs.
*   **Roadmap**: Updated `ROADMAP.md` and `COMPLETED_ARCHIVE.md` to ensure ID-level consistency and status accuracy.

## Upgrade Instructions

No code changes in this version; document-only update to roadmap and repository metadata.

```bash
git pull origin main
```

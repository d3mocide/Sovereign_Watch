# Release - v0.35.0 - Oracle & Orbit

## High-Level Summary

This release significantly enhances the platform's distributed intelligence fusion capabilities and orbital monitoring reliability. Key additions include a multi-mode AI Analyst supporting Tactical, OSINT, and SAR specializations, along with a major performance and stability overhaul for the global tracking telemetry system.

## Key Features

- **Specialized AI Analysis (Oracle)**: The AI Analyst now features selectable modes (Tactical, OSINT, SAR), allowing operators to tailor automated intelligence assessments to specific mission profiles.
- **Orbital Tracking Performance**: Implemented an isolated filter state for the Orbital Map view, ensuring that even with 1,500+ active satellites, map performance remains fluid and counts remain stable.
- **Stability & Reliability**: Squashed a persistent flicker bug in the global track counts and ensured the AI Analyst triggers reliably across all map view modes.

## Technical Details

- **Backend**: Enhanced `@router.post("/api/analyze/{uid}")` to handle mode-specific personas and synthesized satellite tracks from TLE data if no historical tracks are stored.
- **Frontend**: Transitioned high-frequency map data threading to a more stable prop-memoization pattern to reduce React reconciliation overhead.
- **Documentation**: New [AI Configuration Guide](./Documentation/AI_Configuration.md) added to support developers extending LiteLLM-based capabilities.

## Upgrade Instructions

Run the following commands to pull the latest changes and rebuild the environment:

```bash
git pull origin main
docker compose up -d --build
```

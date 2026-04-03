# Release - v0.62.0 - Tactical Intelligence Hardening

## Summary
The **v0.62.0** update, codenamed **"Tactical Intelligence Hardening,"** addresses critical reliability issues in the AI Analysis HUD and unifies the platform's persona architecture. This release eliminates the long-standing "wall of text" regressions and ensures that Strategic Intelligence Reports (SITREPs) maintain global operational context across all data sources.

## Key Features
- **Unified AI Persona Framework**: Centralized all 7 operational modes (Tactical, OSINT, SAR, SITREP, GDELT, and HOLDING) into a single, disciplined system ensuring identical formatting across the entire grid.
- **Strategic Intelligence Routing**: Forced SITREPs to use the "Strategic Director" persona (`### ACTIVE ZONES`, etc.), preventing OSINT headers from diluting high-level intelligence.
- **AI HUD Rendering V2**: Implemented an aggressive 'Slash-and-Burn' regex pre-processor that "heals" malformed AI output in real-time, restoring headers and bullets to their intended layout.
- **Defensive Persona Gating**: Personas now include mandatory negative constraints that forbid non-compliant markdown, ensuring the HUD HUD layout remains rock-solid.

## Technical Details
- **Frontend Regex Stabilization**: Fixed a critical character-range error (`[*-•]`) that caused text fragmentation.
- **Bold-Tag Healing**: Automatic re-joining of bold identifiers split by the LLM stream.
- **Bullet-First Architecture**: Standardized all AI reporting on dash-bullets (`- `) for deterministic parsing.
- **SITREP flag routing**: Full-stack support for the `isSitrep` flag from the UI down to the escalation engine.

## Upgrade Instructions
To apply these changes, pull the latest code and rebuild the core services:
```bash
docker compose pull
docker compose build frontend
docker compose up -d --build sovereign-backend
```
*Note: Ingestion pollers do not require a rebuild for this logic update.*

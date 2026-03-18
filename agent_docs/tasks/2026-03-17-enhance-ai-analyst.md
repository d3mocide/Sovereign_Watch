# Task: Enhance AI Analyst with Metadata, Intel Fusion & Specialized Modes

## Issue
The AI Analyst was previously working with very limited telemetry data (basic averages) and lacked any specialized focus or contextual awareness of nearby events.

## Solution
1.  **Enriched Telemetry**: Updated the backend query to fetch metadata (callsign, registration, data source), speed/altitude extremes, and precise track centroids.
2.  **Intel Fusion**: Integrated a spatial search for nearby `intel_reports` within 50km of the track to provide situational context to the AI.
3.  **Specialized Personas**: Implemented three distinct analysis modes:
    *   **Tactical**: Movement anomalies and trajectory fluctuations.
    *   **OSINT**: Entity identity verification and "ghost" track detection.
    *   **SAR**: Distress signals and circular searching patterns.
4.  **UI Updates**: Added a Mode selector to the AI Analyst panel for on-the-fly persona switching.

## Changes
- **Backend Schema**: Added `mode` field to `AnalyzeRequest` in `backend/api/models/schemas.py`.
- **Backend API**: Refactored `backend/api/routers/analysis.py` to:
    - Perform a fuzed metadata/telemetry query.
    - Query nearby `intel_reports`.
    - Apply persona-specific system prompts.
- **Frontend API**: Updated `frontend/src/api/analysis.ts` to transmit the selected mode.
- **Frontend Hooks**: Updated `useAnalysis` to support the mode parameter.
- **Frontend UI**: Updated `AIAnalystPanel.tsx` with a new dropdown and state management for modes.
- **Documentation**: Updated `Documentation/AI_Configuration.md` to include the new mode catalog.

## Verification
- [X] UI displays "Tactical", "OSINT", and "SAR" options.
- [X] Changing modes re-triggers the analysis with the correct persona instructions.
- [X] Prompt includes metadata like callsign and registration.
- [X] Nearby intel reports are correctly formatted into the AI context.

## Benefits
- More accurate and context-aware assessments.
- User-selectable analytical focus.
- Better identity verification for OSINT workflows.
- Immediate identification of potential distress for SAR missions.

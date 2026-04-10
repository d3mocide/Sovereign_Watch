# Release - v1.0.2 - Mission-Scoped Regional Risk Stabilization

This patch release hardens Sovereign Watch's right-click regional risk workflow into a production-ready operator surface. Mission-scoped GDELT and H3 risk now align to explicit geopolitical linkage rules, the AI narrative path follows the same persona conventions as the main analyst workflow, contradictory low-value summaries are replaced with structured fallback analysis, and the panel now renders cleanly on constrained displays. The net result is a more trustworthy regional assessment loop for real-world mission planning and live hotspot review.

## Key Features

- **Mission-Scoped Regional Risk Overlay**: The regional risk panel now combines explicit mission-aware GDELT linkage with mission-scoped H3 risk so local assessments can separate in-area activity from state-actor, infrastructure, and chokepoint pressure.
- **Operator-Trust Narrative Hardening**: Regional risk responses now reject contradictory narratives like "no significant escalation" when heuristic and linkage evidence already shows elevated pressure, and they fall back to a structured analyst-style assessment when the model output is empty or malformed.
- **AI Analyst Presentation Parity**: The regional risk overlay now uses the same markdown-aware renderer as the AI Analyst panel, including cleaned headers, bullet formatting, uppercase-token healing, and a bounded scroll container for small screens.

## Technical Details

- **Shared GDELT Linkage Service**: Mission filtering for `/api/gdelt/events`, `/api/gdelt/actors`, `/api/h3/risk`, and regional evaluation now uses a common geopolitical linkage service that classifies in-AOT, state-actor, cable-infrastructure, and maritime chokepoint relevance.
- **Regional Risk Persona Alignment**: The right-click regional risk flow now sends `mode: tactical` and uses the unified `AIService` persona selector rather than a divergent hardcoded evaluator mode.
- **Consistency Guard & Structured Fallback**: `SequenceEvaluationEngine` now binds prompt generation to heuristic evidence and replaces contradictory or unstructured elevated-risk narratives with sectioned fallback analysis.
- **UI Resilience**: The overlay now distinguishes complete success from partial success, surfaces mission H3 risk alongside the narrative, and keeps long text confined inside a scrollable analysis box.

## Upgrade Instructions

```bash
git pull origin main
docker compose build sovereign-frontend sovereign-backend
docker compose up -d
```

# Release - v1.0.1 - Fusion Polish & Regional Intelligence Consistency

This patch release tightens the fidelity of analytical output across tactical intelligence routes by strictly enforcing mission-area boundary constraints for external variables. AI assessments for the Sea, Air, and Orbital domains now properly distinguish between localized incidents, impact-linked external drivers like space weather, and global context, preventing false-positive escalations and out-of-bounds geographic correlations. The dashboard audit metrics have been updated to capture the true footprint of historical tracks storage across Timescale relations for more accurate velocity and projection analysis.

## Key Features

- **Mission Area AI Context Fencing**: Weather context scope is now intercepted using true `ST_Within` intersections with your targeted H3 resolution instead of aggregating national averages. Orbital tracking and GDELT assessments similarly ignore noisy global activity when operating out-of-scope for the designated region.
- **Improved Storage Observability**: The `Stats/Audit` panel's Tracks DB Size now accurately measures storage size across hypertable chunk relations, ensuring the presented linear projection burn rates accurately reflect host disk pressure.
- **Pre-Release Analytics Skill**: Operators now have access to a reusable pre-release prompt template for consistently documenting pre-release QA reporting before marking branch stabilization.

## Technical Details

- **Domain AI Maneuver Mode**: Tactical, OSINT, and SAR mode toggles are now actively passed fully through to Air, Sea, and Orbital domain agents.
- **Fusion Audit Scaling**: Auto-formats to MB/GB/TB and clarifies size definitions to specifically represent temporal storage tracks.
- **Clausal Chain & Regional Scoping**: Regional risk tools now distinctly surface "impact-linked external context", distinguishing local causality from external dependencies.
- **Markdown AI Analyst Resilience**: Healed wrapped bullet labels and tightened the parsing logic so formatted intelligence cards gracefully export over constrained mediums.

## Upgrade Instructions

```bash
git pull origin main
docker compose build sovereign-backend
docker compose up -d
```

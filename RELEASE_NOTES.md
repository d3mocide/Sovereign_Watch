# Release - v0.41.3 - FCC Ingestion Hotfix & UI Theming

This release immediately addresses a critical bug in the FCC Antenna Structure Registration (ASR) ingestion mapping logic, and synchronizes the AI intelligence panel to follow dedicated tactical colors.

### High-Level Summary
Previously, all towers appearing on the global map were incorrectly categorized with identical owners (e.g., "City of Gillette") and identically mapped heights. This was caused by the ingestion script indexing the wrong column in the FCC `.dat` datasets. Additionally, the AI Analyst tool failed to reflect the respective domain colors for new infrastructure types, sticking to a generic green fallback. Both issues are now resolved.

### Key Fixed
- **FCC Tower Ingestion Identifiers**: Transitioned the parsed USI key from column 1 (`REG`) to the actual Unique System Identifier at column 3. This resolves the metadata collision event and ensures thousands of structures successfully align to accurate registration values upon extraction from `r_tower.zip`.
- **AI Analyst Theming Integration**: Resolved fallback mapping in the `AIAnalystPanel.tsx` modal and `AnalysisWidget.tsx` property card component to explicitly support styles for Orange (Towers), Teal (Repeaters), Cyan (Infrastructure), and Indigo (JS8Call) entities. 

### Upgrade Instructions
Pull the latest code, force build the updated python container mapping, and clear out legacy cache variables in the data service:

```bash
docker compose up -d --build sovereign-infra-poller
docker exec sovereign-redis redis-cli DEL infra:last_fcc_fetch
docker compose restart sovereign-infra-poller
```
No database migrations are required, as the next poller sweep will execute an `ON CONFLICT (fcc_id) DO UPDATE` command applying the correct properties immediately.

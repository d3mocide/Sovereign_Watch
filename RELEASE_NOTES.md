# Release - v0.46.2 - GDELT Enrichment & Stability

## High-Level Summary

This patch release hardens Sovereign Watch's GDELT intelligence pipeline from ingestion through UI analytics. GDELT events now carry richer geopolitical context (actors, countries, class, media intensity), the Analyst workflow can reason directly over GDELT selections, and frontend map/label behavior is safer and clearer under malformed or sparse source data conditions.

## Key Features

- **Full GDELT Metadata Enrichment**: Added actor/country/event-class/media fields across poller, historian, database schema, API, and map layers.
- **Stable GDELT Entity IDs**: Replaced headline substring UIDs with `event_id` identifiers to prevent collisions and improve entity continuity.
- **Analyst GDELT Fallback**: Added dedicated GDELT fallback context in the analysis router with geopolitical persona specialization.
- **Independent Domain Tag Toggle**: Added a separate GDELT label toggle in the Global Event Tracking footer control.

## Technical Details

- **Database**:
  - Added `actor1_country`, `actor2_country`, `event_code`, `event_root_code`, `quad_class`, `num_mentions`, `num_sources`, `num_articles`, `event_date` to `gdelt_events`.
- **Ingestion**:
  - Poller now extracts enriched columns and resolves SOURCEURL using last-column strategy to tolerate GDELT schema drift.
- **Historian**:
  - Upsert query expanded for enriched fields and fixed `event_date` casting/type inference path.
- **API**:
  - `/api/gdelt/events` now exposes enriched properties and validated domain extraction for labels/source links.
- **Frontend**:
  - Sidebar and tooltip now display event class, actor countries, and media metrics.
  - Domain labels are readability-tuned and default to OFF, with explicit user toggle.

## Upgrade Instructions

1. **Pull latest source and tags**
   ```bash
   git pull origin main --tags
   ```

2. **Rebuild and restart affected services**
   ```bash
   docker compose up -d --build sovereign-gdelt-pulse sovereign-backend sovereign-frontend sovereign-nginx
   ```

3. **Verify frontend compile health**
   ```bash
   cd frontend
   pnpm run verify
   ```

4. **Validate GDELT API payload shape (optional sanity)**
   ```bash
   curl "http://localhost/api/gdelt/events?refresh=true&limit=5"
   ```

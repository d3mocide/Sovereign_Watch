# Database Design - Sovereign Watch

> **CRITICAL:** Sovereign Watch uses **PostgreSQL** with **PostGIS** and **TimescaleDB** extensions.

## Core Rules

1.  **Initialization**: The database schema is initialized via `backend/db/init.sql`. The `POSTGRES_PASSWORD` environment variable is mandatory for `backend/scripts/cleanup_timescale.py`.
2.  **Indexes**: The system relies heavily on specific indexes for performance.
    *   It uses the `pg_trgm` extension.
    *   GIN indexes must be maintained on `tracks(entity_id)` and `tracks((meta->>'callsign'))` to support efficient substring (`ILIKE`) searches.
3.  **Hybrid Intelligence Retrieval**: The system uses a specialized PostgreSQL function `get_contextual_intel(embedding, radius_meters, centroid_geom)` defined in `init.sql` for semantic + geospatial searches.
4.  **Embeddings**: Vector embeddings for intelligence reports use a dimension of **384** (compatible with models like `all-MiniLM-L6-v2` or truncated `text-embedding-3-small`). The embedding service uses LiteLLM with a default model of `text-embedding-3-small`.
5.  **Schema Changes**: Schema changes should be applied to existing deployments using standalone scripts (e.g., `backend/scripts/apply_indexes.py`) in addition to updating `backend/db/init.sql` for fresh installs.
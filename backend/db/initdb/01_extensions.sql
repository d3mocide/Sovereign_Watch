-- =============================================================================
-- 01_extensions.sql — PostgreSQL / TimescaleDB extension bootstrap
-- =============================================================================
-- Runs once on a fresh volume.  All extensions use IF NOT EXISTS so re-running
-- is safe, though Postgres only calls docker-entrypoint-initdb.d on first init.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;

DO $$
BEGIN
    ALTER EXTENSION timescaledb UPDATE;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not update timescaledb extension during init (%), will be retried at backend startup.', SQLERRM;
END;
$$;

CREATE EXTENSION IF NOT EXISTS postgis;

-- pgvector: standard high-dimensional vector similarity search.
-- timescaledb-ha:pg16 ships this; pgvectorscale is the newer high-perf variant
-- but uses the same extension name in most HA images.
CREATE EXTENSION IF NOT EXISTS vector;

-- pgai: bundles vectorscale / AI helper functions in Timescale Cloud HA images.
CREATE EXTENSION IF NOT EXISTS ai CASCADE;

-- pg_trgm: trigram indexes for fast LIKE / similarity text search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

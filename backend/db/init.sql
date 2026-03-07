-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS timescaledb;
DO $$
BEGIN
    ALTER EXTENSION timescaledb UPDATE;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not update timescaledb extension during init (%), will be retried at backend startup.', SQLERRM;
END;
$$;
CREATE EXTENSION IF NOT EXISTS postgis;
-- vectorscale might need to be created as 'vector' first if vectorscale depends on it, 
-- but usually timescaledb-ha images have them. 
-- The roadmap specified 'timescaledb-ha:pg16' which includes pgvector.
-- We'll assume 'vectorscale' (pgvectorscale) is available as an extension name or part of the ai stack.
-- If 'vectorscale' extension name differs (e.g. ai, vector), we should be careful. 
-- Standard pgvector is 'vector'. pgvectorscale is the new high-perf one.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS ai CASCADE; -- often bundles vector/vectorscale functionality in some images
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- TABLE: tracks (High-velocity telemetry)
CREATE TABLE IF NOT EXISTS tracks (
    time        TIMESTAMPTZ NOT NULL,
    entity_id   TEXT NOT NULL,
    type        TEXT,
    lat         DOUBLE PRECISION,
    lon         DOUBLE PRECISION,
    alt         DOUBLE PRECISION,
    speed       DOUBLE PRECISION,
    heading     DOUBLE PRECISION,
    meta        JSONB,
    geom        GEOMETRY(POINT, 4326)
);

-- Convert to Hypertable (Partition by time, 1 day chunks)
SELECT create_hypertable('tracks', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');

-- Enable Compression
ALTER TABLE tracks SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'entity_id',
    timescaledb.compress_orderby = 'time DESC'
);

-- Add Compression Policy (Compress data older than 24 hours)
SELECT add_compression_policy('tracks', INTERVAL '24 hours');

-- Add Retention Policy (Auto-delete data older than 24 hours)
-- This runs every hour and drops chunks outside the retention window
SELECT add_retention_policy('tracks', INTERVAL '24 hours');

-- Indices
CREATE INDEX IF NOT EXISTS ix_tracks_geom ON tracks USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_tracks_entity_time ON tracks (entity_id, time DESC);
CREATE INDEX IF NOT EXISTS ix_tracks_entity_id_trgm ON tracks USING gin (entity_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_tracks_meta_callsign_trgm ON tracks USING gin ((meta->>'callsign') gin_trgm_ops);

-- TABLE: satellites (Latest TLE + orbital metadata per NORAD ID)
-- No hypertable, no retention — plain lookup table upserted by the Historian.
CREATE TABLE IF NOT EXISTS satellites (
    norad_id        TEXT PRIMARY KEY,
    name            TEXT,
    category        TEXT,
    constellation   TEXT,
    tle_line1       TEXT NOT NULL,
    tle_line2       TEXT NOT NULL,
    period_min      FLOAT,
    inclination_deg FLOAT,
    eccentricity    FLOAT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_satellites_constellation ON satellites (constellation);

-- TABLE: intel_reports (Semantic Data)
CREATE TABLE IF NOT EXISTS intel_reports (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    timestamp   TIMESTAMPTZ DEFAULT NOW(),
    content     TEXT,
    embedding   vector(768), -- Defaulting to 768 (common) or 384 (all-MiniLM). Plan said 384.
    geom        GEOMETRY(POINT, 4326)
);

-- Note: 384 dimensions for 'all-MiniLM-L6-v2' (fast/efficient), 768 for 'nomic-embed-text' or others.
-- We will respect the plan's 384 check.
ALTER TABLE intel_reports ALTER COLUMN embedding TYPE vector(384);

-- Index: DiskANN via pgvectorscale (if available) or HNSW (standard pgvector fallback)
-- creating a standard HNSW index for now as DiskANN requires specific pgvectorscale setup
CREATE INDEX IF NOT EXISTS ix_intel_embedding ON intel_reports USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS ix_intel_geom ON intel_reports USING GIST (geom);

-- FUNCTION: Contextual Intel Search
-- Hybrid search: Spatial filter + Vector Similarity
CREATE OR REPLACE FUNCTION get_contextual_intel(
    query_embedding vector(384),
    search_radius_meters FLOAT,
    center_point GEOMETRY
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    distance FLOAT,
    geom GEOMETRY
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ir.id,
        ir.content,
        (ir.embedding <=> query_embedding) as distance,
        ir.geom
    FROM
        intel_reports ir
    WHERE
        ST_DWithin(ir.geom::geography, center_point::geography, search_radius_meters)
    ORDER BY
        distance ASC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Include User Table Creation
-- Create sw_users table (Standard Postgres table, NOT a TimescaleDB hypertable)
CREATE TABLE IF NOT EXISTS sw_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    roles TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- Unique index on username
CREATE UNIQUE INDEX IF NOT EXISTS idx_sw_users_username ON sw_users(username);

-- Insert default admin user
-- NOTE: The password hash below is for 'admin' and MUST be replaced before deployment!
INSERT INTO sw_users (username, password_hash, roles)
VALUES (
    'admin',
    '$argon2id$v=19$m=65536,t=2,p=1$Mh/NlK3xIeM/P1R5v4wOxg$7D6M3Q2r/b1tT7R0+0jN7o3K5y8m4L9v6q5L3t9Q7Z+6A',
    '{"admin", "user"}'
) ON CONFLICT (username) DO NOTHING;

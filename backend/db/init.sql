-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;
-- vectorscale might need to be created as 'vector' first if vectorscale depends on it, 
-- but usually timescaledb-ha images have them. 
-- The roadmap specified 'timescaledb-ha:pg16' which includes pgvector.
-- We'll assume 'vectorscale' (pgvectorscale) is available as an extension name or part of the ai stack.
-- If 'vectorscale' extension name differs (e.g. ai, vector), we should be careful. 
-- Standard pgvector is 'vector'. pgvectorscale is the new high-perf one.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS ai CASCADE; -- often bundles vector/vectorscale functionality in some images

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

-- Indices
CREATE INDEX IF NOT EXISTS ix_tracks_geom ON tracks USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_tracks_entity_time ON tracks (entity_id, time DESC);

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

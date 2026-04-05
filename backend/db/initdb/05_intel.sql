-- =============================================================================
-- 05_intel.sql — Semantic intelligence reports + vector search
-- =============================================================================
-- intel_reports:          Free-text reports with 384-dim embeddings + PostGIS
-- get_contextual_intel(): Hybrid spatial + vector similarity search function
-- =============================================================================

CREATE TABLE IF NOT EXISTS intel_reports (
    id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    content   TEXT,
    embedding vector(768),   -- provisioned at 768; resized below
    geom      GEOMETRY(POINT, 4326)
);

-- Resize to 384 dims (all-MiniLM-L6-v2 / nomic-embed-text-v1.5 compatible).
-- ALTER … TYPE is idempotent when the column is already 384-dim.
ALTER TABLE intel_reports ALTER COLUMN embedding TYPE vector(384);

CREATE INDEX IF NOT EXISTS ix_intel_embedding
    ON intel_reports USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS ix_intel_geom
    ON intel_reports USING GIST (geom);

-- FUNCTION: get_contextual_intel
-- Hybrid search: spatial bounding filter then cosine similarity ranking.
CREATE OR REPLACE FUNCTION get_contextual_intel(
    query_embedding     vector(384),
    search_radius_meters FLOAT,
    center_point        GEOMETRY
)
RETURNS TABLE (
    id       UUID,
    content  TEXT,
    distance FLOAT,
    geom     GEOMETRY
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ir.id,
        ir.content,
        (ir.embedding <=> query_embedding) AS distance,
        ir.geom
    FROM intel_reports ir
    WHERE ST_DWithin(
        ir.geom::geography,
        center_point::geography,
        search_radius_meters
    )
    ORDER BY distance ASC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql;

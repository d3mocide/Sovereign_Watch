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

-- TABLE: rf_sites (All fixed RF infrastructure)
CREATE TABLE IF NOT EXISTS rf_sites (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source       TEXT NOT NULL,           -- 'repeaterbook' | 'ard' | 'noaa_nwr' | 'radioref'
    site_id      TEXT NOT NULL,           -- source-native identifier (callsign, NOAA ID, RR site ID)
    service      TEXT NOT NULL,           -- 'ham' | 'gmrs' | 'public_safety' | 'noaa_nwr'
    callsign     TEXT,
    name         TEXT,                    -- human label (site name or NWR station name)
    lat          DOUBLE PRECISION NOT NULL,
    lon          DOUBLE PRECISION NOT NULL,
    output_freq  DOUBLE PRECISION,        -- MHz (output / receive frequency)
    input_freq   DOUBLE PRECISION,        -- MHz (input / transmit frequency)
    tone_ctcss   DOUBLE PRECISION,        -- CTCSS Hz (e.g. 141.3)
    tone_dcs     TEXT,                    -- DCS code where applicable
    modes        TEXT[],                  -- ['FM','DMR','P25','D-Star','Fusion','NXDN','TETRA']
    use_access   TEXT,                    -- 'OPEN' | 'CLOSED' | 'LINKED' | 'PRIVATE'
    status       TEXT DEFAULT 'Unknown',  -- 'On-air' | 'Off-air' | 'Unknown'
    city         TEXT,
    state        TEXT,
    country      TEXT DEFAULT 'US',
    emcomm_flags TEXT[],                  -- ['ARES','RACES','SKYWARN','CERT','WICEN']
    meta         JSONB,                   -- source-specific extras (power_w, antenna_height, etc.)
    geom         GEOMETRY(POINT, 4326),
    fetched_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (source, site_id)
);

CREATE INDEX IF NOT EXISTS ix_rf_sites_geom       ON rf_sites USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_rf_sites_service     ON rf_sites (service);
CREATE INDEX IF NOT EXISTS ix_rf_sites_source      ON rf_sites (source);
CREATE INDEX IF NOT EXISTS ix_rf_sites_callsign    ON rf_sites USING gin (callsign gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_rf_sites_modes       ON rf_sites USING GIN (modes);
CREATE INDEX IF NOT EXISTS ix_rf_sites_emcomm      ON rf_sites USING GIN (emcomm_flags);

-- TABLE: rf_systems (Trunked public safety systems - RadioReference)
CREATE TABLE IF NOT EXISTS rf_systems (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source     TEXT DEFAULT 'radioref',
    rr_sid     TEXT UNIQUE,               -- RadioReference system ID
    name       TEXT NOT NULL,
    type       TEXT,                      -- 'P25', 'DMR', 'EDACS', 'Motorola'
    state      TEXT,
    county     TEXT,
    meta       JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_rf_systems_state ON rf_systems (state);

-- TABLE: rf_talkgroups (Trunked talkgroup catalogue)
CREATE TABLE IF NOT EXISTS rf_talkgroups (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    system_id   UUID REFERENCES rf_systems(id) ON DELETE CASCADE,
    decimal_id  INTEGER NOT NULL,
    alpha_tag   TEXT,
    description TEXT,
    category    TEXT,                     -- 'Law Dispatch', 'Fire Dispatch', 'EMS', etc.
    priority    INTEGER DEFAULT 3,        -- 1=highest, 5=lowest
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (system_id, decimal_id)
);

CREATE INDEX IF NOT EXISTS ix_rf_talkgroups_system ON rf_talkgroups (system_id);
CREATE INDEX IF NOT EXISTS ix_rf_talkgroups_cat    ON rf_talkgroups (category);

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

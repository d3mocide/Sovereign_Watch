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

-- Migrate existing compression policy from 1h → 4h if it was previously created.
-- On a fresh deployment this block is a no-op; on an upgrade it reschedules the job.
DO $$
DECLARE
    _job_id INTEGER;
BEGIN
    SELECT job_id INTO _job_id
    FROM timescaledb_information.jobs
    WHERE hypertable_name = 'tracks' AND proc_name = 'policy_compression';
    IF _job_id IS NOT NULL THEN
        PERFORM alter_job(_job_id, config => jsonb_build_object('compress_after', '4 hours'));
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- alter_job not available on older TimescaleDB versions; will be set on first init.
    NULL;
END;
$$;

-- Add Compression Policy (Compress data older than 4 hours)
-- 4-hour lag gives live ingest a write-friendly uncompressed window while still
-- keeping ~68 of the 72 retained hours in columnar form.  Compressing at 1 hour
-- caused the background job to compete with ongoing inserts on constrained SSD
-- hardware (Jetson Nano).  The storage savings vs. 1-hour are negligible (3 fewer
-- hours uncompressed out of 72), but the reduction in I/O contention is significant.
SELECT add_compression_policy('tracks', INTERVAL '4 hours');

-- Add Retention Policy (Auto-delete data older than 72 hours)
-- Matches TRACK_HISTORY_MAX_HOURS=72 in the API config.
-- 1-day chunks → 3 chunks retained; retention job drops the oldest daily.
SELECT add_retention_policy('tracks', INTERVAL '72 hours');

-- Indices
CREATE INDEX IF NOT EXISTS ix_tracks_geom ON tracks USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_tracks_entity_time ON tracks (entity_id, time DESC);
CREATE INDEX IF NOT EXISTS ix_tracks_entity_id_trgm ON tracks USING gin (entity_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_tracks_meta_callsign_trgm ON tracks USING gin ((meta->>'callsign') gin_trgm_ops);

-- NOTE: orbital_tracks was removed.
-- Satellite positions are deterministic and computed on-demand via SGP4 from
-- the TLEs stored in the `satellites` table below.  Persisting ~2 000 rows/sec
-- of reproducible data provided no operational benefit and consumed significant
-- I/O.  The /api/tracks/history/{SAT-*} and /api/tracks/search endpoints now
-- propagate positions in-process; /api/orbital/groundtrack/{norad_id} was
-- already doing the same for ground track visualization.

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
-- TABLE: infra_towers (FCC ULS Data)
CREATE TABLE IF NOT EXISTS infra_towers (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fcc_id     TEXT UNIQUE, -- ULS Registration Number
    type       TEXT,        -- e.g. 'TOWER', 'MAST', 'POLE'
    owner      TEXT,        -- Owner Name
    status     TEXT,        -- e.g. 'Constructed', 'Granted'
    height_m   DOUBLE PRECISION,
    elevation_m DOUBLE PRECISION,
    lat        DOUBLE PRECISION NOT NULL,
    lon        DOUBLE PRECISION NOT NULL,
    geom       GEOMETRY(POINT, 4326),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_infra_towers_geom ON infra_towers USING GIST (geom);

-- FUNCTION: Prune stale RF sites not updated in 30 days.
-- Called periodically by the API historian background task.
-- Sites that vanish from a source's feed (decommissioned repeaters, removed towers)
-- will stop receiving upserts and will be pruned automatically.
CREATE OR REPLACE FUNCTION prune_stale_rf_sites() RETURNS INTEGER AS $$
DECLARE
    deleted INTEGER;
BEGIN
    DELETE FROM rf_sites WHERE updated_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END;
$$ LANGUAGE plpgsql;

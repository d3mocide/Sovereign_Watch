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

-- Add Retention Policy (Auto-delete data older than 7 days)
-- Matches GDELT event retention for accurate multi-INT correlation.
-- 1-day chunks → 7 chunks retained; retention job drops the oldest daily.
SELECT add_retention_policy('tracks', INTERVAL '7 days');

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

-- TABLE: space_weather_kp (Kp-index time series from NOAA SWPC)
-- Hypertable for correlation with jamming events and satellite pass quality.
CREATE TABLE IF NOT EXISTS space_weather_kp (
    time        TIMESTAMPTZ NOT NULL,
    kp          FLOAT NOT NULL,          -- Kp value (0.0–9.0)
    kp_fraction FLOAT,                   -- Sub-integer precision where available
    storm_level TEXT,                    -- 'quiet'|'unsettled'|'active'|'G1'|'G2'|'G3'|'G4'|'G5'
    source      TEXT DEFAULT 'noaa_swpc' -- 'noaa_swpc_3h' | 'noaa_swpc_1m'
);

SELECT create_hypertable('space_weather_kp', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('space_weather_kp', INTERVAL '7 days');
CREATE INDEX IF NOT EXISTS ix_swkp_time ON space_weather_kp (time DESC);

-- TABLE: jamming_events (Detected GPS jamming zones from ADS-B integrity analysis)
-- Stores both active and historical jamming/degradation events keyed to H3 hex cells.
CREATE TABLE IF NOT EXISTS jamming_events (
    time            TIMESTAMPTZ NOT NULL,
    h3_index        TEXT NOT NULL,           -- H3 resolution-6 cell index
    centroid_lat    DOUBLE PRECISION,
    centroid_lon    DOUBLE PRECISION,
    confidence      FLOAT,                   -- 0.0–1.0 (higher = more likely intentional)
    affected_count  INTEGER,                 -- Aircraft with degraded NIC/NACp in cell
    avg_nic         FLOAT,                   -- Mean NIC in cell during window
    avg_nacp        FLOAT,                   -- Mean NACp in cell during window
    kp_at_event     FLOAT,                   -- Kp-index at event time (for discriminator)
    active          BOOLEAN DEFAULT TRUE,    -- FALSE once no degraded contacts remain
    assessment      TEXT                     -- 'jamming'|'space_weather'|'mixed'|'equipment'
);

SELECT create_hypertable('jamming_events', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('jamming_events', INTERVAL '7 days');
CREATE INDEX IF NOT EXISTS ix_jamming_h3_time   ON jamming_events (h3_index, time DESC);
CREATE INDEX IF NOT EXISTS ix_jamming_active     ON jamming_events (active, time DESC);
CREATE INDEX IF NOT EXISTS ix_jamming_centroid   ON jamming_events USING GIST (
    ST_SetSRID(ST_MakePoint(centroid_lon, centroid_lat), 4326)
) WHERE centroid_lat IS NOT NULL AND centroid_lon IS NOT NULL;

-- TABLE: satnogs_transmitters (SatNOGS satellite transmitter catalog)
-- Static/slow-changing: refreshed daily from db.satnogs.org.
-- Maps NORAD IDs to their registered downlink/uplink frequencies and modes —
-- the reference catalog for spectrum verification.
CREATE TABLE IF NOT EXISTS satnogs_transmitters (
    uuid            TEXT PRIMARY KEY,            -- SatNOGS transmitter UUID
    norad_id        TEXT NOT NULL,               -- NORAD catalog number (links to satellites table)
    sat_name        TEXT,                        -- Satellite name from SatNOGS DB
    description     TEXT,                        -- Human-readable transmitter label
    alive           BOOLEAN DEFAULT TRUE,        -- Whether SatNOGS considers it active
    type            TEXT DEFAULT 'Transmitter',  -- 'Transmitter' | 'Transponder' | 'Digitizer'
    uplink_low      BIGINT,                      -- Hz
    uplink_high     BIGINT,                      -- Hz (NULL for single-freq uplinks)
    downlink_low    BIGINT,                      -- Hz
    downlink_high   BIGINT,                      -- Hz (NULL for single-freq downlinks)
    mode            TEXT,                        -- 'FM' | 'BPSK' | 'CW' | 'USB' | etc.
    invert          BOOLEAN DEFAULT FALSE,       -- Inverted sideband (transponders)
    baud            FLOAT,                       -- Symbol rate (bps) where known
    status          TEXT DEFAULT 'active',       -- 'active' | 'inactive' | 'unknown'
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_satnogs_tx_norad ON satnogs_transmitters (norad_id);
CREATE INDEX IF NOT EXISTS ix_satnogs_tx_mode  ON satnogs_transmitters (mode);

-- TABLE: satnogs_observations (SatNOGS ground-station observation records)
-- Time-series: new records ingested each hour from network.satnogs.org.
-- Each row = one satellite pass captured by one ground station.
-- Spectrum verification: compare `frequency` against satnogs_transmitters.downlink_low.
CREATE TABLE IF NOT EXISTS satnogs_observations (
    time               TIMESTAMPTZ NOT NULL,     -- Observation start time (partition key)
    observation_id     BIGINT NOT NULL,           -- SatNOGS network observation ID
    norad_id           TEXT NOT NULL,             -- NORAD catalog number
    ground_station_id  INTEGER,                   -- SatNOGS ground station ID
    transmitter_uuid   TEXT,                      -- FK → satnogs_transmitters.uuid
    frequency          BIGINT,                    -- Hz (actual observed downlink)
    mode               TEXT,                      -- Observed modulation mode
    status             TEXT DEFAULT 'good',       -- 'good' | 'bad' | 'unknown'
    rise_azimuth       FLOAT,                     -- degrees
    set_azimuth        FLOAT,                     -- degrees
    max_altitude       FLOAT,                     -- degrees elevation
    has_audio          BOOLEAN DEFAULT FALSE,
    has_waterfall      BOOLEAN DEFAULT FALSE,
    vetted_status      TEXT,                      -- 'verified' | 'failed' | NULL
    tle0               TEXT,                      -- TLE name line used for scheduling
    tle1               TEXT,                      -- TLE line 1 at time of observation
    tle2               TEXT,                      -- TLE line 2 at time of observation
    fetched_at         TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable('satnogs_observations', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('satnogs_observations', INTERVAL '30 days');

CREATE UNIQUE INDEX IF NOT EXISTS ix_satnogs_obs_id_time ON satnogs_observations (observation_id, time);
CREATE INDEX IF NOT EXISTS ix_satnogs_obs_norad          ON satnogs_observations (norad_id, time DESC);
CREATE INDEX IF NOT EXISTS ix_satnogs_obs_station        ON satnogs_observations (ground_station_id);
CREATE INDEX IF NOT EXISTS ix_satnogs_obs_freq           ON satnogs_observations (frequency);

-- TABLE: gdelt_events (Geopolitical OSINT)
CREATE TABLE IF NOT EXISTS gdelt_events (
    time        TIMESTAMPTZ NOT NULL,
    event_id    TEXT NOT NULL,
    actor1      TEXT,
    actor2      TEXT,
    headline    TEXT,
    url         TEXT,
    goldstein   FLOAT,
    tone        FLOAT,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    geom        GEOMETRY(POINT, 4326),
    actor1_country  TEXT,
    actor2_country  TEXT,
    event_code      TEXT,
    event_root_code TEXT,
    quad_class      SMALLINT,
    num_mentions    INT,
    num_sources     INT,
    num_articles    INT,
    event_date      DATE,
    UNIQUE (event_id, time)
);

-- Migration: add enriched columns to existing gdelt_events tables
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS actor1_country  TEXT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS actor2_country  TEXT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS event_code      TEXT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS event_root_code TEXT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS quad_class      SMALLINT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS num_mentions    INT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS num_sources     INT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS num_articles    INT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS event_date      DATE;

SELECT create_hypertable('gdelt_events', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('gdelt_events', INTERVAL '7 days');
ALTER TABLE gdelt_events SET (timescaledb.compress, timescaledb.compress_segmentby = 'event_id');
SELECT add_compression_policy('gdelt_events', INTERVAL '1 day');

CREATE INDEX IF NOT EXISTS ix_gdelt_geom ON gdelt_events USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_gdelt_time ON gdelt_events (time DESC);
CREATE INDEX IF NOT EXISTS ix_gdelt_tone ON gdelt_events (tone);

-- TABLE: ndbc_obs (NDBC Ocean Buoy Observations — Phase 1 Geospatial)
-- Hypertable for real-time sea state baseline: wave height, water temp, wind.
-- 15-minute cadence, 30-day rolling retention.  Used by Phase 3 fusion queries
-- (vessel risk assessment, sea state anomaly detection via Z-score).
CREATE TABLE IF NOT EXISTS ndbc_obs (
    time        TIMESTAMPTZ NOT NULL,
    buoy_id     TEXT NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    wvht_m      FLOAT,   -- Significant wave height (m)
    wtmp_c      FLOAT,   -- Water surface temperature (°C)
    wspd_ms     FLOAT,   -- Wind speed (m/s)
    wdir_deg    FLOAT,   -- Wind direction (degrees true)
    atmp_c      FLOAT,   -- Air temperature (°C)
    pres_hpa    FLOAT,   -- Atmospheric pressure (hPa)
    geom        GEOMETRY(POINT, 4326)
);

SELECT create_hypertable('ndbc_obs', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('ndbc_obs', INTERVAL '30 days', if_not_exists => TRUE);

ALTER TABLE ndbc_obs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'buoy_id',
    timescaledb.compress_orderby   = 'time DESC'
);
SELECT add_compression_policy('ndbc_obs', INTERVAL '1 day', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS ix_ndbc_obs_geom      ON ndbc_obs USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_ndbc_obs_buoy_time ON ndbc_obs (buoy_id, time DESC);

-- TABLE: peeringdb_ixps (Internet Exchange Points — Initiative B Phase 1)
-- Sourced from PeeringDB public API. 24-hour refresh cadence.
CREATE TABLE IF NOT EXISTS peeringdb_ixps (
    ixp_id      INTEGER PRIMARY KEY,   -- PeeringDB ix.id
    name        TEXT NOT NULL,
    name_long   TEXT,
    city        TEXT,
    country     TEXT,                  -- ISO 3166-1 alpha-2
    website     TEXT,
    lat         DOUBLE PRECISION,
    lon         DOUBLE PRECISION,
    geom        GEOMETRY(POINT, 4326),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_peeringdb_ixps_geom    ON peeringdb_ixps USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_peeringdb_ixps_country ON peeringdb_ixps (country);

-- TABLE: peeringdb_facilities (Data Centers / Colocation Facilities — Initiative B Phase 1)
-- Sourced from PeeringDB public API. 24-hour refresh cadence.
CREATE TABLE IF NOT EXISTS peeringdb_facilities (
    fac_id      INTEGER PRIMARY KEY,   -- PeeringDB fac.id
    name        TEXT NOT NULL,
    city        TEXT,
    country     TEXT,
    website     TEXT,
    org_name    TEXT,
    lat         DOUBLE PRECISION,
    lon         DOUBLE PRECISION,
    geom        GEOMETRY(POINT, 4326),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_peeringdb_fac_geom    ON peeringdb_facilities USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_peeringdb_fac_country ON peeringdb_facilities (country);

-- TABLE: iss_positions (ISS Real-time Position Archive — Initiative B Phase 1)
-- Hypertable; 5-second cadence, 7-day rolling retention.
-- Live position is also cached in Redis key `infra:iss_latest` (60s TTL)
-- and broadcast via Redis pub/sub channel `infrastructure:iss-position`.
CREATE TABLE IF NOT EXISTS iss_positions (
    time            TIMESTAMPTZ NOT NULL,
    lat             DOUBLE PRECISION NOT NULL,
    lon             DOUBLE PRECISION NOT NULL,
    altitude_km     DOUBLE PRECISION,
    velocity_kms    DOUBLE PRECISION,
    geom            GEOMETRY(POINT, 4326)
);

SELECT create_hypertable('iss_positions', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 hour');
SELECT add_retention_policy('iss_positions', INTERVAL '7 days', if_not_exists => TRUE);

ALTER TABLE iss_positions SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('iss_positions', INTERVAL '1 hour', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS ix_iss_positions_time ON iss_positions (time DESC);

-- Continuous aggregate: hourly rolling mean + stddev per buoy
-- Retained for 30 days; used by Phase 3 sea state anomaly queries (Z-score).
CREATE MATERIALIZED VIEW IF NOT EXISTS ndbc_hourly_baseline
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time)  AS hour,
    buoy_id,
    AVG(wvht_m)     AS avg_wvht_m,
    STDDEV(wvht_m)  AS std_wvht_m,
    AVG(wtmp_c)     AS avg_wtmp_c,
    AVG(wspd_ms)    AS avg_wspd_ms,
    COUNT(*)        AS obs_count
FROM ndbc_obs
GROUP BY time_bucket('1 hour', time), buoy_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('ndbc_hourly_baseline',
    start_offset      => INTERVAL '30 days',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists     => TRUE);


-- TABLE: users (Authentication & access control)
-- Stores operator accounts with bcrypt-hashed passwords and role-based access.
-- Roles: viewer (read-only) | operator (read + write) | admin (full access)
CREATE TABLE IF NOT EXISTS users (
    id               SERIAL PRIMARY KEY,
    username         TEXT NOT NULL UNIQUE,
    hashed_password  TEXT NOT NULL,
    role             TEXT NOT NULL DEFAULT 'viewer'
                         CHECK (role IN ('viewer', 'operator', 'admin')),
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Incremented on every password change; embedded as 'pwv' claim in JWTs so
    -- tokens issued before the change are immediately invalidated on next request.
    password_version INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_users_username ON users (username);

-- Migration: add password_version to existing deployments.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_version INT NOT NULL DEFAULT 0;

-- Trigger: keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at'
    ) THEN
        CREATE TRIGGER trg_users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_users_updated_at();
    END IF;
END;
$$;

-- TABLE: clausal_chains (Narrative-structured telemetry)
-- Hypertable storing medial clauses derived from both TAK telemetry and GDELT OSINT.
-- Each row represents a detected state-change in an entity's narrative.
-- Used by AI Router for multi-INT fusion and tactical decision support.
CREATE TABLE IF NOT EXISTS clausal_chains (
    time                    TIMESTAMPTZ NOT NULL,
    uid                     TEXT NOT NULL,
    source                  VARCHAR NOT NULL,  -- 'TAK_ADSB', 'TAK_AIS', 'GDELT'
    predicate_type          TEXT,  -- TAK type code (e.g., 'a-f-A-C-E-I') or GDELT CAMEO code
    locative_lat            DOUBLE PRECISION,
    locative_lon            DOUBLE PRECISION,
    locative_hae            DOUBLE PRECISION,  -- Height Above Ellipsoid (meters)
    state_change_reason     VARCHAR,  -- LOCATION_TRANSITION, TYPE_CHANGE, SPEED_TRANSITION, COURSE_CHANGE, ALTITUDE_CHANGE, BATTERY_CRITICAL
    adverbial_context       JSONB,  -- Variable schema: speed, course, altitude, battery_pct, confidence, state_change_reasons[]
    narrative_summary       TEXT,  -- Human-readable synthesis (filled by AI Router)
    geom                    GEOMETRY(POINT, 4326),  -- PostGIS point for spatial queries
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to Hypertable (Partition by time, 1 day chunks)
SELECT create_hypertable('clausal_chains', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');

-- Enable Compression (7-day lag, compress by UID for better ratio)
ALTER TABLE clausal_chains SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'uid',
    timescaledb.compress_orderby = 'time DESC'
);

-- Add Compression Policy (Compress data older than 7 days)
SELECT add_compression_policy('clausal_chains', INTERVAL '7 days', if_not_exists => TRUE);

-- Add Retention Policy (Keep 90 days for historical analysis)
SELECT add_retention_policy('clausal_chains', INTERVAL '90 days', if_not_exists => TRUE);

-- Indices for common query patterns
CREATE INDEX IF NOT EXISTS ix_clausal_chains_uid_time
    ON clausal_chains (uid, time DESC);

CREATE INDEX IF NOT EXISTS ix_clausal_chains_source_time
    ON clausal_chains (source, time DESC);

CREATE INDEX IF NOT EXISTS ix_clausal_chains_geom
    ON clausal_chains USING GIST (geom);

-- Full-text search on narrative_summary for free-form queries
CREATE INDEX IF NOT EXISTS ix_clausal_chains_narrative_tsvector
    ON clausal_chains USING GIN (to_tsvector('english', COALESCE(narrative_summary, '')));

-- JSONB search on adverbial_context for state-change reason queries
CREATE INDEX IF NOT EXISTS ix_clausal_chains_adverbial
    ON clausal_chains USING GIN (adverbial_context);

-- Continuous Aggregate: hourly_clausal_summaries
-- Groups state-changes by hour and UID, extracting transition patterns.
-- Used by AI Router for regional risk assessment and escalation detection.
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_clausal_summaries
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time)                                      AS hour,
    uid,
    source,
    COUNT(*)                                                          AS state_change_count,
    array_agg(DISTINCT predicate_type)                              AS predicate_types,
    first(locative_lat, time)                                       AS start_lat,
    first(locative_lon, time)                                       AS start_lon,
    last(locative_lat, time)                                        AS end_lat,
    last(locative_lon, time)                                        AS end_lon,
    MAX((adverbial_context->>'confidence')::FLOAT)                  AS max_confidence,
    array_agg(DISTINCT state_change_reason)                         AS state_change_reasons,
    array_agg(DISTINCT (adverbial_context->>'speed')::FLOAT)        AS speeds,
    array_agg(DISTINCT (adverbial_context->>'battery_pct')::FLOAT)  AS battery_levels
FROM clausal_chains
GROUP BY hour, uid, source
WITH NO DATA;

-- Refresh policy for continuous aggregate (auto-refresh hourly)
SELECT add_continuous_aggregate_policy('hourly_clausal_summaries',
    start_offset      => INTERVAL '30 days',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists     => TRUE);

-- Trigger: keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION update_clausal_chains_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clausal_chains_updated_at'
    ) THEN
        CREATE TRIGGER trg_clausal_chains_updated_at
            BEFORE UPDATE ON clausal_chains
            FOR EACH ROW EXECUTE FUNCTION update_clausal_chains_updated_at();
    END IF;
END;
$$;

-- Trigger: populate PostGIS geometry from lat/lon on INSERT/UPDATE
CREATE OR REPLACE FUNCTION update_clausal_chains_geom()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.locative_lat IS NOT NULL AND NEW.locative_lon IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.locative_lon, NEW.locative_lat), 4326);
    END IF;
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clausal_chains_geom'
    ) THEN
        CREATE TRIGGER trg_clausal_chains_geom
            BEFORE INSERT OR UPDATE ON clausal_chains
            FOR EACH ROW EXECUTE FUNCTION update_clausal_chains_geom();
    END IF;
END;
$$;

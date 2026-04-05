-- =============================================================================
-- 06_critical_infrastructure.sql — Physical + logical infrastructure tables
-- =============================================================================
-- infra_towers:       FCC ULS tower registry
-- internet_outages:   IODA regional outage events (7-day)
-- peeringdb_ixps:     Internet Exchange Points (24-hour refresh)
-- peeringdb_facilities: Data center / colo facilities (24-hour refresh)
-- iss_positions:      ISS real-time position archive (5s cadence, 7-day)
-- =============================================================================

-- TABLE: infra_towers
CREATE TABLE IF NOT EXISTS infra_towers (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fcc_id       TEXT UNIQUE,
    type         TEXT,                    -- 'TOWER'|'MAST'|'POLE'
    owner        TEXT,
    status       TEXT,                    -- 'Constructed'|'Granted'
    height_m     DOUBLE PRECISION,
    elevation_m  DOUBLE PRECISION,
    lat          DOUBLE PRECISION NOT NULL,
    lon          DOUBLE PRECISION NOT NULL,
    geom         GEOMETRY(POINT, 4326),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_infra_towers_geom ON infra_towers USING GIST (geom);

-- TABLE: internet_outages (hypertable)
CREATE TABLE IF NOT EXISTS internet_outages (
    time          TIMESTAMPTZ      NOT NULL,
    country_code  VARCHAR(2),
    asn           INTEGER,
    severity      DOUBLE PRECISION,        -- 0.0–1.0
    affected_nets INTEGER,
    asn_name      TEXT,
    geom          GEOMETRY(POINT, 4326)    -- country centroid (approximate)
);

SELECT create_hypertable('internet_outages', 'time',
    if_not_exists      => TRUE,
    chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('internet_outages', INTERVAL '7 days',
    if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS ix_internet_outages_country_time
    ON internet_outages (country_code, time DESC);
CREATE INDEX IF NOT EXISTS ix_internet_outages_severity_time
    ON internet_outages (severity DESC, time DESC);
CREATE INDEX IF NOT EXISTS ix_internet_outages_geom
    ON internet_outages USING GIST (geom);

-- TABLE: peeringdb_ixps
CREATE TABLE IF NOT EXISTS peeringdb_ixps (
    ixp_id      INTEGER PRIMARY KEY,       -- PeeringDB ix.id
    name        TEXT NOT NULL,
    name_long   TEXT,
    city        TEXT,
    country     TEXT,                      -- ISO 3166-1 alpha-2
    website     TEXT,
    lat         DOUBLE PRECISION,
    lon         DOUBLE PRECISION,
    geom        GEOMETRY(POINT, 4326),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_peeringdb_ixps_geom
    ON peeringdb_ixps USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_peeringdb_ixps_country
    ON peeringdb_ixps (country);

-- TABLE: peeringdb_facilities
CREATE TABLE IF NOT EXISTS peeringdb_facilities (
    fac_id      INTEGER PRIMARY KEY,       -- PeeringDB fac.id
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

CREATE INDEX IF NOT EXISTS ix_peeringdb_fac_geom
    ON peeringdb_facilities USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_peeringdb_fac_country
    ON peeringdb_facilities (country);

-- TABLE: iss_positions (hypertable)
-- 5-second cadence; live position also cached in Redis key `infra:iss_latest`.
CREATE TABLE IF NOT EXISTS iss_positions (
    time         TIMESTAMPTZ      NOT NULL,
    lat          DOUBLE PRECISION NOT NULL,
    lon          DOUBLE PRECISION NOT NULL,
    altitude_km  DOUBLE PRECISION,
    velocity_kms DOUBLE PRECISION,
    geom         GEOMETRY(POINT, 4326)
);

SELECT create_hypertable('iss_positions', 'time',
    if_not_exists      => TRUE,
    chunk_time_interval => INTERVAL '1 hour');
SELECT add_retention_policy('iss_positions', INTERVAL '7 days',
    if_not_exists => TRUE);

ALTER TABLE iss_positions SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('iss_positions', INTERVAL '1 hour',
    if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS ix_iss_positions_time ON iss_positions (time DESC);

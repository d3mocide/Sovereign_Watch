-- =============================================================================
-- 03_satellites_satnogs.sql — Orbital catalog + SatNOGS observation data
-- =============================================================================
-- satellites:             latest TLE per NORAD ID (plain lookup, no retention)
-- satnogs_transmitters:   registered downlink/uplink catalog (daily refresh)
-- satnogs_observations:   ground-station pass records (hourly ingest, 30-day)
-- satnogs_signal_events:  signal strength / SIGINT observations (30-day)
-- =============================================================================

-- TABLE: satellites
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

-- TABLE: satnogs_transmitters
CREATE TABLE IF NOT EXISTS satnogs_transmitters (
    uuid            TEXT PRIMARY KEY,
    norad_id        TEXT    NOT NULL,
    sat_name        TEXT,
    description     TEXT,
    alive           BOOLEAN DEFAULT TRUE,
    type            TEXT    DEFAULT 'Transmitter',  -- 'Transmitter'|'Transponder'|'Digitizer'
    uplink_low      BIGINT,
    uplink_high     BIGINT,
    downlink_low    BIGINT,
    downlink_high   BIGINT,
    mode            TEXT,                           -- 'FM'|'BPSK'|'CW'|'USB'|…
    invert          BOOLEAN DEFAULT FALSE,
    baud            FLOAT,
    status          TEXT    DEFAULT 'active',       -- 'active'|'inactive'|'unknown'
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_satnogs_tx_norad ON satnogs_transmitters (norad_id);
CREATE INDEX IF NOT EXISTS ix_satnogs_tx_mode  ON satnogs_transmitters (mode);

-- TABLE: satnogs_observations (hypertable)
CREATE TABLE IF NOT EXISTS satnogs_observations (
    time               TIMESTAMPTZ NOT NULL,
    observation_id     BIGINT      NOT NULL,
    norad_id           TEXT        NOT NULL,
    ground_station_id  INTEGER,
    transmitter_uuid   TEXT,
    frequency          BIGINT,
    mode               TEXT,
    status             TEXT    DEFAULT 'good',      -- 'good'|'bad'|'unknown'
    rise_azimuth       FLOAT,
    set_azimuth        FLOAT,
    max_altitude       FLOAT,
    has_audio          BOOLEAN DEFAULT FALSE,
    has_waterfall      BOOLEAN DEFAULT FALSE,
    vetted_status      TEXT,                        -- 'verified'|'failed'|NULL
    tle0               TEXT,
    tle1               TEXT,
    tle2               TEXT,
    fetched_at         TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable('satnogs_observations', 'time',
    if_not_exists      => TRUE,
    chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('satnogs_observations', INTERVAL '30 days');

CREATE UNIQUE INDEX IF NOT EXISTS ix_satnogs_obs_id_time
    ON satnogs_observations (observation_id, time);
CREATE INDEX IF NOT EXISTS ix_satnogs_obs_norad
    ON satnogs_observations (norad_id, time DESC);
CREATE INDEX IF NOT EXISTS ix_satnogs_obs_station
    ON satnogs_observations (ground_station_id);
CREATE INDEX IF NOT EXISTS ix_satnogs_obs_freq
    ON satnogs_observations (frequency);

-- TABLE: satnogs_signal_events (hypertable)
CREATE TABLE IF NOT EXISTS satnogs_signal_events (
    time                TIMESTAMPTZ      NOT NULL,
    norad_id            INTEGER          NOT NULL,
    ground_station_id   INTEGER,
    ground_station_name TEXT,
    signal_strength     DOUBLE PRECISION,
    observation_start   TIMESTAMPTZ,
    observation_end     TIMESTAMPTZ,
    frequency           DOUBLE PRECISION,
    modulation          TEXT,
    confidence          DOUBLE PRECISION DEFAULT 0.8
);

SELECT create_hypertable('satnogs_signal_events', 'time',
    if_not_exists      => TRUE,
    chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('satnogs_signal_events', INTERVAL '30 days',
    if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS ix_satnogs_signal_norad_time
    ON satnogs_signal_events (norad_id, time DESC);
CREATE INDEX IF NOT EXISTS ix_satnogs_signal_strength_time
    ON satnogs_signal_events (signal_strength, time DESC);
CREATE INDEX IF NOT EXISTS ix_satnogs_signal_station_time
    ON satnogs_signal_events (ground_station_id, time DESC);

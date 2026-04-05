-- =============================================================================
-- 07_space_weather.sql — Space weather, GPS jamming, and aurora context
-- =============================================================================
-- space_weather_kp:      Kp-index time series (NOAA SWPC, 7-day)
-- jamming_events:        GPS degradation zones from ADS-B integrity analysis
-- space_weather_context: Kp/Dst/F10.7 enrichment for AI correlation (30-day)
-- =============================================================================

-- TABLE: space_weather_kp (hypertable)
CREATE TABLE IF NOT EXISTS space_weather_kp (
    time        TIMESTAMPTZ NOT NULL,
    kp          FLOAT       NOT NULL,       -- 0.0–9.0
    kp_fraction FLOAT,
    storm_level TEXT,                       -- 'quiet'|'unsettled'|'active'|'G1'–'G5'
    source      TEXT DEFAULT 'noaa_swpc'    -- 'noaa_swpc_3h'|'noaa_swpc_1m'
);

SELECT create_hypertable('space_weather_kp', 'time',
    if_not_exists      => TRUE,
    chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('space_weather_kp', INTERVAL '7 days');

CREATE INDEX IF NOT EXISTS ix_swkp_time ON space_weather_kp (time DESC);

-- TABLE: jamming_events (hypertable)
-- Stores both active and historical GPS jamming / navigation-integrity events
-- keyed to H3 hex cells.
CREATE TABLE IF NOT EXISTS jamming_events (
    time            TIMESTAMPTZ      NOT NULL,
    h3_index        TEXT             NOT NULL,   -- H3 resolution-6 cell
    centroid_lat    DOUBLE PRECISION,
    centroid_lon    DOUBLE PRECISION,
    confidence      FLOAT,                       -- 0.0–1.0
    affected_count  INTEGER,                     -- aircraft with degraded NIC/NACp
    avg_nic         FLOAT,
    avg_nacp        FLOAT,
    kp_at_event     FLOAT,                       -- Kp at event time (space-wx discriminator)
    active          BOOLEAN DEFAULT TRUE,
    assessment      TEXT                         -- 'jamming'|'space_weather'|'mixed'|'equipment'
);

SELECT create_hypertable('jamming_events', 'time',
    if_not_exists      => TRUE,
    chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('jamming_events', INTERVAL '7 days');

CREATE INDEX IF NOT EXISTS ix_jamming_h3_time
    ON jamming_events (h3_index, time DESC);
CREATE INDEX IF NOT EXISTS ix_jamming_active
    ON jamming_events (active, time DESC);
CREATE INDEX IF NOT EXISTS ix_jamming_centroid
    ON jamming_events USING GIST (
        ST_SetSRID(ST_MakePoint(centroid_lon, centroid_lat), 4326)
    ) WHERE centroid_lat IS NOT NULL AND centroid_lon IS NOT NULL;

-- TABLE: space_weather_context (hypertable)
-- Enhanced context for AI Router correlation: Kp, Dst, F10.7, aurora forecast.
CREATE TABLE IF NOT EXISTS space_weather_context (
    time        TIMESTAMPTZ      NOT NULL,
    kp_index    DOUBLE PRECISION,
    kp_category TEXT,   -- 'quiet'|'unsettled'|'active'|'minor_storm'|'major_storm'
                        -- |'severe_storm'|'extreme_storm'
    dst_index   DOUBLE PRECISION,
    f10_7       DOUBLE PRECISION,
    explanation TEXT
);

SELECT create_hypertable('space_weather_context', 'time',
    if_not_exists      => TRUE,
    chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('space_weather_context', INTERVAL '30 days',
    if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS ix_space_weather_kp_category
    ON space_weather_context (kp_category, time DESC);
CREATE INDEX IF NOT EXISTS ix_space_weather_time
    ON space_weather_context (time DESC);

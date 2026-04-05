-- =============================================================================
-- 09_ocean_ndbc.sql — NDBC ocean buoy observations + hourly baseline aggregate
-- =============================================================================
-- ndbc_obs:              15-minute cadence, 30-day retention
-- ndbc_hourly_baseline:  Continuous aggregate (avg/stddev per buoy per hour)
--                        Used by Phase 3 sea-state anomaly Z-score queries.
-- =============================================================================

-- TABLE: ndbc_obs (hypertable)
CREATE TABLE IF NOT EXISTS ndbc_obs (
    time      TIMESTAMPTZ      NOT NULL,
    buoy_id   TEXT             NOT NULL,
    lat       DOUBLE PRECISION NOT NULL,
    lon       DOUBLE PRECISION NOT NULL,
    wvht_m    FLOAT,   -- significant wave height (m)
    wtmp_c    FLOAT,   -- water surface temperature (°C)
    wspd_ms   FLOAT,   -- wind speed (m/s)
    wdir_deg  FLOAT,   -- wind direction (degrees true)
    atmp_c    FLOAT,   -- air temperature (°C)
    pres_hpa  FLOAT,   -- atmospheric pressure (hPa)
    geom      GEOMETRY(POINT, 4326)
);

SELECT create_hypertable('ndbc_obs', 'time',
    if_not_exists      => TRUE,
    chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('ndbc_obs', INTERVAL '30 days',
    if_not_exists => TRUE);

ALTER TABLE ndbc_obs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'buoy_id',
    timescaledb.compress_orderby   = 'time DESC'
);
SELECT add_compression_policy('ndbc_obs', INTERVAL '1 day',
    if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS ix_ndbc_obs_geom
    ON ndbc_obs USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_ndbc_obs_buoy_time
    ON ndbc_obs (buoy_id, time DESC);

-- CONTINUOUS AGGREGATE: ndbc_hourly_baseline
-- Hourly rolling mean + stddev per buoy; retained 30 days.
CREATE MATERIALIZED VIEW IF NOT EXISTS ndbc_hourly_baseline
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS hour,
    buoy_id,
    AVG(wvht_m)    AS avg_wvht_m,
    STDDEV(wvht_m) AS std_wvht_m,
    AVG(wtmp_c)    AS avg_wtmp_c,
    AVG(wspd_ms)   AS avg_wspd_ms,
    COUNT(*)       AS obs_count
FROM ndbc_obs
GROUP BY time_bucket('1 hour', time), buoy_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('ndbc_hourly_baseline',
    start_offset      => INTERVAL '30 days',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists     => TRUE);

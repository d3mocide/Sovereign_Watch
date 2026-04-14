-- Migration: V004__firms_dark_vessel.sql
-- NASA FIRMS thermal hotspot detections (VIIRS/MODIS) and dark vessel candidates.
--
-- firms_hotspots  — raw thermal detections ingested by space_pulse/sources/firms.py
-- dark_vessel_candidates — computed AIS-gap anomalies (vessels with heat signatures
--                          but no corresponding AIS broadcast within match radius)

-- ---------------------------------------------------------------------------
-- firms_hotspots hypertable
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS firms_hotspots (
    time        TIMESTAMPTZ     NOT NULL,           -- acquisition datetime (UTC)
    latitude    DOUBLE PRECISION NOT NULL,
    longitude   DOUBLE PRECISION NOT NULL,
    geom        GEOMETRY(Point, 4326),
    brightness  DOUBLE PRECISION,                   -- bright_ti4 (VIIRS, Kelvin) or brightness (MODIS, Kelvin)
    frp         DOUBLE PRECISION,                   -- Fire Radiative Power (MW)
    confidence  TEXT,                               -- 'low' | 'nominal' | 'high' (VIIRS) or 0-100 (MODIS)
    satellite   TEXT,                               -- 'SNPP', 'NOAA-20', 'Terra', 'Aqua'
    instrument  TEXT,                               -- 'VIIRS' | 'MODIS'
    source      TEXT,                               -- feed name, e.g. 'VIIRS_SNPP_NRT'
    daynight    CHAR(1),                            -- 'D' day | 'N' night
    scan        DOUBLE PRECISION,                   -- along-scan pixel size (km)
    track       DOUBLE PRECISION,                   -- along-track pixel size (km)
    acq_date    DATE,
    acq_time    TEXT                                -- HHMM string, e.g. '0342'
);

SELECT create_hypertable(
    'firms_hotspots', 'time',
    if_not_exists       => TRUE,
    chunk_time_interval => INTERVAL '6 hours'
);

-- 3-day retention: FIRMS NRT data is only actionable within ~24-48h;
-- 3 days provides a comfortable forensic window without bloating storage.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM timescaledb_information.jobs j
        WHERE j.hypertable_name = 'firms_hotspots'
          AND j.proc_name       = 'policy_retention'
    ) THEN
        PERFORM add_retention_policy('firms_hotspots', INTERVAL '3 days');
    END IF;
END;
$$;

-- Spatial index for PostGIS proximity queries (dark vessel cross-reference)
CREATE INDEX IF NOT EXISTS ix_firms_hotspots_geom
    ON firms_hotspots USING GIST (geom);

-- Deduplication: prevent re-inserting the same FIRMS detection on re-poll.
-- TimescaleDB unique constraints on hypertables MUST include the partitioning column ('time').
ALTER TABLE firms_hotspots
    ADD CONSTRAINT ix_firms_hotspots_dedup
    UNIQUE (time, latitude, longitude, satellite, instrument);

-- Confidence + FRP filter index used by dark vessel detection query
CREATE INDEX IF NOT EXISTS ix_firms_hotspots_frp
    ON firms_hotspots (time DESC, frp, confidence);

-- ---------------------------------------------------------------------------
-- dark_vessel_candidates table
-- ---------------------------------------------------------------------------
-- Computed anomalies: FIRMS hotspot without a matching AIS vessel within
-- DARK_VESSEL_MATCH_RADIUS_NM.  Written by /api/firms/dark-vessels/detect.
-- Not a hypertable — candidate volume is low and forensic retention is longer.

CREATE TABLE IF NOT EXISTS dark_vessel_candidates (
    id                  BIGSERIAL PRIMARY KEY,
    detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hotspot_lat         DOUBLE PRECISION NOT NULL,
    hotspot_lon         DOUBLE PRECISION NOT NULL,
    geom                GEOMETRY(Point, 4326),
    brightness          DOUBLE PRECISION,
    frp                 DOUBLE PRECISION,
    confidence          TEXT,
    satellite           TEXT,
    instrument          TEXT,
    daynight            CHAR(1),
    hotspot_time        TIMESTAMPTZ,                -- original FIRMS acquisition time
    nearest_ais_mmsi    TEXT,                       -- closest AIS vessel MMSI (if any)
    nearest_ais_dist_nm DOUBLE PRECISION,           -- distance to nearest AIS in NM
    risk_score          DOUBLE PRECISION,           -- normalised [0, 1] composite score
    risk_severity       TEXT,                       -- LOW | MEDIUM | HIGH | CRITICAL
    dismissed           BOOLEAN NOT NULL DEFAULT FALSE,
    notes               TEXT
);

CREATE INDEX IF NOT EXISTS ix_dark_vessel_candidates_detected_at
    ON dark_vessel_candidates (detected_at DESC);

CREATE INDEX IF NOT EXISTS ix_dark_vessel_candidates_geom
    ON dark_vessel_candidates USING GIST (geom);

CREATE INDEX IF NOT EXISTS ix_dark_vessel_candidates_risk
    ON dark_vessel_candidates (risk_score DESC, detected_at DESC)
    WHERE dismissed = FALSE;

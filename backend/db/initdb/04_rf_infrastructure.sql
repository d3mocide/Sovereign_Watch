-- =============================================================================
-- 04_rf_infrastructure.sql — RF infrastructure catalog
-- =============================================================================
-- rf_sites:       All fixed RF sites (repeaters, NOAA NWR, public safety, ham)
-- rf_systems:     Trunked public-safety systems (RadioReference)
-- rf_talkgroups:  Talkgroup catalogue (linked to rf_systems)
-- prune_stale_rf_sites(): maintenance function called by historian
-- =============================================================================

-- TABLE: rf_sites
CREATE TABLE IF NOT EXISTS rf_sites (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source       TEXT NOT NULL,            -- 'repeaterbook'|'ard'|'noaa_nwr'|'radioref'
    site_id      TEXT NOT NULL,            -- source-native identifier
    service      TEXT NOT NULL,            -- 'ham'|'gmrs'|'public_safety'|'noaa_nwr'
    callsign     TEXT,
    name         TEXT,
    lat          DOUBLE PRECISION NOT NULL,
    lon          DOUBLE PRECISION NOT NULL,
    output_freq  DOUBLE PRECISION,         -- MHz
    input_freq   DOUBLE PRECISION,         -- MHz
    tone_ctcss   DOUBLE PRECISION,         -- Hz (e.g. 141.3)
    tone_dcs     TEXT,
    modes        TEXT[],                   -- ['FM','DMR','P25','D-Star','Fusion','NXDN','TETRA']
    use_access   TEXT,                     -- 'OPEN'|'CLOSED'|'LINKED'|'PRIVATE'
    status       TEXT DEFAULT 'Unknown',   -- 'On-air'|'Off-air'|'Unknown'
    city         TEXT,
    state        TEXT,
    country      TEXT DEFAULT 'US',
    emcomm_flags TEXT[],                   -- ['ARES','RACES','SKYWARN','CERT','WICEN']
    meta         JSONB,
    geom         GEOMETRY(POINT, 4326),
    fetched_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (source, site_id)
);

CREATE INDEX IF NOT EXISTS ix_rf_sites_geom
    ON rf_sites USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_rf_sites_service
    ON rf_sites (service);
CREATE INDEX IF NOT EXISTS ix_rf_sites_source
    ON rf_sites (source);
CREATE INDEX IF NOT EXISTS ix_rf_sites_callsign
    ON rf_sites USING gin (callsign gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_rf_sites_modes
    ON rf_sites USING GIN (modes);
CREATE INDEX IF NOT EXISTS ix_rf_sites_emcomm
    ON rf_sites USING GIN (emcomm_flags);

-- TABLE: rf_systems
CREATE TABLE IF NOT EXISTS rf_systems (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source     TEXT DEFAULT 'radioref',
    rr_sid     TEXT UNIQUE,                -- RadioReference system ID
    name       TEXT NOT NULL,
    type       TEXT,                       -- 'P25'|'DMR'|'EDACS'|'Motorola'
    state      TEXT,
    county     TEXT,
    meta       JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_rf_systems_state ON rf_systems (state);

-- TABLE: rf_talkgroups
CREATE TABLE IF NOT EXISTS rf_talkgroups (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    system_id   UUID REFERENCES rf_systems(id) ON DELETE CASCADE,
    decimal_id  INTEGER NOT NULL,
    alpha_tag   TEXT,
    description TEXT,
    category    TEXT,                      -- 'Law Dispatch'|'Fire Dispatch'|'EMS'|…
    priority    INTEGER DEFAULT 3,         -- 1=highest, 5=lowest
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (system_id, decimal_id)
);

CREATE INDEX IF NOT EXISTS ix_rf_talkgroups_system ON rf_talkgroups (system_id);
CREATE INDEX IF NOT EXISTS ix_rf_talkgroups_cat    ON rf_talkgroups (category);

-- FUNCTION: prune_stale_rf_sites
-- Removes sites not updated in 30 days (decommissioned/removed from source feed).
-- Called periodically by the API historian background task.
CREATE OR REPLACE FUNCTION prune_stale_rf_sites() RETURNS INTEGER AS $$
DECLARE
    deleted INTEGER;
BEGIN
    DELETE FROM rf_sites WHERE updated_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END;
$$ LANGUAGE plpgsql;

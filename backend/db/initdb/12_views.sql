-- =============================================================================
-- 12_views.sql — Enriched views for AI Router multi-INT correlation
-- =============================================================================
-- clausal_chains_enriched: joins clausal_chains with internet_outages,
--   space_weather_context, and satnogs_signal_events into a single query
--   surface for the AI Router's regional risk assessment queries.
-- =============================================================================

CREATE OR REPLACE VIEW clausal_chains_enriched AS
SELECT
    cc.time,
    cc.uid,
    cc.source,
    cc.predicate_type,
    cc.state_change_reason,
    cc.narrative_summary,
    cc.locative_lat,
    cc.locative_lon,
    -- Internet outage context (±2-hour window)
    io.country_code  AS outage_country,
    io.severity      AS outage_severity,
    io.asn_name      AS outage_asn,
    -- Space weather context (±1-hour window)
    swc.kp_index,
    swc.kp_category,
    swc.dst_index,
    -- SatNOGS signal context (±1-hour window, space assets only)
    CASE WHEN cc.source = 'TAK_ADSB' THEN NULL
         ELSE array_agg(DISTINCT sse.ground_station_name
                        ORDER BY sse.ground_station_name)
    END AS satnogs_stations,
    CASE WHEN cc.source = 'TAK_ADSB' THEN NULL
         ELSE array_agg(DISTINCT sse.signal_strength
                        ORDER BY sse.signal_strength DESC)
    END AS signal_strengths
FROM clausal_chains cc
LEFT JOIN internet_outages io
    ON cc.time >= io.time - INTERVAL '2 hours'
   AND cc.time <= io.time + INTERVAL '2 hours'
LEFT JOIN space_weather_context swc
    ON cc.time >= swc.time - INTERVAL '1 hour'
   AND cc.time <= swc.time + INTERVAL '1 hour'
LEFT JOIN satnogs_signal_events sse
    ON cc.time >= sse.time - INTERVAL '1 hour'
   AND cc.time <= sse.time + INTERVAL '1 hour'
GROUP BY
    cc.uid, cc.time, cc.source, cc.predicate_type, cc.state_change_reason,
    cc.narrative_summary, cc.locative_lat, cc.locative_lon,
    io.country_code, io.severity, io.asn_name,
    swc.kp_index, swc.kp_category, swc.dst_index;

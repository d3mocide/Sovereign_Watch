"""
schema_context.py — LSP-inspired schema context for the AI analyst.

Provides the LLM with semantic meaning for every field it receives from the
database, the same way an LSP server gives an IDE semantic meaning for every
symbol in source code.  Without this, the analyst sees raw numbers with no
units or entity-type taxonomy.
"""

# ---------------------------------------------------------------------------
# Core tracks schema — mirrors backend/db/init.sql
# ---------------------------------------------------------------------------
_TRACKS_SCHEMA = """
TRACKS TABLE SCHEMA (all telemetry entity types):
  time        TIMESTAMPTZ  — UTC timestamp of the observation
  entity_id   TEXT         — Unique identifier (ICAO hex for aviation, MMSI for maritime, SAT-{norad} for orbital)
  type        TEXT         — Entity domain: 'aviation' | 'maritime' | 'orbital'
  lat         FLOAT        — Latitude in decimal degrees (WGS84)
  lon         FLOAT        — Longitude in decimal degrees (WGS84)
  alt         FLOAT        — Altitude in meters MSL (0 = sea level; convert: ft = m × 3.281)
  speed       FLOAT        — Ground speed in meters per second (convert: knots = m/s × 1.944)
  heading     FLOAT        — True heading in degrees (0/360 = North, 90 = East)
  meta        JSONB        — Entity-type-specific fields (see per-type schemas below)
  geom        GEOMETRY     — PostGIS point (SRID 4326), same as lat/lon
"""

# ---------------------------------------------------------------------------
# Per-entity-type meta field schemas
# ---------------------------------------------------------------------------
_AVIATION_META = """
AVIATION meta fields (entity_id = ICAO Mode-S hex, e.g. "A1B2C3"):
  callsign      TEXT   — ATC callsign or flight number (e.g. "UAL123", "N12345")
  flight        TEXT   — IATA flight number if available (e.g. "UA123")
  squawk        TEXT   — Transponder squawk code (octal 0000–7777)
                          7500 = Hijacking, 7600 = Radio failure, 7700 = Emergency
  category      TEXT   — ADS-B emitter category (e.g. "A3" = large aircraft)
  registration  TEXT   — Tail number / aircraft registration (e.g. "N12345")
  aircraft_type TEXT   — ICAO type designator (e.g. "B738" = Boeing 737-800)
  on_ground     BOOL   — True if aircraft is on the ground per ADS-B
"""

_MARITIME_META = """
MARITIME meta fields (entity_id = MMSI, 9-digit vessel identifier):
  mmsi          TEXT   — Maritime Mobile Service Identity (same as entity_id)
  vessel_name   TEXT   — IMO registered vessel name
  ship_type     INT    — ITU ship type code (e.g. 70–79 = cargo, 80–89 = tanker)
  flag          TEXT   — ISO 3166-1 alpha-2 flag state (e.g. "US", "PA", "LR")
  destination   TEXT   — AIS reported destination port
  draught       FLOAT  — Current draught in meters (deeper = heavier cargo load)
  imo           TEXT   — IMO vessel number (permanent, unlike MMSI)
  length        FLOAT  — Vessel length overall in meters
  nav_status    INT    — AIS navigational status (0=underway, 1=anchored, 5=moored)
"""

_ORBITAL_META = """
ORBITAL meta fields (entity_id = SAT-{norad_id}, e.g. "SAT-25544"):
  norad_id        INT    — NORAD catalog number
  satellite_name  TEXT   — Common name (e.g. "ISS (ZARYA)")
  orbit_class     TEXT   — Orbit regime: LEO | MEO | GEO | HEO | SSO
  country_code    TEXT   — Country of origin (ISO 3166-1 alpha-2 or COSPAR code)
  launch_date     TEXT   — ISO 8601 launch date
  object_type     TEXT   — PAYLOAD | ROCKET BODY | DEBRIS | UNKNOWN
"""

# ---------------------------------------------------------------------------
# ASAM incidents schema — mirrors backend/db/init.sql
# ---------------------------------------------------------------------------
_ASAM_SCHEMA = """
ASAM_INCIDENTS TABLE SCHEMA (NGA anti-shipping activity messages):
  reference     TEXT         — NGA unique incident reference (e.g. "2024-001")
  incident_date DATE         — Date of the incident (UTC)
  lat           FLOAT        — Latitude of incident in decimal degrees (WGS84)
  lon           FLOAT        — Longitude of incident in decimal degrees (WGS84)
  hostility     TEXT         — Type of hostile act (e.g. "Robbery", "Kidnapping", "Fired Upon")
  victim        TEXT         — Description of attacked vessel / crew
  nav_area      TEXT         — IMO navigational area code (I–XXI)
  subreg        TEXT         — NGA sub-region code
  description   TEXT         — Full incident narrative from NGA
  threat_score  FLOAT        — Composite threat score 0–10 (severity × recency):
                                Severity:  Kidnapping=10, Fired Upon=8, Robbery=5,
                                           Attempted=3, Boarded=7, Hijacking=9
                                Recency:   ≤30d=1.0, ≤90d=0.7, ≤180d=0.5,
                                           ≤365d=0.3, >365d=0.2
  geom          GEOMETRY     — PostGIS point (SRID 4326)
  ingested_at   TIMESTAMPTZ  — When the record was ingested from NGA API
"""

# ---------------------------------------------------------------------------
# NDBC buoy observations schema — mirrors backend/db/init.sql
# ---------------------------------------------------------------------------
_NDBC_SCHEMA = """
NDBC_OBSERVATIONS TABLE SCHEMA (NOAA/NDBC ocean buoy telemetry):
  time       TIMESTAMPTZ  — UTC observation timestamp (hypertable time column)
  buoy_id    TEXT         — NDBC station identifier (e.g. "41047", "46042")
  lat        FLOAT        — Buoy latitude in decimal degrees (WGS84)
  lon        FLOAT        — Buoy longitude in decimal degrees (WGS84)
  wvht_m     FLOAT        — Significant wave height in meters (NULL if sensor absent)
  wtmp_c     FLOAT        — Sea surface temperature in °C (NULL if sensor absent)
  wspd_ms    FLOAT        — Wind speed in m/s (convert: knots = m/s × 1.944)
  wdir_deg   FLOAT        — Wind direction in degrees true (meteorological: from)
  atmp_c     FLOAT        — Air temperature in °C
  pres_hpa   FLOAT        — Barometric pressure in hPa (standard: ~1013 hPa)
  geom       GEOMETRY     — PostGIS point (SRID 4326)

NDBC_HOURLY_BASELINE VIEW (TimescaleDB continuous aggregate — hourly Z-score baseline):
  buoy_id    TEXT         — Buoy identifier
  bucket     TIMESTAMPTZ  — 1-hour time bucket
  avg_wvht   FLOAT        — Mean wave height for that hour bucket
  std_wvht   FLOAT        — Std dev of wave height (Z-score denominator)
  avg_wtmp   FLOAT        — Mean SST for that hour bucket
  std_wtmp   FLOAT        — Std dev of SST
  avg_wspd   FLOAT        — Mean wind speed
  std_wspd   FLOAT        — Std dev of wind speed
  NOTE: Z-score = (observed - avg) / std. |Z| > 2 = anomalous, > 3 = severe anomaly.
"""

# ---------------------------------------------------------------------------
# Maritime risk API endpoints — Phase 3 fusion
# ---------------------------------------------------------------------------
_MARITIME_RISK_API = """
MARITIME RISK API ENDPOINTS (Phase 3 cross-domain fusion):

GET /api/maritime/risk-assessment?mmsi=&lat=&lon=&radius_nm=&days=
  — Composite maritime threat report for a vessel at (lat,lon)
  — radius_nm: search radius in nautical miles (default 100nm)
  — days: look-back window for ASAM incidents (default 90)
  Response fields:
    threat_label   TEXT   — CRITICAL | HIGH | MEDIUM | LOW
    composite_score FLOAT — 0–10 composite (asam_max×0.7 + 2.0 if sea_anomaly, capped 10)
    asam_incidents []     — Nearby ASAM incidents within radius (reference, hostility, threat_score, distance_nm)
    sea_state_anomaly BOOL — True if any nearby NDBC buoy shows |Z-score| > 2 on wvht/wspd

GET /api/maritime/sea-state-anomaly?lat=&lon=&radius_nm=
  — Returns sea state Z-scores from nearest NDBC buoys within radius
  Response fields:
    buoy_id        TEXT   — NDBC station ID
    wvht_z         FLOAT  — Wave height Z-score vs hourly baseline (NULL if no data)
    wspd_z         FLOAT  — Wind speed Z-score vs hourly baseline (NULL if no data)
    anomaly        BOOL   — True if |wvht_z| > 2 or |wspd_z| > 2

GET /api/asam/incidents?min_lat=&max_lat=&min_lon=&max_lon=&days=&threat_min=&limit=
  — GeoJSON FeatureCollection of ASAM incidents within bbox and filters
  — days: look-back window (default 365), threat_min: minimum threat_score (default 0)
"""

# ---------------------------------------------------------------------------
# Anomaly reference table
# ---------------------------------------------------------------------------
_ANOMALY_REFERENCE = """
ANOMALY INDICATORS TO CHECK:

Aviation:
  - Squawk 7500: Hijacking declaration — highest priority alert
  - Squawk 7600: Loss of radio communications
  - Squawk 7700: General emergency / mayday
  - ADS-B gap: Aircraft disappears from coverage (possible MLAT loss, intentional jamming, or crash)
  - Erratic altitude/speed: Sudden drops or spikes inconsistent with normal flight profiles
  - NORDO + high speed: Military or sensitive aircraft operating without callsign

Maritime:
  - Dark AIS: Vessel stops transmitting (SOLAS violation if >300 GT; common for illicit ops)
  - AIS spoofing: GPS position inconsistent with last known track (circles, teleportation)
  - Flag state mismatch: Vessel operating in waters inconsistent with flag
  - Loitering: Ship maintains position >2h in open ocean with no declared destination
  - Draught change at sea: Significant draught change without port call (STS transfer indicator)
  - nav_status=0 (underway) but speed < 0.5 knots: Possible AIS manipulation

Orbital:
  - Maneuver: Sudden orbital parameter change (delta-V event — rendezvous, inspection, or ASAT)
  - Decay: Altitude dropping faster than natural drag curve
  - Object type DEBRIS in unusual orbit: May indicate recent fragmentation event

Maritime Piracy / ASAM:
  - High threat_score (≥7): Recent kidnapping, hijacking, or fired-upon incident nearby — CRITICAL
  - Cluster of incidents: Multiple ASAM events in same nav_area within 30d — elevated corridor risk
  - Vessel loitering near high-threat nav_area: Cross-correlate AIS dark periods with ASAM hotspots
  - Sea state anomaly (Z > 2) + high ASAM score: Compounding risk — weather may impede response
  - Nav areas with chronic activity: Gulf of Guinea (Nav Area II/XI), Strait of Malacca (XI),
    Horn of Africa / Arabian Sea (Nav Area VIII/IX), Gulf of Mexico approaches (Nav Area IV)

Environmental / Sea State:
  - wvht Z-score > 3: Severe wave height anomaly — search/rescue significantly degraded
  - wspd Z-score > 2: Wind speed anomaly — navigation hazard, affects small vessel stability
  - Combined wvht + wspd anomaly: Developing storm cell or extreme weather event nearby
  - SST (wtmp) anomaly: May indicate upwelling, HAB event, or sensor drift (cross-check pressure)
"""

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_schema_context(entity_type: str | None = None) -> str:
    """
    Return a structured schema context string for injection into the LLM
    system prompt.  Scoped to entity_type when known to reduce token count.

    Args:
        entity_type: 'aviation', 'maritime', 'orbital', 'asam', or None for all types.
    """
    parts = [_TRACKS_SCHEMA.strip()]

    if entity_type == "aviation":
        parts.append(_AVIATION_META.strip())
    elif entity_type == "maritime":
        parts.append(_MARITIME_META.strip())
        parts.append(_NDBC_SCHEMA.strip())
        parts.append(_ASAM_SCHEMA.strip())
        parts.append(_MARITIME_RISK_API.strip())
    elif entity_type == "orbital":
        parts.append(_ORBITAL_META.strip())
    elif entity_type == "asam":
        parts.append(_ASAM_SCHEMA.strip())
        parts.append(_NDBC_SCHEMA.strip())
        parts.append(_MARITIME_RISK_API.strip())
    else:
        parts.append(_AVIATION_META.strip())
        parts.append(_MARITIME_META.strip())
        parts.append(_ORBITAL_META.strip())
        parts.append(_NDBC_SCHEMA.strip())
        parts.append(_ASAM_SCHEMA.strip())
        parts.append(_MARITIME_RISK_API.strip())

    parts.append(_ANOMALY_REFERENCE.strip())
    return "\n\n".join(parts)

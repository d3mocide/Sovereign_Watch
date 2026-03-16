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
"""

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_schema_context(entity_type: str | None = None) -> str:
    """
    Return a structured schema context string for injection into the LLM
    system prompt.  Scoped to entity_type when known to reduce token count.

    Args:
        entity_type: 'aviation', 'maritime', 'orbital', or None for all types.
    """
    parts = [_TRACKS_SCHEMA.strip()]

    if entity_type == "aviation":
        parts.append(_AVIATION_META.strip())
    elif entity_type == "maritime":
        parts.append(_MARITIME_META.strip())
    elif entity_type == "orbital":
        parts.append(_ORBITAL_META.strip())
    else:
        parts.append(_AVIATION_META.strip())
        parts.append(_MARITIME_META.strip())
        parts.append(_ORBITAL_META.strip())

    parts.append(_ANOMALY_REFERENCE.strip())
    return "\n\n".join(parts)

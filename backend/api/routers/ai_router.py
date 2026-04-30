"""
AI Router: Orchestrates multi-INT fusion for autonomous threat detection.
Implements spatial-temporal alignment, sequence evaluation, and escalation detection.
"""

import asyncio
import json
import logging
import math
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

import h3
from fastapi import APIRouter, Query
from pydantic import BaseModel
from sgp4.api import Satrec, jday as sgp4_jday

from services.escalation_detector import EscalationDetector
from services.gdelt_linkage import (
    GDELT_LINKAGE_REASON,
    build_aot_context,
    fetch_linked_gdelt_events,
    format_gdelt_linkage_notes,
)
from services.hmm_trajectory import HMMResult, classify_trajectory
from services.sequence_evaluation_engine import (
    RiskAssessment,
    SequenceEvaluationEngine,
    format_heuristic_fallback_narrative,
)
from services.spatial_temporal_alignment import SpatialTemporalAlignment
from services.stdbscan import detect_clusters
from services.ai_service import AIModelOverloadedError, ai_service
from core.database import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai_router", tags=["AI Router"])

# Lookback hour boundaries for mapping to alignment engine keys
_HOURS_IN_DAY = 24
_HOURS_IN_WEEK = 168

# Maximum concurrent DB evaluations for the heatmap endpoint
_HEATMAP_MAX_CONCURRENCY = 4

# Keep UI interactions responsive even if the model endpoint is slow/unreachable.
_LLM_EVAL_TIMEOUT_SECONDS = 8.0
_SEA_CONTEXT_RADIUS_KM = 400.0
_SEA_CABLE_PROXIMITY_KM = 250.0
_SEA_CABLE_ENDPOINT_MATCH_KM = 75.0
_SPACE_WEATHER_MISSION_KP_THRESHOLD = 5.0


def _compute_gdelt_conflict_score(gdelt_events: List[Dict]) -> float:
    """Derive a lightweight conflict-intensity score from raw GDELT events.

    This provides a non-zero geopolitical baseline in regions with sustained
    conflict-coded GDELT activity, even when TAK anomalies are currently quiet.
    """
    if not gdelt_events:
        return 0.0

    total = len(gdelt_events)
    conflict_events = 0
    material_conflict_events = 0
    tone_values: List[float] = []

    for event in gdelt_events:
        quad_class = event.get("quad_class")
        if quad_class in (3, 4):
            conflict_events += 1
        if quad_class == 4:
            material_conflict_events += 1

        tone = event.get("tone")
        if isinstance(tone, (int, float)):
            tone_values.append(float(tone))

    conflict_ratio = conflict_events / total
    material_ratio = material_conflict_events / total
    avg_tone = (sum(tone_values) / len(tone_values)) if tone_values else 0.0
    hostility = max(0.0, min(1.0, (-avg_tone) / 10.0))

    return min(1.0, 0.6 * conflict_ratio + 0.3 * material_ratio + 0.1 * hostility)


def _build_heuristic_narrative(
    risk_score: float,
    escalation_indicators: List[str],
    gdelt_linkage_notes: Optional[str] = None,
    anomalous_count: int = 0,
    mode: str = "tactical",
    is_sitrep: bool = True,
) -> str:
    return format_heuristic_fallback_narrative(
        heuristic_risk_score=risk_score,
        escalation_indicators=escalation_indicators,
        gdelt_linkage_notes=gdelt_linkage_notes,
        anomalous_count=anomalous_count,
        mode=mode,
        is_sitrep=is_sitrep,
    )


def _coerce_float(value: object) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _space_weather_kp_meets_threshold(kp_value: object) -> bool:
    kp_float = _coerce_float(kp_value)
    return kp_float is not None and kp_float >= _SPACE_WEATHER_MISSION_KP_THRESHOLD


def _sort_gdelt_events_by_linkage_score(gdelt_events: List[Dict]) -> List[Dict]:
    return sorted(
        gdelt_events,
        key=lambda event: float(event.get("linkage_score", 0.0)),
        reverse=True,
    )


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in kilometers between two points."""
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return radius_km * 2 * math.asin(math.sqrt(a))


def _normalize_country_label(value: Optional[str]) -> str:
    """Normalize country labels for loose cross-source matching."""
    if not value:
        return ""
    chars = [char.lower() if char.isalnum() else " " for char in value]
    return " ".join("".join(chars).split())


def _extract_station_country(name: Optional[str]) -> str:
    """Extract the country token from a landing-point display name."""
    if not name:
        return ""
    parts = [part.strip() for part in str(name).split(",") if part.strip()]
    return parts[-1] if parts else ""


def _h3_region_center(h3_region: str) -> Optional[Tuple[float, float]]:
    """Return the center point of an H3 cell as (lat, lon)."""
    try:
        lat, lon = h3.cell_to_latlng(h3_region)
        return float(lat), float(lon)
    except Exception as exc:
        logger.warning("Invalid H3 cell '%s' for sea analysis: %s", h3_region, exc)
        return None


def _jday_from_datetime(dt: datetime) -> Tuple[float, float]:
    """Return the SGP4 Julian day pair for a UTC datetime."""
    utc_dt = dt.astimezone(timezone.utc)
    return sgp4_jday(
        utc_dt.year,
        utc_dt.month,
        utc_dt.day,
        utc_dt.hour,
        utc_dt.minute,
        utc_dt.second + utc_dt.microsecond / 1e6,
    )


def _point_in_h3_region(lat: float, lon: float, h3_region: str) -> bool:
    """Return whether a lat/lon pair falls within the target H3 cell."""
    try:
        resolution = h3.get_resolution(h3_region)
        return h3.latlng_to_cell(lat, lon, resolution) == h3_region
    except Exception as exc:
        logger.warning("Invalid H3 region '%s' for orbital relevance: %s", h3_region, exc)
        return False


def _satellite_subpoint_for_time(
    tle_line1: str,
    tle_line2: str,
    event_time: datetime,
) -> Optional[Tuple[float, float]]:
    """Propagate a satellite TLE to the event time and return its subpoint."""
    try:
        satrec = Satrec.twoline2rv(tle_line1, tle_line2)
        jd, fr = _jday_from_datetime(event_time)
        err, position_teme, _ = satrec.sgp4(jd, fr)
        if err != 0:
            return None
        position_ecef = _teme_to_ecef(position_teme, jd, fr)
        lat, lon, _ = _ecef_to_lla(position_ecef)
        return lat, lon
    except Exception as exc:
        logger.debug("Failed to propagate satellite subpoint: %s", exc)
        return None


def _teme_to_ecef(
    r_teme: Tuple[float, float, float],
    jd: float,
    fr: float,
) -> Tuple[float, float, float]:
    """Rotate a TEME position vector into ECEF using GMST."""
    d = (jd - 2451545.0) + fr
    gmst = (18.697374558 + 24.06570982441908 * d) % 24.0
    theta = gmst * 15.0 * math.pi / 180.0

    cos_t = math.cos(theta)
    sin_t = math.sin(theta)

    x, y, z = r_teme
    return (
        x * cos_t + y * sin_t,
        -x * sin_t + y * cos_t,
        z,
    )


def _ecef_to_lla(r_ecef: Tuple[float, float, float]) -> Tuple[float, float, float]:
    """Convert a single ECEF point in km to geodetic lat, lon, alt."""
    x, y, z = r_ecef
    a = 6378.137
    e2 = 0.00669437999014
    b = a * math.sqrt(1 - e2)
    ep2 = (a**2 - b**2) / b**2

    p = math.sqrt(x**2 + y**2)
    th = math.atan2(a * z, b * p)

    lon = math.atan2(y, x)
    lat = math.atan2(
        z + ep2 * b * math.sin(th) ** 3,
        p - e2 * a * math.cos(th) ** 3,
    )

    n = a / math.sqrt(1 - e2 * math.sin(lat) ** 2)
    safe_lat = max(min(lat, math.pi / 2 - 1e-9), -math.pi / 2 + 1e-9)
    alt = p / math.cos(safe_lat) - n

    return math.degrees(lat), math.degrees(lon), alt


async def _fetch_aot_relevant_satnogs_events(
    conn,
    *,
    h3_region: Optional[str] = None,
    center_lat: Optional[float] = None,
    center_lon: Optional[float] = None,
    radius_nm: Optional[float] = None,
    lookback_hours: int,
    signal_threshold: float = -10.0,
    limit: int = 10,
    candidate_limit: int = 40,
) -> List[Dict]:
    """Return only SatNOGS signal-loss events whose satellite subpoint matches the mission AOT."""
    if not h3_region and (
        center_lat is None or center_lon is None or radius_nm is None
    ):
        return []

    candidate_rows = await conn.fetch(
        """
        SELECT norad_id, ground_station_name, signal_strength, time, modulation, frequency
        FROM satnogs_signal_events
        WHERE time > now() - ($1 * interval '1 hour')
          AND signal_strength < $2
        ORDER BY signal_strength ASC, time DESC
        LIMIT $3
        """,
        lookback_hours,
        signal_threshold,
        candidate_limit,
    )
    if not candidate_rows:
        return []

    norad_ids = sorted({int(row["norad_id"]) for row in candidate_rows if row.get("norad_id") is not None})
    if not norad_ids:
        return []

    satellite_rows = await conn.fetch(
        """
        SELECT norad_id, tle_line1, tle_line2
        FROM satellites
        WHERE norad_id = ANY($1::int[])
        """,
        norad_ids,
    )
    tle_by_norad = {
        int(row["norad_id"]): (row["tle_line1"], row["tle_line2"])
        for row in satellite_rows
        if row.get("tle_line1") and row.get("tle_line2")
    }

    relevant_events: List[Dict] = []
    for row in candidate_rows:
        norad_id = row.get("norad_id")
        if norad_id is None:
            continue
        tle = tle_by_norad.get(int(norad_id))
        if not tle:
            continue

        event_time = row["time"]
        if not isinstance(event_time, datetime):
            continue

        subpoint = _satellite_subpoint_for_time(tle[0], tle[1], event_time)
        if not subpoint:
            continue
        subpoint_lat, subpoint_lon = subpoint

        if h3_region:
            if not _point_in_h3_region(subpoint_lat, subpoint_lon, h3_region):
                continue
            linkage_reason = "orbital_subpoint_in_aot"
        else:
            distance_km = haversine_km(subpoint_lat, subpoint_lon, center_lat, center_lon)
            if distance_km > radius_nm * 1.852:
                continue
            linkage_reason = "orbital_subpoint_in_radius"

        relevant_events.append(
            {
                "time": event_time,
                "norad_id": int(norad_id),
                "ground_station_name": row.get("ground_station_name"),
                "signal_strength": row.get("signal_strength"),
                "modulation": row.get("modulation"),
                "frequency": row.get("frequency"),
                "subpoint_lat": round(subpoint_lat, 4),
                "subpoint_lon": round(subpoint_lon, 4),
                "scope": "mission_area",
                "linkage_reason": linkage_reason,
            }
        )
        if len(relevant_events) >= limit:
            break

    return relevant_events


def _flatten_line_strings(geometry: Dict) -> List[List[List[float]]]:
    """Return coordinate sequences for LineString or MultiLineString geometries."""
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if geom_type == "LineString":
        return [coords] if len(coords) >= 2 else []
    if geom_type == "MultiLineString":
        return [line for line in coords if len(line) >= 2]
    return []


def _select_nearby_ndbc_features(
    ndbc_data: Dict,
    region_lat: float,
    region_lon: float,
    max_distance_km: float = _SEA_CONTEXT_RADIUS_KM,
) -> List[Dict]:
    """Filter cached NDBC observations down to the mission area."""
    nearby_features: List[Dict] = []
    for feature in ndbc_data.get("features", []):
        geometry = feature.get("geometry", {})
        coords = geometry.get("coordinates") or []
        properties = feature.get("properties", {})
        if len(coords) < 2:
            continue
        wave_height = properties.get("wvht_m")
        if wave_height is None:
            continue
        buoy_lon, buoy_lat = coords[0], coords[1]
        distance_km = haversine_km(region_lat, region_lon, buoy_lat, buoy_lon)
        if distance_km > max_distance_km:
            continue
        nearby_features.append(
            {
                "buoy_id": properties.get("buoy_id"),
                "wvht_m": float(wave_height),
                "distance_km": round(distance_km, 1),
                "time": properties.get("time"),
            }
        )
    nearby_features.sort(key=lambda feature: feature["distance_km"])
    return nearby_features


def _derive_cable_relevant_countries(
    stations_data: Dict,
    cables_data: Dict,
    region_lat: float,
    region_lon: float,
) -> Set[str]:
    """Infer landing countries relevant to the AOT from nearby landings and cables."""
    station_points: List[Dict] = []
    relevant_countries: Set[str] = set()

    for feature in stations_data.get("features", []):
        geometry = feature.get("geometry", {})
        coords = geometry.get("coordinates") or []
        if geometry.get("type") != "Point" or len(coords) < 2:
            continue
        name = feature.get("properties", {}).get("name", "")
        country = _extract_station_country(name)
        station = {
            "name": name,
            "country": country,
            "lat": float(coords[1]),
            "lon": float(coords[0]),
        }
        station_points.append(station)
        if country and haversine_km(region_lat, region_lon, station["lat"], station["lon"]) <= _SEA_CABLE_PROXIMITY_KM:
            relevant_countries.add(country)

    if not station_points:
        return relevant_countries

    for cable_feature in cables_data.get("features", []):
        line_strings = _flatten_line_strings(cable_feature.get("geometry", {}))
        if not line_strings:
            continue

        min_distance_km: Optional[float] = None
        endpoints: List[List[float]] = []
        for line in line_strings:
            endpoints.append(line[0])
            endpoints.append(line[-1])
            for point in line:
                if len(point) < 2:
                    continue
                point_lon, point_lat = point[0], point[1]
                point_distance = haversine_km(region_lat, region_lon, point_lat, point_lon)
                min_distance_km = point_distance if min_distance_km is None else min(min_distance_km, point_distance)

        if min_distance_km is None or min_distance_km > _SEA_CABLE_PROXIMITY_KM:
            continue

        for endpoint in endpoints:
            if len(endpoint) < 2:
                continue
            endpoint_lon, endpoint_lat = endpoint[0], endpoint[1]
            for station in station_points:
                if not station["country"]:
                    continue
                if haversine_km(endpoint_lat, endpoint_lon, station["lat"], station["lon"]) <= _SEA_CABLE_ENDPOINT_MATCH_KM:
                    relevant_countries.add(station["country"])

    return relevant_countries


def _filter_cable_correlated_outages(
    outages_data: Dict,
    relevant_countries: Set[str],
) -> List[Dict]:
    """Return only outages tied to landing countries relevant to the mission area."""
    normalized_countries = {
        _normalize_country_label(country)
        for country in relevant_countries
        if _normalize_country_label(country)
    }
    correlated: List[Dict] = []
    for feature in outages_data.get("features", []):
        properties = feature.get("properties", {})
        if not properties.get("nearby_cable_landings"):
            continue
        country_name = properties.get("country") or properties.get("region")
        if _normalize_country_label(country_name) not in normalized_countries:
            continue
        correlated.append(
            {
                "country": country_name,
                "country_code": properties.get("country_code"),
                "severity": properties.get("severity"),
                "landing_count": len(properties.get("nearby_cable_landings") or []),
            }
        )
    correlated.sort(
        key=lambda outage: (
            -(float(outage["severity"]) if outage.get("severity") is not None else 0.0),
            str(outage.get("country") or ""),
        )
    )
    return correlated


def _derive_cable_relevant_countries_from_index(
    cable_index: Dict,
    cables_data: Dict,
    region_lat: float,
    region_lon: float,
) -> Set[str]:
    """Infer AOT-relevant landing countries from persisted cable-country topology."""
    relevant_country_keys: Set[str] = set()
    cable_entries = cable_index.get("cables", {}) if isinstance(cable_index, dict) else {}
    country_entries = cable_index.get("countries", {}) if isinstance(cable_index, dict) else {}

    for cable_feature in cables_data.get("features", []):
        cable_props = cable_feature.get("properties", {})
        cable_id = cable_props.get("id") or cable_props.get("feature_id") or cable_props.get("name")
        if not cable_id:
            continue
        min_distance_km: Optional[float] = None
        for line in _flatten_line_strings(cable_feature.get("geometry", {})):
            for point in line:
                if len(point) < 2:
                    continue
                point_lon, point_lat = point[0], point[1]
                point_distance = haversine_km(region_lat, region_lon, point_lat, point_lon)
                min_distance_km = point_distance if min_distance_km is None else min(min_distance_km, point_distance)

        if min_distance_km is None or min_distance_km > _SEA_CABLE_PROXIMITY_KM:
            continue

        for country_key in cable_entries.get(cable_id, {}).get("countries", []):
            if country_key in country_entries:
                relevant_country_keys.add(country_key)

    for country_key, country_entry in country_entries.items():
        for station in country_entry.get("station_points", []):
            station_lat = station.get("lat")
            station_lon = station.get("lon")
            if station_lat is None or station_lon is None:
                continue
            if haversine_km(region_lat, region_lon, float(station_lat), float(station_lon)) <= _SEA_CABLE_PROXIMITY_KM:
                relevant_country_keys.add(country_key)
                break

    return {
        country_entries[country_key].get("country", country_key)
        for country_key in relevant_country_keys
        if country_key in country_entries
    }


def _derive_relevant_outage_country_codes(
    outages_data: Dict,
    relevant_countries: Set[str],
) -> Set[str]:
    """Map cable-relevant country names back to outage country codes."""
    normalized_countries = {
        _normalize_country_label(country)
        for country in relevant_countries
        if _normalize_country_label(country)
    }
    if not normalized_countries:
        return set()

    outage_country_codes: Set[str] = set()
    for feature in outages_data.get("features", []):
        properties = feature.get("properties", {})
        country_name = properties.get("country") or properties.get("region")
        if _normalize_country_label(country_name) not in normalized_countries:
            continue
        country_code = properties.get("country_code")
        if country_code:
            outage_country_codes.add(str(country_code))
    return outage_country_codes


class EvaluationRequest(BaseModel):
    """Request for regional escalation evaluation."""

    h3_region: str  # H3-7 hexagonal cell
    lookback_hours: int = 24
    mode: str = "tactical"
    include_gdelt: bool = True
    include_tak: bool = True
    # When True the LLM narrative step is skipped (used internally for heatmaps
    # to avoid fanning out N LLM calls per heatmap request).
    lightweight: bool = False
    is_sitrep: bool = False


class RiskAssessmentResponse(BaseModel):
    """Response with risk assessment."""

    h3_region_id: str
    risk_score: float
    narrative_summary: str
    anomalous_uids: List[str]
    escalation_indicators: List[str]
    confidence: float
    pattern_detected: bool
    anomaly_count: int
    source_scope: Optional[Dict] = None


def _h3_cell_to_wkt(h3_cell: str) -> Optional[str]:
    """Convert an H3 cell ID to a WKT POLYGON string suitable for PostGIS.

    Returns ``None`` when the cell ID is invalid so callers can skip the
    spatial filter rather than raising an exception.
    """
    try:
        boundary = h3.cell_to_boundary(h3_cell)  # list of (lat, lon) tuples
        # PostGIS WKT expects (lon lat) ordering; close the ring
        coords = [(lon, lat) for lat, lon in boundary]
        coords.append(coords[0])
        ring = ", ".join(f"{lon} {lat}" for lon, lat in coords)
        return f"POLYGON(({ring}))"
    except Exception as exc:
        logger.warning("Invalid H3 cell '%s': %s", h3_cell, exc)
        return None


def _build_spatial_filter_clause(
    geom_expr: str,
    *,
    region: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radius_nm: Optional[float] = None,
    start_param_idx: int = 1,
) -> Tuple[Optional[str], List[object], int, str]:
    """Build a reusable spatial SQL predicate for H3 or radius AOT filters."""
    if lat is not None and lon is not None and radius_nm is not None:
        radius_m = radius_nm * 1852.0
        clause = (
            f"ST_DWithin("
            f"  {geom_expr}::geography,"
            f"  ST_SetSRID(ST_MakePoint(${start_param_idx + 1}, ${start_param_idx}), 4326)::geography,"
            f"  ${start_param_idx + 2}"
            f")"
        )
        return clause, [lat, lon, radius_m], start_param_idx + 3, "radius"

    if region:
        wkt_polygon = _h3_cell_to_wkt(region)
        if wkt_polygon:
            clause = f"ST_Within({geom_expr}, ST_GeomFromText(${start_param_idx}, 4326))"
            return clause, [wkt_polygon], start_param_idx + 1, "h3"
        logger.warning("Invalid H3 region '%s' – skipping spatial filter", region)

    return None, [], start_param_idx, "global"


def _build_scope_descriptor(
    scope: str,
    linkage_reason: str,
    *,
    lookback_hours: Optional[int] = None,
    time_scope: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict:
    """Build a consistent source-scope metadata payload."""
    descriptor: Dict[str, object] = {
        "scope": scope,
        "linkage_reason": linkage_reason,
    }
    if lookback_hours is not None:
        descriptor["lookback_hours"] = lookback_hours
    if time_scope is not None:
        descriptor["time_scope"] = time_scope
    if notes:
        descriptor["notes"] = notes
    return descriptor


def _parse_adverbial_context(value: object) -> Dict:
    """Safely coerce an adverbial_context DB value to a plain dict.

    asyncpg returns JSONB columns as either a pre-parsed dict (normal case)
    or a raw JSON string (can happen when the column was inserted as text).
    Calling ``dict()`` on a string raises the misleading
    'dictionary update sequence element #0 has length 1' error because Python
    iterates the string's characters instead of key-value pairs.
    """
    if not value:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except (json.JSONDecodeError, TypeError):
            return {}
    # asyncpg Record or other mapping
    try:
        return dict(value)
    except Exception:
        return {}


@router.post("/evaluate")
async def evaluate_regional_escalation(
    request: EvaluationRequest,
) -> RiskAssessmentResponse:
    """
    Evaluate escalation risk for a specific H3 region.

    Queries clausal_chains table for both TAK and GDELT events,
    applies spatial-temporal alignment, detects patterns, and routes through LLM.

    Args:
        request: EvaluationRequest with region and parameters

    Returns:
        RiskAssessmentResponse with structured risk evaluation
    """
    logger.info(
        f"🧠 [UNIFIED-BRAIN] Evaluating region {request.h3_region} with {request.lookback_hours}h lookback"
    )

    # Initialize services
    alignment_engine = SpatialTemporalAlignment()
    escalation_detector = EscalationDetector()

    # Fetch clausal chains and context data from database
    async with db.pool.acquire() as conn:
        # Query clausal_chains for TAK and GDELT data
        lookback_hours = request.lookback_hours

        # Build spatial filter from H3 cell using the GIST index on clausal_chains.geom
        wkt_polygon = _h3_cell_to_wkt(request.h3_region)

        # GDELT events – sourced from gdelt_events with aliases expected by
        # SpatialTemporalAlignment (event_latitude/event_longitude/event_date).
        gdelt_events = []
        gdelt_linkage_counts = {
            "in_aot": 0,
            "state_actor": 0,
            "cable_infra": 0,
            "chokepoint": 0, "alliance_support": 0, "basing_support": 0, "second_order_neighbor": 0,
        }
        if request.include_gdelt:
            if wkt_polygon:
                linkage_result = await fetch_linked_gdelt_events(
                    conn,
                    db.redis_client,
                    h3_region=request.h3_region,
                    lookback_hours=lookback_hours,
                )
                gdelt_events = _sort_gdelt_events_by_linkage_score(linkage_result.events)
                gdelt_linkage_counts = linkage_result.linkage_counts
            else:
                gdelt_query = """
                    SELECT
                        event_id AS event_id_cnty,
                        to_char(COALESCE(event_date, time::date), 'YYYYMMDD') AS event_date,
                        lat AS event_latitude,
                        lon AS event_longitude,
                        event_code,
                        headline AS event_text,
                        actor1_country,
                        actor2_country,
                        quad_class,
                        tone,
                        goldstein
                    FROM gdelt_events
                    WHERE time > now() - ($1 * interval '1 hour')
                    ORDER BY time DESC
                """
                rows = await conn.fetch(gdelt_query, lookback_hours)
                gdelt_events = [dict(row) for row in rows]

        # TAK events – filtered to the H3 region when possible
        tak_events = []
        if request.include_tak:
            if wkt_polygon:
                tak_query = """
                    SELECT time, uid, source, predicate_type, locative_lat, locative_lon,
                           state_change_reason, narrative_summary, adverbial_context
                    FROM clausal_chains
                    WHERE source IN ('TAK_ADSB', 'TAK_AIS')
                      AND time > now() - ($1 * interval '1 hour')
                      AND ST_Within(geom, ST_GeomFromText($2, 4326))
                    ORDER BY time DESC
                """
                rows = await conn.fetch(tak_query, lookback_hours, wkt_polygon)
            else:
                tak_query = """
                    SELECT time, uid, source, predicate_type, locative_lat, locative_lon,
                           state_change_reason, narrative_summary, adverbial_context
                    FROM clausal_chains
                    WHERE source IN ('TAK_ADSB', 'TAK_AIS')
                      AND time > now() - ($1 * interval '1 hour')
                    ORDER BY time DESC
                """
                rows = await conn.fetch(tak_query, lookback_hours)
            tak_events = [dict(row) for row in rows]

        # Fetch context data for multi-INT correlation
        # Internet outages (most recent in window)
        outage_data = None
        if wkt_polygon:
            outage_query = """
                SELECT time, country_code, severity, asn_name, affected_nets
                FROM internet_outages
                WHERE time > now() - ($1 * interval '1 hour')
                  AND ST_Within(geom, ST_GeomFromText($2, 4326))
                ORDER BY severity DESC, time DESC
                LIMIT 1
            """
            outage_row = await conn.fetchrow(outage_query, lookback_hours, wkt_polygon)
        else:
            outage_query = """
                SELECT time, country_code, severity, asn_name, affected_nets
                FROM internet_outages
                WHERE time > now() - ($1 * interval '1 hour')
                ORDER BY severity DESC, time DESC
                LIMIT 1
            """
            outage_row = await conn.fetchrow(outage_query, lookback_hours)
        if outage_row:
            outage_data = dict(outage_row)

        # Space weather context (most significant event in window)
        space_weather_data = None
        space_weather_query = """
            SELECT time, kp_index, kp_category, dst_index, explanation
            FROM space_weather_context
            WHERE time > now() - ($1 * interval '1 hour')
            ORDER BY kp_index DESC, time DESC
            LIMIT 1
        """
        space_weather_row = await conn.fetchrow(space_weather_query, lookback_hours)
        if space_weather_row:
            space_weather_data = dict(space_weather_row)

        # SatNOGS signal events — mission-area filtered when a polygon is available,
        # otherwise fall back to the global feed.
        _satnogs_mission_scoped = False
        if wkt_polygon:
            signal_events = await _fetch_aot_relevant_satnogs_events(
                conn,
                h3_region=request.h3_region,
                lookback_hours=lookback_hours,
            )
            _satnogs_mission_scoped = True
        else:
            signal_query = """
                SELECT time, norad_id, ground_station_name, signal_strength, modulation, frequency
                FROM satnogs_signal_events
                WHERE time > now() - ($1 * interval '1 hour')
                  AND signal_strength < $2
                ORDER BY signal_strength ASC, time DESC
                LIMIT 10
            """
            signal_rows = await conn.fetch(signal_query, lookback_hours, -10.0)
            signal_events = [dict(row) for row in signal_rows]

    source_scope = {
        "tak": _build_scope_descriptor(
            "mission_area" if wkt_polygon else "global",
            "h3_intersection" if wkt_polygon else "missing_spatial_filter",
            lookback_hours=lookback_hours,
        ),
        "gdelt": _build_scope_descriptor(
            (
                "global"
                if not wkt_polygon
                else (
                    "impact_linked_external"
                    if sum(gdelt_linkage_counts.values()) > gdelt_linkage_counts["in_aot"]
                    and gdelt_linkage_counts["in_aot"] == 0
                    else "mission_area"
                )
            ),
            GDELT_LINKAGE_REASON if wkt_polygon else "missing_spatial_filter",
            lookback_hours=lookback_hours,
            notes=(
                format_gdelt_linkage_notes(gdelt_linkage_counts)
                if wkt_polygon
                else None
            ),
        ),
        "internet_outages": _build_scope_descriptor(
            "mission_area" if wkt_polygon else "global",
            "h3_intersection" if wkt_polygon else "missing_spatial_filter",
            lookback_hours=lookback_hours,
        ),
        "space_weather": _build_scope_descriptor(
            "impact_linked_external",
            "global_propagation",
            lookback_hours=lookback_hours,
        ),
        "satnogs": _build_scope_descriptor(
            "mission_area" if _satnogs_mission_scoped else "global",
            "satellite_subpoint_intersection" if _satnogs_mission_scoped else "ungated_signal_loss_feed",
            lookback_hours=lookback_hours,
        ),
    }

    # Check space-weather signal-loss suppression key (set by NOAA-scales poller
    # when R3+ Radio Blackout or G3+ Geomagnetic Storm is active).  When suppressed,
    # skip signal-loss detection to avoid false-positive jamming/interference alerts.
    import json as _json
    _suppression_raw = await db.redis_client.get("space_weather:suppress_signal_loss") if db.redis_client else None
    _suppression_payload = _json.loads(_suppression_raw) if _suppression_raw else None
    _signal_loss_suppressed = EscalationDetector.should_suppress_signal_loss(_suppression_payload)
    if _signal_loss_suppressed:
        logger.warning(
            "Signal-loss detection SUPPRESSED for region %s — active space weather: %s",
            request.h3_region,
            _suppression_payload.get("reason", "unknown") if _suppression_payload else "",
        )

    gdelt_conflict_score = _compute_gdelt_conflict_score(gdelt_events)

    # Map lookback_hours to one of the keys that SpatialTemporalAlignment.LOOKBACK_WINDOWS
    # recognises.  Passing an unsupported value (e.g. '168h') silently fell back to '24h',
    # making the 7-day option ineffective.
    if request.lookback_hours <= _HOURS_IN_DAY:
        lookback_window_key = "24h"
    elif request.lookback_hours <= _HOURS_IN_WEEK:
        lookback_window_key = "7d"
    else:
        lookback_window_key = "30d"

    # Align clauses spatially/temporally
    aligned = await alignment_engine.align_clauses(
        h3_region=request.h3_region,
        clausal_chains=tak_events,
        gdelt_events=gdelt_events,
        lookback_window=lookback_window_key,
    )

    # Detect escalation patterns in GDELT
    pattern_match, pattern_confidence = escalation_detector.detect_pattern(
        [
            {
                "event_code": clause.predicate_type,
                "narrative": clause.narrative,
            }
            for clause in aligned.gdelt_clauses
        ]
    )

    # Detect TAK anomalies
    tak_dicts = [
        {
            "uid": clause.uid,
            "locative_lat": clause.lat,
            "locative_lon": clause.lon,
            # Prefer actual adverbial_context from the clause if available; otherwise use the legacy placeholder
            "adverbial_context": getattr(clause, "adverbial_context", None)
            or {"course": 0.0},
        }
        for clause in aligned.tak_clauses
    ]

    clustering_anomaly = escalation_detector.detect_anomaly_concentration(
        tak_dicts, request.h3_region
    )
    directional_anomalies = escalation_detector.detect_directional_anomalies(tak_dicts)
    emergency_anomalies = escalation_detector.detect_emergency_transponders(tak_dicts)
    rendezvous_anomalies = escalation_detector.detect_rendezvous(tak_dicts)

    # Phase 2 — ST-DBSCAN clustering over raw TAK rows (carry locative_hae for HMM)
    stdbscan_clauses = [
        {
            "uid": row["uid"],
            "locative_lat": row["locative_lat"],
            "locative_lon": row["locative_lon"],
            "time": row["time"],
        }
        for row in tak_events
        if row.get("uid") and row.get("locative_lat") is not None and row.get("locative_lon") is not None
    ]
    stdbscan_anomalies = escalation_detector.detect_stdbscan_clusters(stdbscan_clauses)

    # Build per-UID track sequences for HMM (use raw tak_events for locative_hae)
    _uid_tracks: Dict[str, list] = {}
    for row in tak_events:
        uid = row.get("uid")
        if not uid:
            continue
        ctx = row.get("adverbial_context") or {}
        if isinstance(ctx, str):
            try:
                ctx = json.loads(ctx)
            except (json.JSONDecodeError, TypeError):
                ctx = {}
        _uid_tracks.setdefault(uid, []).append(
            {
                "speed_kts": float(ctx.get("speed") or 0.0),
                "heading_deg": float(ctx.get("course") or 0.0),
                "alt_ft": float(row.get("locative_hae") or 0.0) * 3.28084,
                "time": row["time"],
            }
        )
    for uid in _uid_tracks:
        _uid_tracks[uid].sort(key=lambda p: p["time"])

    hmm_anomalies = escalation_detector.detect_hmm_anomalies(_uid_tracks)

    all_anomalies = (
        [clustering_anomaly]
        + directional_anomalies
        + emergency_anomalies
        + rendezvous_anomalies
        + stdbscan_anomalies
        + hmm_anomalies
    )
    active_anomalies = [a for a in all_anomalies if a.score > 0.0]
    anomaly_score = max([a.score for a in all_anomalies], default=0.0)
    anomalous_uids = []
    for anomaly in active_anomalies:
        anomalous_uids.extend(anomaly.affected_uids)
    anomalous_uids = list(set(anomalous_uids))

    # Detect contextual anomalies (multi-INT correlation)
    context_anomalies = []

    # Internet outage correlation
    if outage_data:
        outage_anomaly = escalation_detector.detect_internet_outage_correlation(
            outage_data
        )
        context_anomalies.append(outage_anomaly)
        logger.info(f"Detected internet outage: {outage_anomaly.description}")

    # Space weather correlation
    if space_weather_data:
        space_weather_anomaly = escalation_detector.detect_space_weather_anomaly(
            space_weather_data.get("kp_index")
        )
        context_anomalies.append(space_weather_anomaly)
        logger.info(f"Space weather context: {space_weather_anomaly.description}")

    # Satellite signal loss detection — skipped when space weather suppression is active
    if signal_events and not _signal_loss_suppressed:
        signal_anomalies = escalation_detector.detect_satnogs_signal_loss(signal_events)
        context_anomalies.extend(signal_anomalies)
        for anomaly in signal_anomalies:
            logger.info(f"Detected signal loss: {anomaly.description}")

    # Use the stronger of sequence-pattern confidence and raw conflict intensity
    # so conflict-heavy GDELT windows can contribute even without exact pattern matches.
    pattern_input = max(pattern_confidence, gdelt_conflict_score)

    # Compute composite risk score with context-aware dampening/boosting
    risk_score = escalation_detector.compute_risk_score(
        pattern_confidence=pattern_input,
        anomaly_score=anomaly_score,
        alignment_score=aligned.alignment_score,
        anomaly_count=len(active_anomalies),
        context_anomalies=context_anomalies if context_anomalies else None,
    )

    # Build narrative summaries for LLM
    gdelt_summary = "\n".join(
        [
            f"[{c.time.strftime('%H:%M')}] {c.predicate_type}: {c.narrative or 'N/A'}"
            for c in aligned.gdelt_clauses[:5]
        ]
    )
    tak_summary = "\n".join(
        [
            f"[{c.time.strftime('%H:%M')}] {c.uid} ({c.source}): {c.predicate_type}"
            for c in aligned.tak_clauses[:5]
        ]
    )

    # Collect heuristic behavioral signals from active anomalies
    behavioral_signals = [a.description for a in active_anomalies if a.description]
    # Add context anomalies (outages, space weather)
    behavioral_signals.extend(
        [a.description for a in context_anomalies if a.score > 0.1]
    )

    # Detect escalation indicators
    escalation_indicators = []
    if pattern_match:
        escalation_indicators.append("GDELT pattern matched")
    elif gdelt_conflict_score >= 0.25:
        escalation_indicators.append("GDELT conflict intensity elevated")
    if clustering_anomaly.score > 0.5:
        escalation_indicators.append("Entity clustering detected")
    if directional_anomalies:
        escalation_indicators.append("Directional anomalies detected")
    if emergency_anomalies:
        escalation_indicators.append("Emergency transponders activated")
    if rendezvous_anomalies:
        total_rendezvous = sum(len(a.affected_uids) for a in rendezvous_anomalies)
        escalation_indicators.append(
            f"Multi-entity rendezvous detected ({total_rendezvous} entities)"
        )
    if stdbscan_anomalies:
        total_stdbscan = sum(len(a.affected_uids) for a in stdbscan_anomalies)
        escalation_indicators.append(
            f"ST-DBSCAN: {len(stdbscan_anomalies)} cluster(s), {total_stdbscan} entities"
        )
    if hmm_anomalies:
        flagged_states = {
            a.description.split("dominant state ")[-1].split(" ")[0]
            for a in hmm_anomalies
        }
        escalation_indicators.append(
            f"HMM anomalous trajectories: {len(hmm_anomalies)} UID(s) — {', '.join(sorted(flagged_states))}"
        )

    # Space-weather suppression indicator
    if _signal_loss_suppressed and _suppression_payload:
        escalation_indicators.append(
            f"Signal-loss alerts suppressed: {_suppression_payload.get('reason', 'space weather')}"
        )

    # Context-based indicators
    for ctx_anomaly in context_anomalies:
        if ctx_anomaly.metric_type == "internet_outage" and ctx_anomaly.score > 0.5:
            escalation_indicators.append(
                f"Internet outage detected (severity: {ctx_anomaly.score:.2f})"
            )
        elif ctx_anomaly.metric_type == "space_weather" and ctx_anomaly.score > 0.5:
            escalation_indicators.append(
                f"Space weather event (Kp: {ctx_anomaly.description})"
            )
        elif ctx_anomaly.metric_type == "satellite_signal_loss":
            escalation_indicators.append(
                f"Satellite signal loss detected ({ctx_anomaly.affected_uids[0] if ctx_anomaly.affected_uids else 'unknown'})"
            )

    # Trigger Tier 3 escalation if risk is very high
    if risk_score > 0.8:
        logger.warning(
            f"HIGH RISK detected in region {request.h3_region}: {risk_score:.2f}"
        )
        escalation_indicators.append("ESCALATE_TO_TIER3")

    # Initialize LLM-based sequence evaluation if risk is elevated.
    # Lightweight mode (used by the heatmap endpoint) skips the LLM call to
    # avoid fanning out expensive model requests per heatmap cell.
    gdelt_linkage_notes = source_scope["gdelt"].get("notes") if source_scope.get("gdelt") else None
    narrative_summary = _build_heuristic_narrative(
        risk_score,
        escalation_indicators,
        gdelt_linkage_notes=gdelt_linkage_notes,
        anomalous_count=len(anomalous_uids),
        mode=request.mode,
        is_sitrep=request.is_sitrep,
    )
    confidence = 0.5

    if risk_score > 0.3 and not request.lightweight:
        try:
            logger.info(
                "🧠 [UNIFIED-BRAIN] Evaluating region %s with %d behavioral signals detected",
                request.h3_region,
                len(behavioral_signals),
            )
            evaluation_engine = SequenceEvaluationEngine()

            assessment: RiskAssessment = await asyncio.wait_for(
                evaluation_engine.evaluate_escalation(
                    h3_region=request.h3_region,
                    gdelt_summary=gdelt_summary,
                    tak_summary=tak_summary,
                    anomalous_uids=anomalous_uids,
                    behavioral_signals=behavioral_signals,
                    heuristic_risk_score=risk_score,
                    escalation_indicators=escalation_indicators,
                    gdelt_linkage_notes=gdelt_linkage_notes,
                    mode=request.mode,
                    is_sitrep=request.is_sitrep,
                ),
                timeout=_LLM_EVAL_TIMEOUT_SECONDS,
            )

            if assessment.narrative_summary.strip():
                narrative_summary = assessment.narrative_summary
            confidence = assessment.confidence
            if confidence > 0.7:
                risk_score = assessment.risk_score

        except TimeoutError:
            logger.warning(
                "LLM evaluation timed out after %.1fs, using heuristic scoring",
                _LLM_EVAL_TIMEOUT_SECONDS,
            )
        except Exception as e:
            logger.warning(f"LLM evaluation failed, using heuristic scoring: {e}")

    return RiskAssessmentResponse(
        h3_region_id=request.h3_region,
        risk_score=risk_score,
        narrative_summary=narrative_summary,
        anomalous_uids=anomalous_uids,
        escalation_indicators=escalation_indicators,
        confidence=confidence,
        pattern_detected=pattern_match is not None,
        anomaly_count=len(active_anomalies),
        source_scope=source_scope,
    )


@router.get("/regional_risk")
async def get_regional_risk_heatmap(
    h3_region: str = Query(..., description="H3-7 hexagonal region"),
    lookback_hours: int = Query(
        24, ge=1, le=720, description="Lookback window in hours"
    ),
) -> Dict:
    """
    Get risk heatmap for a region and surrounding cells.

    Returns risk scores for the region and adjacent H3 cells.
    Cells are evaluated concurrently (max 4 parallel) in lightweight mode to
    avoid cascading LLM calls.
    """
    import asyncio

    try:
        # Get neighbors of the region
        neighbors = h3.grid_ring(h3_region, 1)
        all_cells = [h3_region] + list(neighbors)

        # Use a semaphore so at most 4 cells are evaluated concurrently.
        # Each evaluation hits the DB; unbounded parallelism would overwhelm the pool.
        sem = asyncio.Semaphore(_HEATMAP_MAX_CONCURRENCY)

        async def _eval_cell(cell: str) -> tuple:
            async with sem:
                req = EvaluationRequest(
                    h3_region=cell,
                    lookback_hours=lookback_hours,
                    lightweight=True,  # skip LLM per-cell; avoids N×LLM fan-out
                )
                assessment = await evaluate_regional_escalation(req)
                return cell, {
                    "risk_score": assessment.risk_score,
                    "confidence": assessment.confidence,
                    "anomaly_count": assessment.anomaly_count,
                }

        results = await asyncio.gather(
            *[_eval_cell(c) for c in all_cells], return_exceptions=True
        )

        heatmap = {}
        for result in results:
            if isinstance(result, Exception):
                logger.warning("Heatmap cell evaluation failed: %s", result)
                continue
            cell, data = result
            heatmap[cell] = data

        return {
            "center_region": h3_region,
            "lookback_hours": lookback_hours,
            "heatmap": heatmap,
            "max_risk": max([v["risk_score"] for v in heatmap.values()], default=0.0),
        }

    except Exception as e:
        logger.error(f"Error generating heatmap: {e}")
        return {
            "center_region": h3_region,
            "error": "Internal server error",
        }


@router.get("/clausal-chains")
async def get_clausal_chains(
    region: Optional[str] = Query(None),
    lookback_hours: int = Query(24),
    source: Optional[str] = Query(None),
    lat: Optional[float] = Query(None, description="Center latitude for radius-based AOT query"),
    lon: Optional[float] = Query(None, description="Center longitude for radius-based AOT query"),
    radius_nm: Optional[float] = Query(None, description="Query radius in nautical miles"),
) -> List[Dict]:
    """
    Fetch clausal chains for a region within a time window.

    Supports two spatial modes (mirrors the /clusters endpoint):
    - **Radius mode** (preferred when a mission AOT is active): provide
      ``lat``, ``lon``, ``radius_nm``; uses ST_DWithin on the geography
      column for accurate great-circle distance filtering.
    - **H3 mode**: provide ``region`` (H3 cell ID); uses ST_Within against
      the cell WKT polygon + GIST index.
    - **No spatial filter**: omit all spatial params to return chains across
      the full lookback window (use with care on large deployments).
    """
    try:
        async with db.pool.acquire() as conn:
            spatial_clause, spatial_params, _, spatial_mode = _build_spatial_filter_clause(
                "geom",
                region=region,
                lat=lat,
                lon=lon,
                radius_nm=radius_nm,
                start_param_idx=2,
            )
            aot_context = (
                build_aot_context(
                    h3_region=region,
                    lat=lat,
                    lon=lon,
                    radius_nm=radius_nm,
                )
                if spatial_mode != "global"
                else None
            )

            where_clauses = [
                "time > now() - ($1 * interval '1 hour')",
            ]
            params: list = [lookback_hours]
            params.extend(spatial_params)
            param_idx = 2 + len(spatial_params)

            if spatial_clause:
                where_clauses.append(spatial_clause)

            if source:
                where_clauses.append(f"source = ${param_idx}")
                params.append(source)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            query = f"""
                SELECT time, uid, source, predicate_type,
                       locative_lat, locative_lon, locative_hae,
                       state_change_reason, adverbial_context, narrative_summary
                FROM clausal_chains
                WHERE {where_sql}
                ORDER BY uid, time ASC
            """

            rows = await conn.fetch(query, *params)

            context_where = ["time > now() - ($1 * interval '1 hour')"]
            context_params: List[object] = [lookback_hours]
            context_spatial_clause, context_spatial_params, _, _ = _build_spatial_filter_clause(
                "geom",
                region=region,
                lat=lat,
                lon=lon,
                radius_nm=radius_nm,
                start_param_idx=2,
            )
            if context_spatial_clause:
                context_where.append(context_spatial_clause)
                context_params.extend(context_spatial_params)
            context_where_sql = " AND ".join(context_where)

            outage_scope = "mission_area" if spatial_mode != "global" else "global"
            outage_linkage_reason = (
                f"{spatial_mode}_filter" if spatial_mode != "global" else "missing_spatial_filter"
            )
            outage_notes = None
            outage_country_codes: Set[str] = set()
            if db.redis_client and aot_context is not None:
                cable_index_raw, cables_raw, outages_raw = await asyncio.gather(
                    db.redis_client.get("infra:cable_country_index"),
                    db.redis_client.get("infra:cables"),
                    db.redis_client.get("infra:outages"),
                )
                if cable_index_raw and cables_raw and outages_raw:
                    try:
                        cable_relevant_countries = _derive_cable_relevant_countries_from_index(
                            json.loads(cable_index_raw),
                            json.loads(cables_raw),
                            aot_context.region_lat,
                            aot_context.region_lon,
                        )
                        outage_country_codes = _derive_relevant_outage_country_codes(
                            json.loads(outages_raw),
                            cable_relevant_countries,
                        )
                    except Exception as exc:
                        logger.warning("Clausal outage topology correlation failed: %s", exc)

            if outage_country_codes:
                outage_rows = await conn.fetch(
                    """
                    SELECT time, country_code, severity, asn_name, affected_nets
                    FROM internet_outages
                    WHERE time > now() - ($1 * interval '1 hour')
                      AND country_code = ANY($2::text[])
                    ORDER BY severity DESC, time DESC
                    LIMIT 5
                    """,
                    lookback_hours,
                    sorted(outage_country_codes),
                )
                outage_scope = "impact_linked_external"
                outage_linkage_reason = "cable_topology"
                outage_notes = (
                    f"Filtered to {len(outage_country_codes)} cable-relevant outage countries derived from mission topology."
                )
            else:
                outage_rows = await conn.fetch(
                    f"""
                    SELECT time, country_code, severity, asn_name, affected_nets
                    FROM internet_outages
                    WHERE {context_where_sql}
                    ORDER BY severity DESC, time DESC
                    LIMIT 5
                    """,
                    *context_params,
                )
            space_weather_row = await conn.fetchrow(
                """
                SELECT time, kp_index, kp_category, dst_index, explanation
                FROM space_weather_context
                WHERE time > now() - ($1 * interval '1 hour')
                ORDER BY kp_index DESC, time DESC
                LIMIT 1
                """,
                lookback_hours,
            )
            signal_rows = await conn.fetch(
                """
                SELECT time, norad_id, ground_station_name, signal_strength, modulation, frequency
                FROM satnogs_signal_events
                WHERE time > now() - ($1 * interval '1 hour')
                ORDER BY time DESC
                LIMIT 5
                """,
                lookback_hours,
            )

            satnogs_scope = "global"
            satnogs_linkage_reason = "ungated_signal_loss_feed"
            satnogs_notes = "Still unfiltered in clausal enrichment; mission-area relevance rules are pending."
            if spatial_mode == "h3" and region:
                signal_rows = await _fetch_aot_relevant_satnogs_events(
                    conn,
                    h3_region=region,
                    lookback_hours=lookback_hours,
                    limit=5,
                )
                satnogs_scope = "mission_area"
                satnogs_linkage_reason = "orbital_subpoint_in_aot"
                satnogs_notes = None
            elif spatial_mode == "radius" and lat is not None and lon is not None and radius_nm is not None:
                signal_rows = await _fetch_aot_relevant_satnogs_events(
                    conn,
                    center_lat=lat,
                    center_lon=lon,
                    radius_nm=radius_nm,
                    lookback_hours=lookback_hours,
                    limit=5,
                )
                satnogs_scope = "mission_area"
                satnogs_linkage_reason = "orbital_subpoint_in_radius"
                satnogs_notes = None

            context_scope = {
                "spatial_mode": spatial_mode,
                "lookback_hours": lookback_hours,
                "clausal_chains": _build_scope_descriptor(
                    "mission_area" if spatial_mode != "global" else "global",
                    f"{spatial_mode}_filter" if spatial_mode != "global" else "missing_spatial_filter",
                    lookback_hours=lookback_hours,
                ),
                "outages": _build_scope_descriptor(
                    outage_scope,
                    outage_linkage_reason,
                    lookback_hours=lookback_hours,
                    notes=outage_notes,
                ),
                "space_weather": _build_scope_descriptor(
                    "impact_linked_external",
                    "global_propagation",
                    lookback_hours=lookback_hours,
                    notes=f"Thresholded external-driver gate applied: kp>={_SPACE_WEATHER_MISSION_KP_THRESHOLD:g}",
                ),
                "satnogs": _build_scope_descriptor(
                    satnogs_scope,
                    satnogs_linkage_reason,
                    lookback_hours=lookback_hours,
                    notes=satnogs_notes,
                ),
            }
            outage_context = [
                {
                    "time": row["time"].isoformat() if hasattr(row["time"], "isoformat") else str(row["time"]),
                    "country_code": row["country_code"],
                    "severity": row["severity"],
                    "asn_name": row["asn_name"],
                    "affected_nets": row["affected_nets"],
                }
                for row in outage_rows
            ]
            space_weather_context = None
            if space_weather_row and _space_weather_kp_meets_threshold(space_weather_row.get("kp_index")):
                space_weather_context = {
                    "time": space_weather_row["time"].isoformat() if hasattr(space_weather_row["time"], "isoformat") else str(space_weather_row["time"]),
                    "kp_index": space_weather_row["kp_index"],
                    "kp_category": space_weather_row["kp_category"],
                    "dst_index": space_weather_row["dst_index"],
                    "explanation": space_weather_row["explanation"],
                    "relevant_to_mission": True,
                    "threshold_passed": True,
                    "threshold": f"kp>={_SPACE_WEATHER_MISSION_KP_THRESHOLD:g}",
                }
            satnogs_context = [
                {
                    "time": row["time"].isoformat() if hasattr(row["time"], "isoformat") else str(row["time"]),
                    "norad_id": row["norad_id"],
                    "ground_station_name": row["ground_station_name"],
                    "signal_strength": row["signal_strength"],
                    "modulation": row["modulation"],
                    "frequency": row["frequency"],
                    "scope": row.get("scope", satnogs_scope),
                    "linkage_reason": row.get("linkage_reason", satnogs_linkage_reason),
                    "subpoint_lat": row.get("subpoint_lat"),
                    "subpoint_lon": row.get("subpoint_lon"),
                }
                for row in signal_rows
            ]

            # Group by UID to form chains
            chains_by_uid: Dict[str, Dict] = {}
            for row in rows:
                uid = row["uid"]
                if uid not in chains_by_uid:
                    chains_by_uid[uid] = {
                        "uid": uid,
                        "source": row["source"],
                        "predicate_type": row["predicate_type"],
                        "narrative_summary": row.get("narrative_summary"),
                        "context_scope": context_scope,
                        "outage_context": outage_context,
                        "space_weather_context": space_weather_context,
                        "satnogs_context": satnogs_context,
                        "clauses": [],
                    }

                clause = {
                    "time": row["time"].isoformat()
                    if hasattr(row["time"], "isoformat")
                    else str(row["time"]),
                    "locative_lat": row["locative_lat"],
                    "locative_lon": row["locative_lon"],
                    "locative_hae": row["locative_hae"],
                    "state_change_reason": row["state_change_reason"],
                    "adverbial_context": _parse_adverbial_context(row["adverbial_context"]),
                }
                chains_by_uid[uid]["clauses"].append(clause)

            return list(chains_by_uid.values())

    except Exception as e:
        logger.error(f"Error fetching clausal chains: {e}")
        return []



@router.get("/health")
async def health_check() -> Dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy", "service": "ai-router"}


# ---------------------------------------------------------------------------
# Phase 2 — ST-DBSCAN + HMM Endpoints
# ---------------------------------------------------------------------------


@router.get("/clusters")
async def get_clusters(
    h3_region: Optional[str] = Query(None, description="H3-7 hexagonal cell ID"),
    lat: Optional[float] = Query(None, description="Center latitude"),
    lon: Optional[float] = Query(None, description="Center longitude"),
    radius_nm: Optional[float] = Query(None, description="Radius in nautical miles"),
    lookback_hours: int = Query(24, ge=1, le=720, description="Lookback window in hours"),
    eps_km: float = Query(2.0, gt=0, description="Spatial neighbourhood radius in km"),
    min_samples: int = Query(5, ge=2, description="Minimum samples to form a core point"),
) -> Dict:
    """
    Detect ST-DBSCAN entity clusters within an H3 region or circular AOT.

    Queries TAK clausal_chains for the region and time window, then runs
    spatial-temporal DBSCAN clustering.  Returns per-cluster metadata and
    a count of noise (unclustered) entity UIDs.
    """
    wkt_polygon = _h3_cell_to_wkt(h3_region) if h3_region else None

    # Use DISTINCT ON (uid) so each entity contributes exactly one point —
    # its most recent position within the window.  This ensures clusters
    # represent co-location of *different* entities, not repeated observations
    # of the same moving track.
    # Hard cap: ST-DBSCAN is O(n²) — keep input to a safe size.
    _ROW_LIMIT = 5000

    async with db.pool.acquire() as conn:
        if lat is not None and lon is not None and radius_nm is not None:
            radius_m = radius_nm * 1852.0
            rows = await conn.fetch(
                """
                SELECT uid, locative_lat, locative_lon, time
                FROM (
                    SELECT DISTINCT ON (uid) uid, locative_lat, locative_lon, time
                    FROM clausal_chains
                    WHERE source IN ('TAK_ADSB', 'TAK_AIS')
                      AND time > now() - ($1 * interval '1 hour')
                      AND ST_DWithin(
                          geom::geography,
                          ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
                          $4
                      )
                    ORDER BY uid, time DESC
                ) latest
                ORDER BY time DESC
                LIMIT $5
                """,
                lookback_hours,
                lon,
                lat,
                radius_m,
                _ROW_LIMIT,
            )
        elif wkt_polygon:
            rows = await conn.fetch(
                """
                SELECT uid, locative_lat, locative_lon, time
                FROM (
                    SELECT DISTINCT ON (uid) uid, locative_lat, locative_lon, time
                    FROM clausal_chains
                    WHERE source IN ('TAK_ADSB', 'TAK_AIS')
                      AND time > now() - ($1 * interval '1 hour')
                      AND ST_Within(geom, ST_GeomFromText($2, 4326))
                    ORDER BY uid, time DESC
                ) latest
                ORDER BY time DESC
                LIMIT $3
                """,
                lookback_hours,
                wkt_polygon,
                _ROW_LIMIT,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT uid, locative_lat, locative_lon, time
                FROM (
                    SELECT DISTINCT ON (uid) uid, locative_lat, locative_lon, time
                    FROM clausal_chains
                    WHERE source IN ('TAK_ADSB', 'TAK_AIS')
                      AND time > now() - ($1 * interval '1 hour')
                    ORDER BY uid, time DESC
                ) latest
                ORDER BY time DESC
                LIMIT $2
                """,
                lookback_hours,
                _ROW_LIMIT,
            )

    points = [
        {
            "uid": row["uid"],
            "lat": row["locative_lat"],
            "lon": row["locative_lon"],
            "time": row["time"],
        }
        for row in rows
        if row["uid"] and row["locative_lat"] is not None and row["locative_lon"] is not None
    ]

    if len(points) == _ROW_LIMIT:
        logger.warning(
            "get_clusters: row cap (%d) hit — results may be incomplete. "
            "Tighten the AOI or reduce lookback_hours.",
            _ROW_LIMIT,
        )

    # Offload the CPU-bound O(n²) ST-DBSCAN to a thread so the event loop
    # stays responsive while clustering runs.
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, lambda: detect_clusters(points, eps_km=eps_km, min_samples=min_samples)
    )

    clusters_out = [
        {
            "cluster_id": c.cluster_id,
            "uids": c.uids,
            "centroid_lat": c.centroid_lat,
            "centroid_lon": c.centroid_lon,
            "entity_count": c.entity_count,
            "start_time": c.start_time.isoformat(),
            "end_time": c.end_time.isoformat(),
        }
        for c in result.clusters
    ]

    return {
        "clusters": clusters_out,
        "total_clusters": len(result.clusters),
        "noise_count": len(result.noise_uids),
    }


@router.get("/trajectory/{uid}")
async def get_trajectory(
    uid: str,
    lookback_hours: int = Query(24, ge=1, le=720, description="Lookback window in hours"),
) -> Dict:
    """
    Classify the behavioral state trajectory for a single entity UID.

    Fetches the entity's track from clausal_chains, runs the HMM Viterbi
    decoder, persists the result to trajectory_states (fire-and-forget),
    and returns the decoded state sequence with summary statistics.
    """
    async with db.pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT time, locative_hae, adverbial_context
            FROM clausal_chains
            WHERE uid = $1
              AND source IN ('TAK_ADSB', 'TAK_AIS')
              AND time > now() - ($2 * interval '1 hour')
            ORDER BY time ASC
            """,
            uid,
            lookback_hours,
        )

    track_points = []
    for row in rows:
        ctx = row["adverbial_context"] or {}
        if isinstance(ctx, str):
            try:
                ctx = json.loads(ctx)
            except (json.JSONDecodeError, TypeError):
                ctx = {}
        track_points.append(
            {
                "speed_kts": float(ctx.get("speed") or 0.0),
                "heading_deg": float(ctx.get("course") or 0.0),
                "alt_ft": float(row["locative_hae"] or 0.0) * 3.28084,
                "time": row["time"],
            }
        )

    hmm_result: HMMResult = classify_trajectory(uid, track_points)

    # Persist to trajectory_states — fire-and-forget, does not block response
    async def _persist(r: HMMResult) -> None:
        try:
            async with db.pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO trajectory_states (time, uid, state, confidence, anomaly_score)
                    VALUES (now(), $1, $2, $3, $4)
                    """,
                    r.uid,
                    r.dominant_state,
                    r.confidence,
                    r.anomaly_score,
                )
        except Exception as exc:
            logger.warning("Failed to persist trajectory state for uid=%s: %s", uid, exc)

    asyncio.create_task(_persist(hmm_result))

    return {
        "uid": hmm_result.uid,
        "state_sequence": hmm_result.state_sequence,
        "dominant_state": hmm_result.dominant_state,
        "confidence": hmm_result.confidence,
        "anomaly_score": hmm_result.anomaly_score,
        "track_point_count": len(track_points),
    }


# ---------------------------------------------------------------------------
# Phase 4 — Domain Agent Endpoints
# ---------------------------------------------------------------------------

class DomainAnalysisRequest(BaseModel):
    """Shared request body for all three domain agents."""
    h3_region: str
    lookback_hours: int = 24
    mode: str = "tactical"


class DomainAnalysisResponse(BaseModel):
    domain: str
    h3_region: str
    narrative: str
    risk_score: float
    indicators: List[str]
    context_snapshot: Dict
    ai_status: Optional[str] = None
    ai_notice: Optional[str] = None


def _coerce_context_map(value: object) -> Dict:
    """Normalize adverbial_context payloads from DB into a dict."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
            return decoded if isinstance(decoded, dict) else {}
        except Exception:
            return {}
    return {}


async def _summarize_nws_alerts_for_region(wkt_polygon: Optional[str]) -> Dict:
    """Return active NWS alert counts intersecting the requested H3 region.

    The infra poller stores two Redis artifacts:
      - ``nws:alerts:active``: full GeoJSON of all active U.S. alerts
      - ``nws:alerts:summary``: national counts for dashboard-style displays

    The analyst path must stay region-scoped, so this helper intersects the
    active alert geometries with the target H3 cell and returns only local
    counts. ``fetched_at`` is preserved from the summary blob because it is the
    same polling cycle metadata rather than a national signal.
    """
    summary: Dict = {
        "count": 0,
        "severe_count": 0,
        "extreme_count": 0,
        "fetched_at": None,
        "scope": "mission_area",
    }

    if not db.redis_client:
        return summary

    try:
        summary_raw = await db.redis_client.get("nws:alerts:summary")
        if summary_raw:
            decoded = json.loads(summary_raw)
            if isinstance(decoded, dict):
                summary["fetched_at"] = decoded.get("fetched_at")
    except Exception as exc:
        logger.debug("Failed to load NWS summary metadata: %s", exc)

    if not wkt_polygon or not db.pool:
        return summary

    try:
        active_raw = await db.redis_client.get("nws:alerts:active")
        if not active_raw:
            return summary

        active_data = json.loads(active_raw)
        if not isinstance(active_data, dict):
            return summary

        features = active_data.get("features", [])
        if not isinstance(features, list) or not features:
            return summary

        async with db.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                WITH region AS (
                    SELECT ST_GeomFromText($1, 4326) AS geom
                ),
                alerts AS (
                    SELECT
                        feat->'properties'->>'severity' AS severity,
                        CASE
                            WHEN feat ? 'geometry'
                              AND feat->'geometry' IS NOT NULL
                              AND jsonb_typeof(feat->'geometry') = 'object'
                            THEN ST_MakeValid(
                                ST_SetSRID(
                                    ST_GeomFromGeoJSON((feat->'geometry')::text),
                                    4326
                                )
                            )
                            ELSE NULL
                        END AS geom
                    FROM jsonb_array_elements($2::jsonb) AS feat
                )
                SELECT
                    COUNT(*) FILTER (
                        WHERE geom IS NOT NULL AND ST_Intersects(geom, region.geom)
                    ) AS count,
                    COUNT(*) FILTER (
                        WHERE geom IS NOT NULL
                          AND ST_Intersects(geom, region.geom)
                          AND severity IN ('Severe', 'Extreme')
                    ) AS severe_count,
                    COUNT(*) FILTER (
                        WHERE geom IS NOT NULL
                          AND ST_Intersects(geom, region.geom)
                          AND severity = 'Extreme'
                    ) AS extreme_count
                FROM alerts
                CROSS JOIN region
                """,
                wkt_polygon,
                json.dumps(features),
            )

        if row:
            if isinstance(row, dict):
                summary["count"] = int(row.get("count") or 0)
                summary["severe_count"] = int(row.get("severe_count") or 0)
                summary["extreme_count"] = int(row.get("extreme_count") or 0)
            else:
                summary["count"] = int(row["count"] or 0)
                summary["severe_count"] = int(row["severe_count"] or 0)
                summary["extreme_count"] = int(row["extreme_count"] or 0)
    except Exception as exc:
        logger.warning("Failed to summarize regional NWS alerts: %s", exc)

    return summary


@router.post("/analyze/air")
async def analyze_air_domain(request: DomainAnalysisRequest) -> DomainAnalysisResponse:
    """
    Air Intelligence Officer persona.

    Fuses ADS-B telemetry (squawk codes, altitude, course), NWS wind/severe-weather
    alerts, and GDELT air-domain events to produce an air-domain risk assessment.
    """
    indicators: List[str] = []
    context: Dict = {"domain": "air", "h3_region": request.h3_region}
    context["signal_scope"] = "mission_area_with_impact_linked_external"
    context["context_scope"] = {
        "adsb": _build_scope_descriptor("mission_area", "h3_intersection", lookback_hours=request.lookback_hours),
        "nws": _build_scope_descriptor("mission_area", "geometry_intersection", lookback_hours=request.lookback_hours),
        "space_weather": _build_scope_descriptor(
            "impact_linked_external",
            "global_propagation",
            time_scope="current_state",
            notes="Only surfaced in air analysis when Kp reaches the mission relevance threshold.",
        ),
    }

    wkt_polygon = _h3_cell_to_wkt(request.h3_region)

    # ADS-B snapshot from clausal_chains
    adsb_rows: List[Dict] = []
    async with db.pool.acquire() as conn:
        if wkt_polygon:
            rows = await conn.fetch(
                """
                SELECT uid, predicate_type, locative_lat, locative_lon, locative_hae,
                       adverbial_context, time
                FROM clausal_chains
                WHERE source = 'TAK_ADSB'
                  AND time > now() - ($1 * interval '1 hour')
                  AND ST_Within(geom, ST_GeomFromText($2, 4326))
                ORDER BY time DESC LIMIT 50
                """,
                request.lookback_hours,
                wkt_polygon,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT uid, predicate_type, locative_lat, locative_lon, locative_hae,
                       adverbial_context, time
                FROM clausal_chains
                WHERE source = 'TAK_ADSB'
                  AND time > now() - ($1 * interval '1 hour')
                ORDER BY time DESC LIMIT 50
                """,
                request.lookback_hours,
            )
        adsb_rows = [dict(r) for r in rows]

    # Emergency squawk detection
    emergency_squawks = [
        r for r in adsb_rows
        if _coerce_context_map(r.get("adverbial_context")).get("squawk")
        in ("7700", "7600", "7500")
    ]
    if emergency_squawks:
        indicators.append(f"Emergency squawk codes active: {len(emergency_squawks)} aircraft")

    # Holding pattern detection (repeated heading reversals)
    uid_counts: Dict[str, int] = {}
    for r in adsb_rows:
        uid_counts[r["uid"]] = uid_counts.get(r["uid"], 0) + 1
    high_dwell = [uid for uid, cnt in uid_counts.items() if cnt >= 5]
    if high_dwell:
        indicators.append(f"Possible holding patterns: {len(high_dwell)} UIDs with ≥5 observations")

    # NWS severe weather context
    nws_data = await _summarize_nws_alerts_for_region(wkt_polygon)
    context["nws_alerts"] = nws_data
    if nws_data.get("severe_count", 0) > 0:
        indicators.append(
            f"{nws_data['severe_count']} severe NWS weather alerts intersect the target region"
        )

    # Space weather (GPS/comms impact)
    space_weather_summary = "below mission threshold"
    if db.redis_client:
        kp_raw = await db.redis_client.get("space_weather:kp_current")
        if kp_raw:
            import json as _j2
            kp_data = _j2.loads(kp_raw)
            kp_value = kp_data.get("kp")
            storm_level = kp_data.get("storm_level", "?")
            relevant_to_mission = _space_weather_kp_meets_threshold(kp_value)
            context["space_weather_driver"] = {
                "kp_index": kp_value,
                "storm_level": storm_level,
                "relevant_to_mission": relevant_to_mission,
                "threshold": f"kp>={_SPACE_WEATHER_MISSION_KP_THRESHOLD:g}",
            }
            if relevant_to_mission:
                space_weather_summary = f"Kp={kp_value} ({storm_level})"
                indicators.append(f"Mission-impacting GPS/comms degradation risk: Kp={kp_value} ({storm_level})")

    context["space_weather_driver_summary"] = space_weather_summary

    entity_count = len(set(r["uid"] for r in adsb_rows))
    risk_score = min(1.0, (len(emergency_squawks) * 0.4 + len(high_dwell) * 0.1 + entity_count * 0.005))

    context["adsb_entity_count"] = entity_count
    context["emergency_squawk_count"] = len(emergency_squawks)

    # Build narrative via unified AIService (Air Intelligence Officer persona)
    signals_text = "\n".join(f"- {i}" for i in indicators) if indicators else "- No anomalies detected"
    user_prompt = (
        f"Air domain assessment for H3 region {request.h3_region}:\n"
        f"- {entity_count} ADS-B tracks in {request.lookback_hours}h window\n"
        f"- Target Objective / View: {request.mode.upper()}\n"
        f"- Space-weather driver: {context.get('space_weather_driver_summary', 'below mission threshold')}\n"
        f"- NWS alerts in target region: {context.get('nws_alerts', {})}\n\n"
        f"HEURISTIC SIGNALS:\n{signals_text}"
    )
    persona = ai_service.get_persona(mode=request.mode)
    logger.info("🧠 [UNIFIED-BRAIN] Air domain analysis for %s", request.h3_region)
    try:
        narrative = await ai_service.generate_static(
            system_prompt=persona["sys"] + "\n" + persona["inst"],
            user_prompt=user_prompt,
        )
        ai_status = None
        ai_notice = None
    except AIModelOverloadedError as exc:
        logger.warning("Air domain LLM overloaded, using heuristic narrative: %s", exc)
        narrative = (
            f"Air domain: {entity_count} ADS-B tracks in {request.lookback_hours}h. "
            + ("; ".join(indicators) if indicators else "No anomalies detected.")
        )
        ai_status = "overloaded"
        ai_notice = str(exc)
    except Exception as exc:
        logger.warning("Air domain LLM failed, using heuristic narrative: %s", exc)
        narrative = (
            f"Air domain: {entity_count} ADS-B tracks in {request.lookback_hours}h. "
            + ("; ".join(indicators) if indicators else "No anomalies detected.")
        )
        ai_status = None
        ai_notice = None

    return DomainAnalysisResponse(
        domain="air",
        h3_region=request.h3_region,
        narrative=narrative,
        risk_score=round(risk_score, 3),
        indicators=indicators,
        context_snapshot=context,
        ai_status=ai_status,
        ai_notice=ai_notice,
    )


@router.post("/analyze/sea")
async def analyze_sea_domain(request: DomainAnalysisRequest) -> DomainAnalysisResponse:
    """
    Maritime Domain Awareness (MDA) Specialist persona.

    Fuses AIS vessel telemetry, NDBC wave/wind observations, IODA internet
    outage correlation with submarine cable landing points, and GDELT maritime
    events to produce a sea-domain risk assessment.
    """
    indicators: List[str] = []
    context: Dict = {"domain": "sea", "h3_region": request.h3_region}

    wkt_polygon = _h3_cell_to_wkt(request.h3_region)
    region_center = _h3_region_center(request.h3_region)
    context["signal_scope"] = "mission_area"

    # AIS snapshot
    ais_rows: List[Dict] = []
    async with db.pool.acquire() as conn:
        if wkt_polygon:
            rows = await conn.fetch(
                """
                SELECT uid, predicate_type, locative_lat, locative_lon,
                       adverbial_context, time
                FROM clausal_chains
                WHERE source = 'TAK_AIS'
                  AND time > now() - ($1 * interval '1 hour')
                  AND ST_Within(geom, ST_GeomFromText($2, 4326))
                ORDER BY time DESC LIMIT 50
                """,
                request.lookback_hours,
                wkt_polygon,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT uid, predicate_type, locative_lat, locative_lon,
                       adverbial_context, time
                FROM clausal_chains
                WHERE source = 'TAK_AIS'
                  AND time > now() - ($1 * interval '1 hour')
                ORDER BY time DESC LIMIT 50
                """,
                request.lookback_hours,
            )
        ais_rows = [dict(r) for r in rows]

    entity_count = len(set(r["uid"] for r in ais_rows))

    if db.redis_client and region_center is not None:
        region_lat, region_lon = region_center
        ndbc_raw, outages_raw, stations_raw, cables_raw, cable_index_raw = await asyncio.gather(
            db.redis_client.get("ndbc:latest_obs"),
            db.redis_client.get("infra:outages"),
            db.redis_client.get("infra:stations"),
            db.redis_client.get("infra:cables"),
            db.redis_client.get("infra:cable_country_index"),
        )

        if ndbc_raw:
            ndbc_data = json.loads(ndbc_raw)
            nearby_buoys = _select_nearby_ndbc_features(
                ndbc_data,
                region_lat,
                region_lon,
            )
            if nearby_buoys:
                max_wvht = max(buoy["wvht_m"] for buoy in nearby_buoys)
                context["max_wave_height_m"] = max_wvht
                context["wave_buoy_count"] = len(nearby_buoys)
                context["wave_buoys"] = nearby_buoys[:5]
                if max_wvht >= 4.0:
                    indicators.append(
                        f"High sea state in mission area: max wave height {max_wvht:.1f}m across {len(nearby_buoys)} nearby buoys"
                    )

        if outages_raw and stations_raw:
            outages_data = json.loads(outages_raw)
            stations_data = json.loads(stations_raw)
            cables_data = json.loads(cables_raw) if cables_raw else {"features": []}
            cable_index = json.loads(cable_index_raw) if cable_index_raw else {}
            relevant_countries = _derive_cable_relevant_countries_from_index(
                cable_index,
                cables_data,
                region_lat,
                region_lon,
            )
            if not relevant_countries:
                relevant_countries = _derive_cable_relevant_countries(
                    stations_data,
                    cables_data,
                    region_lat,
                    region_lon,
                )
            if relevant_countries:
                correlated_outages = _filter_cable_correlated_outages(
                    outages_data,
                    relevant_countries,
                )
                context["cable_relevant_countries"] = sorted(relevant_countries)
                if correlated_outages:
                    impacted_countries = sorted(
                        {
                            outage["country"]
                            for outage in correlated_outages
                            if outage.get("country")
                        }
                    )
                    context["cable_correlated_outages"] = len(correlated_outages)
                    context["cable_correlated_outage_countries"] = impacted_countries
                    context["cable_outage_samples"] = correlated_outages[:5]
                    indicators.append(
                        "Cable-connected landing country outages in mission area: "
                        f"{len(correlated_outages)} affected regions across {', '.join(impacted_countries[:4])}"
                    )

    # Dark vessel detection (vessels with very infrequent AIS updates)
    uid_last: Dict[str, int] = {}
    for r in ais_rows:
        uid_last[r["uid"]] = uid_last.get(r["uid"], 0) + 1
    sparse_vessels = [uid for uid, cnt in uid_last.items() if cnt == 1]
    if len(sparse_vessels) > 3:
        indicators.append(f"Possible AIS dark vessels: {len(sparse_vessels)} with single observation")

    risk_score = min(1.0, len(indicators) * 0.2 + entity_count * 0.005)
    context["ais_entity_count"] = entity_count

    # Build narrative via unified AIService (MDA Specialist persona)
    signals_text = "\n".join(f"- {i}" for i in indicators) if indicators else "- No anomalies detected"
    user_prompt = (
        f"Maritime domain assessment for H3 region {request.h3_region}:\n"
        f"- {entity_count} AIS tracks in {request.lookback_hours}h window\n"
        f"- Target Objective / View: {request.mode.upper()}\n"
        f"- Max wave height: {context.get('max_wave_height_m', 'N/A')}m (NDBC)\n"
        f"- Cable-correlated outages: {context.get('cable_correlated_outages', 0)}\n\n"
        f"HEURISTIC SIGNALS:\n{signals_text}"
    )
    persona = ai_service.get_persona(mode=request.mode)
    logger.info("🧠 [UNIFIED-BRAIN] Sea domain analysis for %s", request.h3_region)
    try:
        narrative = await ai_service.generate_static(
            system_prompt=persona["sys"] + "\n" + persona["inst"],
            user_prompt=user_prompt,
        )
        ai_status = None
        ai_notice = None
    except AIModelOverloadedError as exc:
        logger.warning("Sea domain LLM overloaded, using heuristic narrative: %s", exc)
        narrative = (
            f"Sea domain: {entity_count} AIS tracks in {request.lookback_hours}h. "
            + ("; ".join(indicators) if indicators else "No anomalies detected.")
        )
        ai_status = "overloaded"
        ai_notice = str(exc)
    except Exception as exc:
        logger.warning("Sea domain LLM failed, using heuristic narrative: %s", exc)
        narrative = (
            f"Sea domain: {entity_count} AIS tracks in {request.lookback_hours}h. "
            + ("; ".join(indicators) if indicators else "No anomalies detected.")
        )
        ai_status = None
        ai_notice = None

    return DomainAnalysisResponse(
        domain="sea",
        h3_region=request.h3_region,
        narrative=narrative,
        risk_score=round(risk_score, 3),
        indicators=indicators,
        context_snapshot=context,
        ai_status=ai_status,
        ai_notice=ai_notice,
    )


@router.post("/analyze/orbital")
async def analyze_orbital_domain(request: DomainAnalysisRequest) -> DomainAnalysisResponse:
    """
    Space Weather / Orbital Analyst persona.

    Fuses Kp-index, NOAA R/S/G scale levels, SatNOGS signal events, and
    orbital track data to produce an orbital/space-weather domain assessment.
    """
    import json as _j
    indicators: List[str] = []
    context: Dict = {"domain": "orbital", "h3_region": request.h3_region}
    context["signal_scope"] = "mission_area_with_impact_linked_external"
    context["context_scope"] = {
        "space_weather": {
            "scope": "impact_linked_external",
            "linkage_reason": "global_propagation",
            "time_scope": "current_state",
        },
        "satnogs": {
            "scope": "mission_area",
            "linkage_reason": "orbital_subpoint_in_aot",
            "lookback_hours": request.lookback_hours,
        },
    }

    # Space weather context from Redis
    kp_val: Optional[float] = None
    storm_level: Optional[str] = None
    if db.redis_client:
        kp_raw = await db.redis_client.get("space_weather:kp_current")
        if kp_raw:
            kp_data = _j.loads(kp_raw)
            kp_val = kp_data.get("kp")
            storm_level = kp_data.get("storm_level")
            context["kp_index"] = kp_val
            context["storm_level"] = storm_level
            if kp_val is not None and kp_val >= 6:
                indicators.append(f"Mission-impacting geomagnetic storm driver: Kp={kp_val} ({storm_level})")
            elif kp_val is not None and kp_val >= 4:
                indicators.append(f"Elevated space-weather driver for mission area systems: Kp={kp_val} ({storm_level})")

        scales_raw = await db.redis_client.get("space_weather:noaa_scales")
        if scales_raw:
            scales_data = _j.loads(scales_raw)
            current_scales = scales_data.get("0", {})
            r_scale = current_scales.get("R", {}).get("Scale", "R0")
            g_scale = current_scales.get("G", {}).get("Scale", "G0")
            s_scale = current_scales.get("S", {}).get("Scale", "S0")
            context["noaa_scales"] = {"R": r_scale, "G": g_scale, "S": s_scale}
            r_lvl = int(r_scale[1:]) if len(r_scale) > 1 and r_scale[1:].isdigit() else 0
            g_lvl = int(g_scale[1:]) if len(g_scale) > 1 and g_scale[1:].isdigit() else 0
            s_lvl = int(s_scale[1:]) if len(s_scale) > 1 and s_scale[1:].isdigit() else 0
            if r_lvl >= 3:
                indicators.append(f"Global Radio Blackout {r_scale}: mission-area HF comms may degrade")
            if g_lvl >= 3:
                indicators.append(f"Global Geomagnetic Storm {g_scale}: mission-area orbital assets may see drag/orientation risk")
            if s_lvl >= 2:
                indicators.append(f"Global Solar Energetic Particle event {s_scale}: mission-area space systems may face radiation hazard")

        suppression_raw = await db.redis_client.get("space_weather:suppress_signal_loss")
        if suppression_raw:
            sup_data = _j.loads(suppression_raw)
            context["signal_loss_suppression"] = sup_data
            if sup_data.get("active"):
                indicators.append(f"Signal-loss suppression active: {sup_data.get('reason', '')}")

    # SatNOGS signal loss events
    signal_events: List[Dict] = []
    async with db.pool.acquire() as conn:
        signal_events = await _fetch_aot_relevant_satnogs_events(
            conn,
            h3_region=request.h3_region,
            lookback_hours=request.lookback_hours,
        )
        signal_count = len(signal_events)
        context["signal_loss_count"] = signal_count
        context["signal_loss_events"] = [
            {
                "time": row["time"].isoformat() if hasattr(row["time"], "isoformat") else str(row["time"]),
                "norad_id": row["norad_id"],
                "ground_station_name": row["ground_station_name"],
                "signal_strength": row["signal_strength"],
                "subpoint_lat": row["subpoint_lat"],
                "subpoint_lon": row["subpoint_lon"],
                "scope": row["scope"],
                "linkage_reason": row["linkage_reason"],
            }
            for row in signal_events[:5]
        ]
        if signal_count > 0 and not context.get("signal_loss_suppression", {}).get("active"):
            indicators.append(
                f"Mission-area satellite signal loss events: {signal_count} propagated overflight observations below -10 dBm"
            )

    kp_risk = min(1.0, (kp_val or 0) / 9.0)
    scale_risk = 0.3 if any("Radio Blackout" in i or "Geomagnetic Storm" in i for i in indicators) else 0.0
    signal_risk = min(0.4, signal_count * 0.04) if not context.get("signal_loss_suppression", {}).get("active") else 0.0
    risk_score = min(1.0, kp_risk * 0.5 + scale_risk + signal_risk)

    # Build narrative via unified AIService (Space Weather / Orbital Analyst persona)
    signals_text = "\n".join(f"- {i}" for i in indicators) if indicators else "- Nominal conditions"
    user_prompt = (
        f"Orbital / space-weather assessment for mission area {request.h3_region}:\n"
        f"- Target Objective / View: {request.mode.upper()}\n"
        f"- Kp index: {kp_val or 'N/A'} ({storm_level or 'unknown'})\n"
        f"- NOAA scales: {context.get('noaa_scales', {})}\n"
        f"- Mission-area SatNOGS signal-loss events: {signal_count}\n"
        f"- Scope contract: mission-area signals plus impact-linked external drivers only\n\n"
        f"HEURISTIC SIGNALS:\n{signals_text}"
    )
    persona = ai_service.get_persona(mode=request.mode)
    logger.info("🧠 [UNIFIED-BRAIN] Orbital domain analysis for %s", request.h3_region)
    try:
        narrative = await ai_service.generate_static(
            system_prompt=persona["sys"] + "\n" + persona["inst"],
            user_prompt=user_prompt,
        )
        ai_status = None
        ai_notice = None
    except AIModelOverloadedError as exc:
        logger.warning("Orbital domain LLM overloaded, using heuristic narrative: %s", exc)
        narrative = (
            f"Orbital/space-weather: Kp={kp_val or 'N/A'} ({storm_level or 'unknown'}). "
            + ("; ".join(indicators) if indicators else "Nominal space weather conditions.")
        )
        ai_status = "overloaded"
        ai_notice = str(exc)
    except Exception as exc:
        logger.warning("Orbital domain LLM failed, using heuristic narrative: %s", exc)
        narrative = (
            f"Orbital/space-weather: Kp={kp_val or 'N/A'} ({storm_level or 'unknown'}). "
            + ("; ".join(indicators) if indicators else "Nominal space weather conditions.")
        )
        ai_status = None
        ai_notice = None

    return DomainAnalysisResponse(
        domain="orbital",
        h3_region=request.h3_region,
        narrative=narrative,
        risk_score=round(risk_score, 3),
        indicators=indicators,
        context_snapshot=context,
        ai_status=ai_status,
        ai_notice=ai_notice,
    )

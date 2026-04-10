from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple

import h3

from routers.gdelt_country_codes import (
    COUNTRY_CENTER_BY_CODE,
    COUNTRY_CODE_BY_NORMALIZED_NAME,
    COUNTRY_NEIGHBORS,
    COUNTRY_NORMALIZED_NAME_BY_CODE,
)

logger = logging.getLogger(__name__)

GDELT_LINKAGE_REASON = "explicit_geopolitical_linkage"
_GDELT_CHOKEPOINT_RADIUS_KM = 150.0
_SEA_CABLE_PROXIMITY_KM = 250.0
_STRATEGIC_CHOKEPOINTS = [
    {"name": "Strait of Hormuz", "lat": 26.5, "lon": 56.3},
    {"name": "Strait of Malacca", "lat": 1.25, "lon": 103.8},
    {"name": "Suez Canal", "lat": 30.7, "lon": 32.3},
    {"name": "Gibraltar", "lat": 36.0, "lon": -5.35},
    {"name": "Bosphorus/Dardanelles", "lat": 41.0, "lon": 29.0},
    {"name": "Bab-el-Mandeb", "lat": 12.6, "lon": 43.3},
    {"name": "Luzon Strait", "lat": 20.5, "lon": 121.5},
    {"name": "Taiwan Strait", "lat": 24.5, "lon": 119.5},
    {"name": "English Channel", "lat": 50.9, "lon": 1.4},
    {"name": "Cape of Good Hope", "lat": -34.4, "lon": 18.5},
    {"name": "Drake Passage", "lat": -58.0, "lon": -68.0},
    {"name": "Danish Straits", "lat": 55.5, "lon": 10.5},
    {"name": "Sunda Strait", "lat": -6.0, "lon": 105.8},
    {"name": "Lombok Strait", "lat": -8.8, "lon": 115.7},
    {"name": "Panama Canal", "lat": 9.0, "lon": -79.6},
]


@dataclass
class GdeltLinkageResult:
    events: List[Dict]
    linkage_counts: Dict[str, int]
    mission_country_codes: Set[str]
    cable_country_codes: Set[str]


@dataclass
class GdeltAotContext:
    region_lat: float
    region_lon: float
    aot_select_sql: str
    aot_filter_sql: str
    aot_filter_not_sql: str
    aot_sql_params: List[object]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
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


def normalize_country_label(value: Optional[str]) -> str:
    if not value:
        return ""
    chars = [char.lower() if char.isalnum() else " " for char in str(value)]
    return " ".join("".join(chars).split())


def flatten_line_strings(geometry: Dict) -> List[List[List[float]]]:
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if geom_type == "LineString":
        return [coords] if len(coords) >= 2 else []
    if geom_type == "MultiLineString":
        return [line for line in coords if len(line) >= 2]
    return []


def h3_region_center(h3_region: str) -> Optional[Tuple[float, float]]:
    try:
        lat, lon = h3.cell_to_latlng(h3_region)
        return float(lat), float(lon)
    except Exception as exc:
        logger.warning("Invalid H3 cell '%s' for GDELT linkage: %s", h3_region, exc)
        return None


def h3_cell_to_wkt(h3_cell: str) -> Optional[str]:
    try:
        boundary = h3.cell_to_boundary(h3_cell)
        coords = [(lon, lat) for lat, lon in boundary]
        coords.append(coords[0])
        ring = ", ".join(f"{lon} {lat}" for lon, lat in coords)
        return f"POLYGON(({ring}))"
    except Exception as exc:
        logger.warning("Invalid H3 cell '%s' for GDELT linkage: %s", h3_cell, exc)
        return None


def build_aot_context(
    *,
    h3_region: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radius_nm: Optional[float] = None,
) -> Optional[GdeltAotContext]:
    if h3_region:
        wkt_polygon = h3_cell_to_wkt(h3_region)
        region_center = h3_region_center(h3_region)
        if not wkt_polygon or region_center is None:
            return None
        region_lat, region_lon = region_center
        return GdeltAotContext(
            region_lat=region_lat,
            region_lon=region_lon,
            aot_select_sql="ST_Within(geom, ST_GeomFromText($2, 4326))",
            aot_filter_sql="ST_Within(geom, ST_GeomFromText($2, 4326))",
            aot_filter_not_sql="NOT ST_Within(geom, ST_GeomFromText($2, 4326))",
            aot_sql_params=[wkt_polygon],
        )

    if lat is not None and lon is not None and radius_nm is not None:
        radius_m = float(radius_nm) * 1852.0
        aot_sql = (
            "ST_DWithin("
            "geom::geography, "
            "ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, "
            "$4"
            ")"
        )
        return GdeltAotContext(
            region_lat=float(lat),
            region_lon=float(lon),
            aot_select_sql=aot_sql,
            aot_filter_sql=aot_sql,
            aot_filter_not_sql=f"NOT {aot_sql}",
            aot_sql_params=[float(lat), float(lon), radius_m],
        )

    return None


def normalize_gdelt_country_code(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    code = str(value).strip().upper()
    return code if code in COUNTRY_NORMALIZED_NAME_BY_CODE else None


def detect_mission_country(lat: float, lon: float) -> Optional[str]:
    best_code: Optional[str] = None
    best_distance_km: Optional[float] = None
    for code, (country_lat, country_lon) in COUNTRY_CENTER_BY_CODE.items():
        distance_km = haversine_km(lat, lon, country_lat, country_lon)
        if best_distance_km is None or distance_km < best_distance_km:
            best_code = code
            best_distance_km = distance_km
    return best_code


def build_mission_country_set(mission_country_code: Optional[str]) -> Set[str]:
    if not mission_country_code:
        return set()
    return {mission_country_code, *COUNTRY_NEIGHBORS.get(mission_country_code, set())}


def build_cable_country_set(cable_countries: Set[str]) -> Set[str]:
    mapped_codes: Set[str] = set()
    for country in cable_countries:
        code = COUNTRY_CODE_BY_NORMALIZED_NAME.get(normalize_country_label(country))
        if code:
            mapped_codes.add(code)
    return mapped_codes


def extract_event_country_codes(event: Dict) -> Set[str]:
    codes: Set[str] = set()
    for field in ("actor1_country", "actor2_country"):
        code = normalize_gdelt_country_code(event.get(field))
        if code:
            codes.add(code)
    return codes


def match_chokepoint(event: Dict) -> Optional[str]:
    lat = event.get("event_latitude")
    lon = event.get("event_longitude")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return None
    for chokepoint in _STRATEGIC_CHOKEPOINTS:
        if haversine_km(float(lat), float(lon), chokepoint["lat"], chokepoint["lon"]) <= _GDELT_CHOKEPOINT_RADIUS_KM:
            return str(chokepoint["name"])
    return None


def classify_gdelt_linkage(
    events: List[Dict],
    *,
    mission_country_codes: Set[str],
    cable_country_codes: Set[str],
) -> Tuple[List[Dict], Dict[str, int]]:
    counts = {
        "in_aot": 0,
        "state_actor": 0,
        "cable_infra": 0,
        "chokepoint": 0,
    }
    admitted_events: List[Dict] = []
    seen_event_ids: Set[str] = set()

    for event in events:
        event_id = str(event.get("event_id_cnty") or event.get("event_id") or "")
        if event_id and event_id in seen_event_ids:
            continue

        linkage_tier: Optional[str] = None
        actor_country_codes = extract_event_country_codes(event)

        if event.get("in_aot"):
            linkage_tier = "in_aot"
        else:
            quad_class = event.get("quad_class")
            if quad_class not in (3, 4):
                continue
            if mission_country_codes & actor_country_codes:
                linkage_tier = "state_actor"
            elif cable_country_codes & actor_country_codes:
                linkage_tier = "cable_infra"
            else:
                chokepoint_name = match_chokepoint(event)
                if chokepoint_name:
                    linkage_tier = "chokepoint"
                    event["linkage_chokepoint"] = chokepoint_name

        if not linkage_tier:
            continue

        event["linkage_tier"] = linkage_tier
        admitted_events.append(event)
        counts[linkage_tier] += 1
        if event_id:
            seen_event_ids.add(event_id)

    return admitted_events, counts


def format_gdelt_linkage_notes(linkage_counts: Dict[str, int]) -> str:
    return (
        f"{linkage_counts['in_aot']} in-AOT, "
        f"{linkage_counts['state_actor']} state-actor/border, "
        f"{linkage_counts['cable_infra']} cable-infra, "
        f"{linkage_counts['chokepoint']} maritime-chokepoint"
    )


def derive_cable_relevant_countries_from_index(
    cable_index: Dict,
    cables_data: Dict,
    region_lat: float,
    region_lon: float,
) -> Set[str]:
    relevant_country_keys: Set[str] = set()
    cable_entries = cable_index.get("cables", {}) if isinstance(cable_index, dict) else {}
    country_entries = cable_index.get("countries", {}) if isinstance(cable_index, dict) else {}

    for cable_feature in cables_data.get("features", []):
        cable_props = cable_feature.get("properties", {})
        cable_id = cable_props.get("id") or cable_props.get("feature_id") or cable_props.get("name")
        if not cable_id:
            continue
        min_distance_km: Optional[float] = None
        for line in flatten_line_strings(cable_feature.get("geometry", {})):
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


async def fetch_linked_gdelt_events(
    conn,
    redis_client,
    *,
    h3_region: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radius_nm: Optional[float] = None,
    lookback_hours: int,
) -> GdeltLinkageResult:
    empty_counts = {
        "in_aot": 0,
        "state_actor": 0,
        "cable_infra": 0,
        "chokepoint": 0,
    }
    aot_context = build_aot_context(
        h3_region=h3_region,
        lat=lat,
        lon=lon,
        radius_nm=radius_nm,
    )
    if aot_context is None:
        return GdeltLinkageResult([], empty_counts, set(), set())

    mission_country_codes = build_mission_country_set(
        detect_mission_country(aot_context.region_lat, aot_context.region_lon)
    )
    cable_country_codes: Set[str] = set()
    if redis_client:
        cable_index_raw = await redis_client.get("infra:cable_country_index")
        cables_raw = await redis_client.get("infra:cables")
        cable_index = json.loads(cable_index_raw) if cable_index_raw else {}
        cables_data = json.loads(cables_raw) if cables_raw else {"features": []}
        cable_country_codes = build_cable_country_set(
            derive_cable_relevant_countries_from_index(
                cable_index,
                cables_data,
                aot_context.region_lat,
                aot_context.region_lon,
            )
        )

    mission_actor_param = 2 + len(aot_context.aot_sql_params)
    cable_actor_param = mission_actor_param + 1
    candidate_query = f"""
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
            goldstein,
            {aot_context.aot_select_sql} AS in_aot
        FROM gdelt_events
        WHERE time > now() - ($1 * interval '1 hour')
          AND (
            {aot_context.aot_filter_sql}
            OR (
              quad_class >= 3
              AND (
                actor1_country = ANY(${mission_actor_param}::text[])
                OR actor2_country = ANY(${mission_actor_param}::text[])
                OR actor1_country = ANY(${cable_actor_param}::text[])
                OR actor2_country = ANY(${cable_actor_param}::text[])
              )
            )
          )
        ORDER BY time DESC
    """
    candidate_rows = await conn.fetch(
        candidate_query,
        lookback_hours,
        *aot_context.aot_sql_params,
        sorted(mission_country_codes),
        sorted(cable_country_codes),
    )

    chokepoint_clause_parts: List[str] = []
    chokepoint_query_params: List[object] = [lookback_hours, *aot_context.aot_sql_params]
    param_index = 2 + len(aot_context.aot_sql_params)
    for chokepoint in _STRATEGIC_CHOKEPOINTS:
        chokepoint_clause_parts.append(
            "ST_DWithin("
            "geom::geography, "
            f"ST_SetSRID(ST_MakePoint(${param_index + 1}, ${param_index}), 4326)::geography, "
            f"${param_index + 2}"
            ")"
        )
        chokepoint_query_params.extend(
            [
                chokepoint["lat"],
                chokepoint["lon"],
                _GDELT_CHOKEPOINT_RADIUS_KM * 1000.0,
            ]
        )
        param_index += 3

    chokepoint_rows = []
    if chokepoint_clause_parts:
        chokepoint_query = f"""
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
                goldstein,
                FALSE AS in_aot
            FROM gdelt_events
            WHERE time > now() - ($1 * interval '1 hour')
              AND quad_class >= 3
              AND {aot_context.aot_filter_not_sql}
              AND ({' OR '.join(chokepoint_clause_parts)})
            ORDER BY time DESC
        """
        chokepoint_rows = await conn.fetch(chokepoint_query, *chokepoint_query_params)

    events, linkage_counts = classify_gdelt_linkage(
        [dict(row) for row in candidate_rows] + [dict(row) for row in chokepoint_rows],
        mission_country_codes=mission_country_codes,
        cable_country_codes=cable_country_codes,
    )
    return GdeltLinkageResult(
        events=events,
        linkage_counts=linkage_counts,
        mission_country_codes=mission_country_codes,
        cable_country_codes=cable_country_codes,
    )


__all__ = [
    "GDELT_LINKAGE_REASON",
    "GdeltLinkageResult",
    "build_aot_context",
    "build_cable_country_set",
    "build_mission_country_set",
    "classify_gdelt_linkage",
    "detect_mission_country",
    "fetch_linked_gdelt_events",
    "format_gdelt_linkage_notes",
]

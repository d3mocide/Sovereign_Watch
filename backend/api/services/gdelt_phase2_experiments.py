from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Set

from routers.gdelt_country_codes import COUNTRY_NAME_BY_CODE, COUNTRY_NEIGHBORS
from services.gdelt_linkage import (
    build_aot_context,
    detect_mission_country,
    extract_event_country_codes,
    fetch_linked_gdelt_events,
)

EXPERIMENTAL_REFERENCE_VERSION = "2026-04-11-v1"

# Reviewable, intentionally narrow reference sets for corpus evaluation only.
# These are not wired into live admission logic.
EXPERIMENTAL_ALLIANCE_SUPPORT_COUNTRIES: Dict[str, Set[str]] = {
    "POL": {"DEU", "GBR", "USA"},
    "LTU": {"DEU", "GBR", "POL", "USA"},
    "ARE": {"FRA", "GBR", "USA"},
}

EXPERIMENTAL_BASING_SUPPORT_COUNTRIES: Dict[str, Set[str]] = {
    "POL": {"DEU", "ROU"},
    "ARE": {"BHR", "DJI", "QAT"},
    "OMN": {"ARE", "BHR", "DJI", "QAT"},
}


@dataclass(frozen=True)
class ExperimentalCountrySets:
    mission_and_first_order: Set[str]
    mission_and_second_order: Set[str]
    alliance_support: Set[str]
    basing_support: Set[str]


_MISSION_COUNTRY_TEXT_ALIASES: Dict[str, Set[str]] = {
    "ARE": {"uae", "emirati", "emirates", "united arab emirates", "abu dhabi", "dubai"},
    "USA": {"united states", "u.s.", "us", "america", "american"},
    "GBR": {"united kingdom", "uk", "britain", "british"},
}


def _normalize_text(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.casefold().replace("-", " ").replace("/", " ").split())


def _mission_country_terms(country_code: str | None) -> Set[str]:
    if not country_code:
        return set()

    terms = set(_MISSION_COUNTRY_TEXT_ALIASES.get(country_code, set()))
    country_name = COUNTRY_NAME_BY_CODE.get(country_code)
    normalized_country_name = _normalize_text(country_name)
    if normalized_country_name:
        terms.add(normalized_country_name)
    return {term for term in terms if term}


def _headline_mentions_mission_country(event_text: object, mission_country_code: str | None) -> bool:
    normalized_text = _normalize_text(event_text)
    if not normalized_text:
        return False
    return any(term in normalized_text for term in _mission_country_terms(mission_country_code))


def _support_matches_need_mission_relation(
    *,
    actor_country_codes: Set[str],
    mission_country_code: str | None,
    mission_and_first_order: Set[str],
    event_text: object,
) -> Dict[str, object]:
    mission_relation = sorted(actor_country_codes & mission_and_first_order)
    headline_mentions_mission = _headline_mentions_mission_country(event_text, mission_country_code)
    return {
        "mission_relation_country_codes": mission_relation,
        "headline_mentions_mission": headline_mentions_mission,
        "support_relation_confirmed": bool(mission_relation) or headline_mentions_mission,
    }


def expand_country_neighbors(country_code: str | None, *, max_depth: int = 1) -> Set[str]:
    if not country_code:
        return set()
    if max_depth < 0:
        return {country_code}

    visited: Set[str] = {country_code}
    frontier: Set[str] = {country_code}

    for _ in range(max_depth):
        next_frontier: Set[str] = set()
        for code in frontier:
            next_frontier.update(COUNTRY_NEIGHBORS.get(code, set()))
        next_frontier -= visited
        if not next_frontier:
            break
        visited.update(next_frontier)
        frontier = next_frontier

    return visited


def build_experimental_country_sets(
    mission_country_code: str | None,
) -> ExperimentalCountrySets:
    mission_and_first_order = expand_country_neighbors(mission_country_code, max_depth=1)
    mission_and_second_order = expand_country_neighbors(mission_country_code, max_depth=2)
    alliance_support = set(EXPERIMENTAL_ALLIANCE_SUPPORT_COUNTRIES.get(mission_country_code or "", set()))
    basing_support = set(EXPERIMENTAL_BASING_SUPPORT_COUNTRIES.get(mission_country_code or "", set()))
    return ExperimentalCountrySets(
        mission_and_first_order=mission_and_first_order,
        mission_and_second_order=mission_and_second_order,
        alliance_support=alliance_support,
        basing_support=basing_support,
    )


def evaluate_experimental_country_matches(
    actor_country_codes: Set[str],
    mission_country_code: str | None,
    *,
    event_text: object = None,
) -> Dict[str, object]:
    country_sets = build_experimental_country_sets(mission_country_code)
    first_order_matches = sorted(actor_country_codes & country_sets.mission_and_first_order)
    second_order_matches = sorted(actor_country_codes & country_sets.mission_and_second_order)
    support_relation = _support_matches_need_mission_relation(
        actor_country_codes=actor_country_codes,
        mission_country_code=mission_country_code,
        mission_and_first_order=country_sets.mission_and_first_order,
        event_text=event_text,
    )
    alliance_matches = sorted(actor_country_codes & country_sets.alliance_support)
    basing_matches = sorted(actor_country_codes & country_sets.basing_support)

    if not support_relation["support_relation_confirmed"]:
        alliance_matches = []
        basing_matches = []

    return {
        "reference_version": EXPERIMENTAL_REFERENCE_VERSION,
        "first_order_matches": first_order_matches,
        "second_order_only_matches": [
            code for code in second_order_matches if code not in country_sets.mission_and_first_order
        ],
        "alliance_matches": alliance_matches,
        "basing_matches": basing_matches,
        **({
            "support_relation": support_relation,
        } if alliance_matches or basing_matches else {}),
    }


__all__ = [
    "EXPERIMENTAL_ALLIANCE_SUPPORT_COUNTRIES",
    "EXPERIMENTAL_BASING_SUPPORT_COUNTRIES",
    "EXPERIMENTAL_REFERENCE_VERSION",
    "ExperimentalCountrySets",
    "build_experimental_country_sets",
    "evaluate_experimental_country_matches",
    "fetch_experimental_linkage_review",
    "expand_country_neighbors",
]


async def fetch_experimental_linkage_review(
    conn,
    redis_client,
    *,
    h3_region: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radius_nm: Optional[float] = None,
    lookback_hours: int,
    limit: int = 25,
) -> Dict[str, object]:
    aot_context = build_aot_context(
        h3_region=h3_region,
        lat=lat,
        lon=lon,
        radius_nm=radius_nm,
    )
    if aot_context is None:
        return {
            "reference_version": EXPERIMENTAL_REFERENCE_VERSION,
            "mission_country_code": None,
            "live": {"counts": {}, "sample": []},
            "experimental": {"counts": {}, "sample": []},
            "comparison": {"overlap_count": 0, "live_only_count": 0, "experimental_only_count": 0},
        }

    live_result = await fetch_linked_gdelt_events(
        conn,
        redis_client,
        h3_region=h3_region,
        lat=lat,
        lon=lon,
        radius_nm=radius_nm,
        lookback_hours=lookback_hours,
    )
    live_by_id = {
        str(event.get("event_id_cnty") or event.get("event_id") or ""): event
        for event in live_result.events
        if event.get("event_id_cnty") or event.get("event_id")
    }
    live_ids = {event_id for event_id in live_by_id if event_id}

    mission_country_code = detect_mission_country(aot_context.region_lat, aot_context.region_lon)
    country_sets = build_experimental_country_sets(mission_country_code)
    second_order_only = sorted(
        country_sets.mission_and_second_order - country_sets.mission_and_first_order,
    )
    alliance_support = sorted(country_sets.alliance_support)
    basing_support = sorted(country_sets.basing_support)

    candidate_country_codes = sorted(set(second_order_only) | set(alliance_support) | set(basing_support))
    if not candidate_country_codes:
        return {
            "reference_version": EXPERIMENTAL_REFERENCE_VERSION,
            "mission_country_code": mission_country_code,
            "live": {
                "counts": live_result.linkage_counts,
                "sample": live_result.events[:limit],
            },
            "experimental": {
                "counts": {
                    "second_order_only": 0,
                    "alliance_support": 0,
                    "basing_support": 0,
                },
                "sample": [],
                "country_sets": {
                    "second_order_only": second_order_only,
                    "alliance_support": alliance_support,
                    "basing_support": basing_support,
                },
            },
            "comparison": {
                "overlap_count": 0,
                "live_only_count": len(live_ids),
                "experimental_only_count": 0,
            },
        }

    mission_actor_param = 2 + len(aot_context.aot_sql_params)
    candidate_query = f"""
        SELECT
            event_id AS event_id_cnty,
            to_char(COALESCE(event_date, time::date), 'YYYYMMDD') AS event_date,
            time,
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
          AND quad_class >= 3
          AND {aot_context.aot_filter_not_sql}
          AND (
            actor1_country = ANY(${mission_actor_param}::text[])
            OR actor2_country = ANY(${mission_actor_param}::text[])
          )
        ORDER BY time DESC
        LIMIT ${mission_actor_param + 1}
    """
    candidate_rows = await conn.fetch(
        candidate_query,
        lookback_hours,
        *aot_context.aot_sql_params,
        candidate_country_codes,
        max(limit * 4, limit),
    )

    experimental_counts = {
        "second_order_only": 0,
        "alliance_support": 0,
        "basing_support": 0,
    }
    experimental_sample = []
    experimental_ids: Set[str] = set()

    for row in candidate_rows:
        event = dict(row)
        event_id = str(event.get("event_id_cnty") or event.get("event_id") or "")
        actor_country_codes = extract_event_country_codes(event)
        matches = evaluate_experimental_country_matches(
            actor_country_codes,
            mission_country_code,
            event_text=event.get("event_text"),
        )
        reasons: list[str] = []
        if matches["second_order_only_matches"]:
            reasons.append("second_order_neighbor")
            experimental_counts["second_order_only"] += 1
        if matches["alliance_matches"]:
            reasons.append("alliance_support")
            experimental_counts["alliance_support"] += 1
        if matches["basing_matches"]:
            reasons.append("basing_support")
            experimental_counts["basing_support"] += 1
        if not reasons:
            continue

        event["experimental_reasons"] = reasons
        event["experimental_evidence"] = {
            key: value
            for key, value in matches.items()
            if key != "reference_version" and value
        }
        event["live_admitted"] = event_id in live_ids
        if event["live_admitted"]:
            live_event = live_by_id.get(event_id, {})
            event["live_linkage_tier"] = live_event.get("linkage_tier")
            event["live_linkage_score"] = live_event.get("linkage_score")
        experimental_sample.append(event)
        if event_id:
            experimental_ids.add(event_id)
        if len(experimental_sample) >= limit:
            break

    overlap_ids = live_ids & experimental_ids
    return {
        "reference_version": EXPERIMENTAL_REFERENCE_VERSION,
        "mission_country_code": mission_country_code,
        "live": {
            "counts": live_result.linkage_counts,
            "sample": live_result.events[:limit],
        },
        "experimental": {
            "counts": experimental_counts,
            "sample": experimental_sample,
            "country_sets": {
                "second_order_only": second_order_only,
                "alliance_support": alliance_support,
                "basing_support": basing_support,
            },
        },
        "comparison": {
            "overlap_count": len(overlap_ids),
            "live_only_count": len(live_ids - experimental_ids),
            "experimental_only_count": len(experimental_ids - live_ids),
        },
    }
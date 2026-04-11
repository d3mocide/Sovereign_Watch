from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Set

from routers.gdelt_country_codes import COUNTRY_NAME_BY_CODE, COUNTRY_NEIGHBORS


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

    second_order_only_matches = [
        code for code in second_order_matches if code not in country_sets.mission_and_first_order
    ]

    if not support_relation["support_relation_confirmed"]:
        alliance_matches = []
        basing_matches = []
        second_order_only_matches = []

    return {
        "reference_version": EXPERIMENTAL_REFERENCE_VERSION,
        "first_order_matches": first_order_matches,
        "second_order_only_matches": second_order_only_matches,
        "alliance_matches": alliance_matches,
        "basing_matches": basing_matches,
        **({
            "support_relation": support_relation,
        } if alliance_matches or basing_matches or second_order_only_matches else {}),
    }


__all__ = [
    "EXPERIMENTAL_ALLIANCE_SUPPORT_COUNTRIES",
    "EXPERIMENTAL_BASING_SUPPORT_COUNTRIES",
    "EXPERIMENTAL_REFERENCE_VERSION",
    "ExperimentalCountrySets",
    "build_experimental_country_sets",
    "evaluate_experimental_country_matches",
    "fetch_linkage_audit",
    "expand_country_neighbors",
]


async def fetch_linkage_audit(
    conn,
    redis_client,
    *,
    h3_region: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radius_nm: Optional[float] = None,
    lookback_hours: int,
    limit: int = 40,
) -> Dict[str, object]:
    from services.gdelt_linkage import (
        build_aot_context,
        detect_mission_country,
        fetch_linked_gdelt_events,
    )
    
    aot_context = build_aot_context(h3_region=h3_region, lat=lat, lon=lon, radius_nm=radius_nm)
    if aot_context is None:
        return {
            "reference_version": EXPERIMENTAL_REFERENCE_VERSION,
            "mission_country_code": None,
            "counts": {},
            "sample": [],
            "country_sets": {"second_order": [], "alliance_support": [], "basing_support": []}
        }

    mission_country_code = detect_mission_country(aot_context.region_lat, aot_context.region_lon)
    country_sets = build_experimental_country_sets(mission_country_code)

    live_result = await fetch_linked_gdelt_events(
        conn, redis_client, h3_region=h3_region, lat=lat, lon=lon, 
        radius_nm=radius_nm, lookback_hours=lookback_hours
    )

    return {
        "reference_version": EXPERIMENTAL_REFERENCE_VERSION,
        "mission_country_code": mission_country_code,
        "counts": live_result.linkage_counts,
        "sample": live_result.events[:limit],
        "country_sets": {
            "second_order": sorted(country_sets.mission_and_second_order - country_sets.mission_and_first_order),
            "alliance_support": sorted(country_sets.alliance_support),
            "basing_support":  sorted(country_sets.basing_support)
        }
    }

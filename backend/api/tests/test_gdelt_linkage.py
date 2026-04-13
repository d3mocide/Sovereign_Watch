"""Unit tests for GDELT mission-linkage helpers (admission tiers and scoring)."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

import services.gdelt_linkage as gdelt_linkage  # noqa: E402


def test_detect_mission_country_uses_nearest_country_centroid():
    assert gdelt_linkage.detect_mission_country(48.38, 31.17) == "UKR"


def test_build_mission_country_set_expands_first_order_neighbors():
    country_set = gdelt_linkage.build_mission_country_set("UKR")

    assert "UKR" in country_set
    assert "RUS" in country_set
    assert "BLR" in country_set


def test_build_cable_country_set_maps_normalized_landing_names_to_codes():
    assert gdelt_linkage.build_cable_country_set({"Russia", "United States", "Tanzania"}) == {
        "RUS",
        "TZA",
        "USA",
    }


def test_classify_gdelt_linkage_buckets_events_by_phase1_rules():
    events = [
        {
            "event_id_cnty": "in-aot",
            "event_latitude": 49.0,
            "event_longitude": 32.0,
            "in_aot": True,
            "goldstein": -8.0,
        },
        {
            "event_id_cnty": "state",
            "event_latitude": 55.75,
            "event_longitude": 37.62,
            "quad_class": 4,
            "actor1_country": "RUS",
            "in_aot": False,
            "goldstein": -7.0,
        },
        {
            "event_id_cnty": "cable",
            "event_latitude": 51.5,
            "event_longitude": -0.12,
            "quad_class": 4,
            "actor1_country": "GBR",
            "in_aot": False,
            "goldstein": -6.0,
        },
        {
            "event_id_cnty": "chokepoint",
            "event_latitude": 26.5,
            "event_longitude": 56.3,
            "quad_class": 4,
            "actor1_country": "BRA",
            "in_aot": False,
            "goldstein": -4.0,
        },
        {
            "event_id_cnty": "excluded",
            "event_latitude": 50.45,
            "event_longitude": 30.52,
            "quad_class": 2,
            "actor1_country": "UKR",
            "in_aot": False,
        },
    ]

    admitted, counts = gdelt_linkage.classify_gdelt_linkage(
        events,
        mission_country_codes={"UKR", "RUS", "BLR"},
        cable_country_codes={"GBR"},
        primary_mission_country_code="UKR",
    )

    tiers = {event["event_id_cnty"]: event["linkage_tier"] for event in admitted}
    scores = {event["event_id_cnty"]: event["linkage_score"] for event in admitted}
    evidence = {event["event_id_cnty"]: event["linkage_evidence"] for event in admitted}

    assert tiers == {
        "in-aot": "in_aot",
        "state": "state_actor",
        "cable": "cable_infra",
        "chokepoint": "chokepoint",
    }
    assert counts == {
        "in_aot": 1,
        "state_actor": 1,
        "cable_infra": 1,
        "chokepoint": 1, "alliance_support": 0, "basing_support": 0, "second_order_neighbor": 0, 
    }
    assert next(event for event in admitted if event["event_id_cnty"] == "chokepoint")["linkage_chokepoint"] == "Strait of Hormuz"
    assert scores["in-aot"] == 1.0
    assert scores["state"] == 0.8
    assert scores["cable"] == 0.85
    assert scores["chokepoint"] == 0.65
    assert evidence["in-aot"] == {"matched_aot": True}
    assert evidence["state"] == {"matched_country_codes": ["RUS"], "neighbor_depth": 1}
    assert evidence["cable"] == {"matched_cable_country_codes": ["GBR"]}
    assert evidence["chokepoint"] == {
        "matched_chokepoint": "Strait of Hormuz",
        "chokepoint_theaters": ["CENTCOM", "INDOPACOM"],
    }


def test_classify_gdelt_linkage_scores_direct_state_actor_above_neighbor_match():
    events = [
        {
            "event_id_cnty": "direct",
            "quad_class": 4,
            "actor1_country": "UKR",
            "goldstein": -7.0,
            "in_aot": False,
        },
        {
            "event_id_cnty": "neighbor",
            "quad_class": 4,
            "actor1_country": "RUS",
            "goldstein": -7.0,
            "in_aot": False,
        },
    ]

    admitted, _ = gdelt_linkage.classify_gdelt_linkage(
        events,
        mission_country_codes={"UKR", "RUS", "BLR"},
        cable_country_codes=set(),
        primary_mission_country_code="UKR",
    )

    scores = {event["event_id_cnty"]: event["linkage_score"] for event in admitted}
    evidence = {event["event_id_cnty"]: event["linkage_evidence"] for event in admitted}

    assert scores["direct"] == 1.0
    assert scores["neighbor"] == 0.8
    assert evidence["direct"]["neighbor_depth"] == 0
    assert evidence["neighbor"]["neighbor_depth"] == 1


def test_classify_gdelt_linkage_orders_admitted_events_by_linkage_score():
    events = [
        {
            "event_id_cnty": "lower-score",
            "event_latitude": 49.0,
            "event_longitude": 32.0,
            "quad_class": 4,
            "actor1_country": "RUS",
            "goldstein": -3.0,
            "in_aot": False,
        },
        {
            "event_id_cnty": "higher-score",
            "event_latitude": 49.1,
            "event_longitude": 32.1,
            "in_aot": True,
            "goldstein": -8.0,
        },
    ]

    admitted, _ = gdelt_linkage.classify_gdelt_linkage(
        events,
        mission_country_codes={"UKR", "RUS", "BLR"},
        cable_country_codes=set(),
        primary_mission_country_code="UKR",
    )

    assert [event["event_id_cnty"] for event in admitted] == ["higher-score", "lower-score"]


def test_classify_gdelt_linkage_boosts_theater_aligned_chokepoint_score():
    events = [
        {
            "event_id_cnty": "aligned",
            "event_latitude": 26.5,
            "event_longitude": 56.3,
            "quad_class": 4,
            "actor1_country": "BRA",
            "goldstein": -4.0,
            "in_aot": False,
        },
        {
            "event_id_cnty": "non-aligned",
            "event_latitude": 26.5,
            "event_longitude": 56.3,
            "quad_class": 4,
            "actor1_country": "BRA",
            "goldstein": -4.0,
            "in_aot": False,
        },
    ]

    admitted_aligned, _ = gdelt_linkage.classify_gdelt_linkage(
        [events[0]],
        mission_country_codes={"ARE"},
        cable_country_codes=set(),
        primary_mission_country_code="ARE",
    )
    admitted_non_aligned, _ = gdelt_linkage.classify_gdelt_linkage(
        [events[1]],
        mission_country_codes={"UKR", "RUS", "BLR"},
        cable_country_codes=set(),
        primary_mission_country_code="UKR",
    )

    assert admitted_aligned[0]["linkage_tier"] == "chokepoint"
    assert admitted_non_aligned[0]["linkage_tier"] == "chokepoint"
    assert admitted_aligned[0]["linkage_score"] == 0.85
    assert admitted_non_aligned[0]["linkage_score"] == 0.65
    assert admitted_aligned[0]["linkage_evidence"]["matched_theater"] == "CENTCOM"
    assert admitted_aligned[0]["linkage_evidence"]["chokepoint_theaters"] == ["CENTCOM", "INDOPACOM"]
    assert "matched_theater" not in admitted_non_aligned[0]["linkage_evidence"]


def test_classify_gdelt_linkage_cable_event_ranks_above_weak_neighbor_noise():
    """Cable-linked event outranks a low-signal neighbor state_actor event."""
    events = [
        {
            # Cable-linked: GBR in cable_country_codes; strong quad + Goldstein
            "event_id_cnty": "cable",
            "event_latitude": 51.5,
            "event_longitude": -0.12,
            "in_aot": False,
            "quad_class": 4,
            "actor1_country": "GBR",
            "goldstein": -6.0,
        },
        {
            # Neighbor state-actor: weaker quad, no Goldstein boost
            "event_id_cnty": "neighbor-noise",
            "event_latitude": 52.2,
            "event_longitude": 21.0,
            "in_aot": False,
            "quad_class": 3,
            "actor1_country": "POL",
            "goldstein": -1.0,
        },
    ]

    admitted, counts = gdelt_linkage.classify_gdelt_linkage(
        events,
        mission_country_codes={"UKR", "RUS", "BLR", "POL"},
        cable_country_codes={"GBR"},
        primary_mission_country_code="UKR",
    )

    tiers = {e["event_id_cnty"]: e["linkage_tier"] for e in admitted}
    scores = {e["event_id_cnty"]: e["linkage_score"] for e in admitted}

    assert tiers["cable"] == "cable_infra"
    assert tiers["neighbor-noise"] == "state_actor"
    # cable: 0.70 + 0.10 (quad=4) + 0.05 (goldstein<=-5) = 0.85
    assert scores["cable"] == 0.85
    # neighbor: 0.65 (depth=1, POL not primary) + 0 (quad=3) = 0.65
    assert scores["neighbor-noise"] == 0.65
    assert scores["cable"] > scores["neighbor-noise"]
    assert [e["event_id_cnty"] for e in admitted] == ["cable", "neighbor-noise"]

    assert counts["cable_infra"] == 1
    assert counts["state_actor"] == 1


def test_classify_gdelt_linkage_excludes_events_with_no_hard_gate_match():
    """Events that pass no admission gate are never returned."""
    events = [
        {
            # quad_class=2 — cooperation; excluded regardless of country match
            "event_id_cnty": "low-quad",
            "event_latitude": 50.45,
            "event_longitude": 30.52,
            "in_aot": False,
            "quad_class": 2,
            "actor1_country": "UKR",
            "goldstein": 1.0,
        },
        {
            # quad_class=4 but actor unrelated to mission, cable, or any chokepoint
            "event_id_cnty": "unrelated-far",
            "event_latitude": -33.87,
            "event_longitude": 151.21,  # Sydney — far from all chokepoints
            "in_aot": False,
            "quad_class": 4,
            "actor1_country": "AUS",
            "goldstein": -7.0,
        },
    ]

    admitted, counts = gdelt_linkage.classify_gdelt_linkage(
        events,
        mission_country_codes={"UKR", "RUS", "BLR"},
        cable_country_codes={"GBR"},
        primary_mission_country_code="UKR",
    )

    assert len(admitted) == 0
    assert sum(counts.values()) == 0
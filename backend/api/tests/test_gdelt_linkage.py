"""Unit tests for Phase 1 GDELT mission-linkage helpers."""

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
        },
        {
            "event_id_cnty": "state",
            "event_latitude": 55.75,
            "event_longitude": 37.62,
            "quad_class": 4,
            "actor1_country": "RUS",
            "in_aot": False,
        },
        {
            "event_id_cnty": "cable",
            "event_latitude": 51.5,
            "event_longitude": -0.12,
            "quad_class": 4,
            "actor1_country": "GBR",
            "in_aot": False,
        },
        {
            "event_id_cnty": "chokepoint",
            "event_latitude": 26.5,
            "event_longitude": 56.3,
            "quad_class": 4,
            "actor1_country": "BRA",
            "in_aot": False,
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
    )

    tiers = {event["event_id_cnty"]: event["linkage_tier"] for event in admitted}

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
        "chokepoint": 1,
    }
    assert next(event for event in admitted if event["event_id_cnty"] == "chokepoint")["linkage_chokepoint"] == "Strait of Hormuz"
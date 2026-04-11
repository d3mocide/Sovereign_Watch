from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

import services.gdelt_linkage as gdelt_linkage  # noqa: E402
import services.gdelt_phase2_experiments as phase2_experiments  # noqa: E402


def test_expand_country_neighbors_supports_second_order_review():
    first_order = phase2_experiments.expand_country_neighbors("UKR", max_depth=1)
    second_order = phase2_experiments.expand_country_neighbors("UKR", max_depth=2)

    assert "DEU" not in first_order
    assert "DEU" in second_order


def test_evaluate_experimental_country_matches_flags_second_order_only_matches():
    matches = phase2_experiments.evaluate_experimental_country_matches({"DEU"}, "UKR", event_text="ukraine")

    assert matches["first_order_matches"] == []
    assert matches["second_order_only_matches"] == ["DEU"]
    assert matches["alliance_matches"] == []
    assert matches["basing_matches"] == []


def test_evaluate_experimental_country_matches_uses_explicit_alliance_reference():
    matches = phase2_experiments.evaluate_experimental_country_matches(
        {"USA", "POL"},
        "POL",
        event_text="US and Polish forces coordinate logistics support",
    )

    assert matches["alliance_matches"] == ["USA"]
    assert matches["basing_matches"] == []
    assert matches["support_relation"]["mission_relation_country_codes"] == ["POL"]


def test_evaluate_experimental_country_matches_uses_explicit_basing_reference():
    matches = phase2_experiments.evaluate_experimental_country_matches(
        {"QAT"},
        "ARE",
        event_text="Qatar expands logistics support for UAE operations",
    )

    assert matches["alliance_matches"] == []
    assert matches["basing_matches"] == ["QAT"]


def test_evaluate_experimental_country_matches_rejects_support_country_without_mission_relation():
    matches = phase2_experiments.evaluate_experimental_country_matches(
        {"USA"},
        "ARE",
        event_text="United States issues regional warning after exchange with Iran",
    )

    assert matches["alliance_matches"] == []
    assert matches["basing_matches"] == []


def test_live_gdelt_classification_still_excludes_experimental_only_matches():
    admitted, counts = gdelt_linkage.classify_gdelt_linkage(
        [
            {
                "event_id_cnty": "alliance-only",
                "event_latitude": 52.2,
                "event_longitude": 21.0,
                "quad_class": 4,
                "actor1_country": "USA",
                "goldstein": -6.0,
                "in_aot": False,
            },
            {
                "event_id_cnty": "second-order-only",
                "event_latitude": 52.5,
                "event_longitude": 13.4,
                "quad_class": 4,
                "actor1_country": "DEU",
                "goldstein": -6.0,
                "in_aot": False,
            },
        ],
        mission_country_codes={"UKR", "RUS", "BLR"},
        cable_country_codes=set(),
        primary_mission_country_code="UKR",
    )

    assert admitted == []
    assert counts == {
        "in_aot": 0,
        "state_actor": 0,
        "cable_infra": 0,
        "chokepoint": 0, "alliance_support": 0, "basing_support": 0, "second_order_neighbor": 0, 
    }
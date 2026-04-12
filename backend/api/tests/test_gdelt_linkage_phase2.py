"""Phase 2 regression corpus for GDELT mission-linkage scoring.

Five labeled scenarios that prove score ordering without changing admission
decisions. The hard admission tier logic remains deterministic and is not
altered by this scoring layer.

Scenarios
---------
1. Direct in-AOT conflict — highest admission confidence.
2. Neighbor-country spillover — admitted but ranked below in-AOT.
3. Cable-linked external event — admitted and ranked above neighbor-only noise.
4. Theater-aligned vs non-aligned chokepoint — both admitted; aligned scores
   higher.
5. External event with no hard-gate match — must remain excluded.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

import services.gdelt_linkage as gdelt_linkage  # noqa: E402


# ---------------------------------------------------------------------------
# Scenario 1 — Direct in-AOT conflict
# An event positioned inside the active mission AOT receives `in_aot` tier
# and the maximum possible linkage_score (1.0 before modifiers; capped at 1.0).
# ---------------------------------------------------------------------------


def test_scenario1_in_aot_conflict_is_admitted_with_maximum_score():
    """Scenario 1: direct in-AOT event → tier=in_aot, score=1.0."""
    events = [
        {
            "event_id_cnty": "s1-in-aot",
            "event_latitude": 50.45,
            "event_longitude": 30.52,
            "in_aot": True,
            "quad_class": 4,
            "goldstein": -8.0,
            "actor1_country": "UKR",
        }
    ]

    admitted, counts = gdelt_linkage.classify_gdelt_linkage(
        events,
        mission_country_codes={"UKR", "RUS", "BLR"},
        cable_country_codes=set(),
        primary_mission_country_code="UKR",
    )

    assert len(admitted) == 1
    event = admitted[0]
    assert event["linkage_tier"] == "in_aot"
    # goldstein <= -5 adds +0.05 and quad_class=4 adds +0.10; both are capped at 1.0
    assert event["linkage_score"] == 1.0
    assert event["linkage_evidence"]["matched_aot"] is True
    assert counts["in_aot"] == 1


# ---------------------------------------------------------------------------
# Scenario 2 — Neighbor-country spillover ranked below in-AOT
# A mission-neighbor event is admitted as `state_actor` but must rank below
# a simultaneous in-AOT event, proving the score ordering contract.
# ---------------------------------------------------------------------------


def test_scenario2_neighbor_spillover_admitted_but_ranked_below_in_aot():
    """Scenario 2: neighbor event admitted as state_actor, ranked below in-AOT."""
    events = [
        {
            # Neighbor only — RUS is in mission_country_codes but not the primary
            "event_id_cnty": "s2-neighbor",
            "event_latitude": 55.75,
            "event_longitude": 37.62,
            "in_aot": False,
            "quad_class": 4,
            "actor1_country": "RUS",
            "goldstein": -7.0,
        },
        {
            "event_id_cnty": "s2-in-aot",
            "event_latitude": 50.45,
            "event_longitude": 30.52,
            "in_aot": True,
            "quad_class": 4,
            "goldstein": -8.0,
        },
    ]

    admitted, counts = gdelt_linkage.classify_gdelt_linkage(
        events,
        mission_country_codes={"UKR", "RUS", "BLR"},
        cable_country_codes=set(),
        primary_mission_country_code="UKR",
    )

    tiers = {e["event_id_cnty"]: e["linkage_tier"] for e in admitted}
    scores = {e["event_id_cnty"]: e["linkage_score"] for e in admitted}
    evidence = {e["event_id_cnty"]: e["linkage_evidence"] for e in admitted}

    assert tiers["s2-in-aot"] == "in_aot"
    assert tiers["s2-neighbor"] == "state_actor"

    # neighbor_depth=1 (RUS is neighbor of UKR, not primary)
    assert evidence["s2-neighbor"]["neighbor_depth"] == 1

    # Ordering: in-AOT must rank first
    ordered_ids = [e["event_id_cnty"] for e in admitted]
    assert ordered_ids.index("s2-in-aot") < ordered_ids.index("s2-neighbor")

    # Score: in-AOT always >= neighbor
    assert scores["s2-in-aot"] >= scores["s2-neighbor"]
    assert scores["s2-in-aot"] == 1.0
    # neighbor: 0.65 base + 0.10 (quad_class=4) + 0.05 (goldstein<=-5) = 0.80
    assert scores["s2-neighbor"] == 0.80

    assert counts["in_aot"] == 1
    assert counts["state_actor"] == 1


# ---------------------------------------------------------------------------
# Scenario 3 — Cable-linked external event ranked above neighbor-only noise
# An event linked via submarine cable proximity (high geopolitical relevance)
# should score higher than an unrelated first-order neighbor state-actor event
# when the cable event carries strong quad_class + Goldstein signals.
# ---------------------------------------------------------------------------


def test_scenario3_cable_event_ranks_above_weak_neighbor_noise():
    """Scenario 3: cable_infra event outranks low-signal neighbor state_actor."""
    events = [
        {
            # Cable-linked: GBR is in cable_country_codes; strong signals
            "event_id_cnty": "s3-cable",
            "event_latitude": 51.5,
            "event_longitude": -0.12,
            "in_aot": False,
            "quad_class": 4,
            "actor1_country": "GBR",
            "goldstein": -6.0,
        },
        {
            # Neighbor state-actor: POL borders UKR but weaker signals
            "event_id_cnty": "s3-neighbor-noise",
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

    assert tiers["s3-cable"] == "cable_infra"
    assert tiers["s3-neighbor-noise"] == "state_actor"

    # cable: 0.70 + 0.10 (quad=4) + 0.05 (goldstein<=-5) = 0.85
    assert scores["s3-cable"] == 0.85
    # neighbor noise: 0.65 base (depth=1, POL not primary) + 0 (quad=3, no boost) + 0 = 0.65
    assert scores["s3-neighbor-noise"] == 0.65

    assert scores["s3-cable"] > scores["s3-neighbor-noise"]

    # Ordering: cable event comes first
    ordered_ids = [e["event_id_cnty"] for e in admitted]
    assert ordered_ids.index("s3-cable") < ordered_ids.index("s3-neighbor-noise")

    assert counts["cable_infra"] == 1
    assert counts["state_actor"] == 1


# ---------------------------------------------------------------------------
# Scenario 4 — Chokepoint event: theater-aligned scores higher than non-aligned
# Both events are at the same chokepoint but for different mission theaters.
# Both are admitted (theater mismatch does not exclude); the theater-aligned
# event must score higher to improve prioritization.
# ---------------------------------------------------------------------------


def test_scenario4_theater_aligned_chokepoint_scores_above_non_aligned():
    """Scenario 4: theater-aligned chokepoint scores 0.85; non-aligned scores 0.65."""
    # ARE (UAE) maps to CENTCOM — Strait of Hormuz is CENTCOM/INDOPACOM → match
    admitted_aligned, _ = gdelt_linkage.classify_gdelt_linkage(
        [
            {
                "event_id_cnty": "s4-aligned",
                "event_latitude": 26.5,
                "event_longitude": 56.3,  # Strait of Hormuz
                "in_aot": False,
                "quad_class": 4,
                "actor1_country": "BRA",
                "goldstein": -4.0,
            }
        ],
        mission_country_codes={"ARE"},
        cable_country_codes=set(),
        primary_mission_country_code="ARE",
    )

    # UKR maps to EUCOM — Strait of Hormuz is CENTCOM/INDOPACOM → no match
    admitted_non_aligned, _ = gdelt_linkage.classify_gdelt_linkage(
        [
            {
                "event_id_cnty": "s4-non-aligned",
                "event_latitude": 26.5,
                "event_longitude": 56.3,  # same chokepoint
                "in_aot": False,
                "quad_class": 4,
                "actor1_country": "BRA",
                "goldstein": -4.0,
            }
        ],
        mission_country_codes={"UKR", "RUS", "BLR"},
        cable_country_codes=set(),
        primary_mission_country_code="UKR",
    )

    assert len(admitted_aligned) == 1
    assert len(admitted_non_aligned) == 1

    # Both admitted — theater mismatch never excludes
    assert admitted_aligned[0]["linkage_tier"] == "chokepoint"
    assert admitted_non_aligned[0]["linkage_tier"] == "chokepoint"

    # Aligned: 0.75 (theater match) + 0.10 (quad=4) = 0.85
    assert admitted_aligned[0]["linkage_score"] == 0.85
    assert admitted_aligned[0]["linkage_evidence"]["matched_theater"] == "CENTCOM"

    # Non-aligned: 0.55 (base) + 0.10 (quad=4) = 0.65
    assert admitted_non_aligned[0]["linkage_score"] == 0.65
    assert "matched_theater" not in admitted_non_aligned[0]["linkage_evidence"]

    # Theater alignment must produce a strictly higher score
    assert admitted_aligned[0]["linkage_score"] > admitted_non_aligned[0]["linkage_score"]


# ---------------------------------------------------------------------------
# Scenario 5 — External event that passes no hard gate must be excluded
# An event with quad_class < 3 is always excluded regardless of country.
# An event with quad_class >= 3 but no country/chokepoint match is also excluded.
# ---------------------------------------------------------------------------


def test_scenario5_event_with_no_hard_gate_match_is_excluded():
    """Scenario 5: events with no tier match are never admitted."""
    events = [
        {
            # quad_class=2 — verbal cooperation; excluded regardless of country
            "event_id_cnty": "s5-low-quad",
            "event_latitude": 50.45,
            "event_longitude": 30.52,
            "in_aot": False,
            "quad_class": 2,
            "actor1_country": "UKR",
            "goldstein": 1.0,
        },
        {
            # quad_class=4 but actor is unrelated country not in any set, not near
            # any chokepoint
            "event_id_cnty": "s5-unrelated-country",
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

    admitted_ids = {e["event_id_cnty"] for e in admitted}

    # Neither event should be admitted
    assert "s5-low-quad" not in admitted_ids
    assert "s5-unrelated-country" not in admitted_ids
    assert len(admitted) == 0

    # All counts must be zero
    assert sum(counts.values()) == 0

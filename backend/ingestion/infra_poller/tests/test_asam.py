"""Unit tests for ASAM pure helper functions in InfraPoller."""
import sys
import os
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import asam_severity, asam_recency, compute_asam_threat_score, parse_asam_json


# ---------------------------------------------------------------------------
# asam_severity
# ---------------------------------------------------------------------------

def test_severity_kidnapping():
    assert asam_severity("Kidnapping of crew") == 10.0


def test_severity_hijacking():
    assert asam_severity("Hijacking of vessel") == 8.0


def test_severity_fired_upon():
    assert asam_severity("Vessel Fired Upon") == 7.0


def test_severity_assault():
    assert asam_severity("Crew Assault") == 6.0


def test_severity_robbery():
    assert asam_severity("Robbery") == 5.0


def test_severity_boarding():
    assert asam_severity("Boarding") == 4.0


def test_severity_attempted():
    # "Attempted Robbery" contains "robbery" (score 5) which scores higher than
    # the "attempted" keyword (score 3) — robbery keyword wins
    assert asam_severity("Attempted Robbery") == 5.0


def test_severity_attempted_only():
    # Pure "attempted" with no more specific keyword → 3.0
    assert asam_severity("Attempted approach") == 3.0


def test_severity_none_returns_default():
    assert asam_severity(None) == 2.0


def test_severity_empty_returns_default():
    assert asam_severity("") == 2.0


def test_severity_unknown_returns_default():
    assert asam_severity("Suspicious approach") == 2.0


def test_severity_case_insensitive():
    assert asam_severity("HIJACKING") == 8.0


def test_severity_kidnapping_beats_robbery_in_compound():
    # "kidnapping" keyword comes before "robbery" in priority list
    assert asam_severity("Kidnapping after robbery") == 10.0


# ---------------------------------------------------------------------------
# asam_recency
# ---------------------------------------------------------------------------

def test_recency_within_30_days():
    today = date(2024, 6, 1)
    assert asam_recency(date(2024, 5, 20), today) == 1.00


def test_recency_exactly_30_days():
    today = date(2024, 6, 1)
    assert asam_recency(date(2024, 5, 2), today) == 1.00


def test_recency_31_days():
    today = date(2024, 6, 1)
    assert asam_recency(date(2024, 5, 1), today) == 0.80


def test_recency_90_days():
    today = date(2024, 6, 1)
    assert asam_recency(date(2024, 3, 3), today) == 0.80


def test_recency_91_days():
    today = date(2024, 6, 1)
    assert asam_recency(date(2024, 3, 2), today) == 0.60


def test_recency_180_days():
    today = date(2024, 6, 1)
    assert asam_recency(date(2023, 12, 4), today) == 0.60


def test_recency_181_days():
    today = date(2024, 6, 1)
    assert asam_recency(date(2023, 12, 3), today) == 0.40


def test_recency_365_days():
    today = date(2024, 6, 1)
    assert asam_recency(date(2023, 6, 2), today) == 0.40


def test_recency_over_365_days():
    today = date(2024, 6, 1)
    assert asam_recency(date(2023, 6, 1), today) == 0.20


def test_recency_old_incident():
    today = date(2024, 6, 1)
    assert asam_recency(date(2010, 1, 1), today) == 0.20


# ---------------------------------------------------------------------------
# compute_asam_threat_score
# ---------------------------------------------------------------------------

def test_threat_score_kidnapping_recent():
    today = date(2024, 6, 1)
    score = compute_asam_threat_score("Kidnapping", date(2024, 5, 25), today)
    assert score == 10.0  # 10.0 * 1.0 = 10.0


def test_threat_score_hijacking_old():
    today = date(2024, 6, 1)
    score = compute_asam_threat_score("Hijacking", date(2022, 1, 1), today)
    assert score == round(8.0 * 0.20, 2)  # 1.6


def test_threat_score_robbery_medium():
    today = date(2024, 6, 1)
    score = compute_asam_threat_score("Robbery", date(2024, 3, 5), today)
    assert score == round(5.0 * 0.80, 2)  # 4.0


def test_threat_score_capped_at_10():
    today = date(2024, 6, 1)
    score = compute_asam_threat_score("Kidnapping", date(2024, 5, 31), today)
    assert score <= 10.0


def test_threat_score_none_hostility():
    today = date(2024, 6, 1)
    score = compute_asam_threat_score(None, date(2024, 5, 31), today)
    assert score == round(2.0 * 1.0, 2)


# ---------------------------------------------------------------------------
# parse_asam_json
# ---------------------------------------------------------------------------

SAMPLE_FEED = [
    {
        "reference": "2024-123",
        "date": "2024-01-15",
        "latitude": 12.5,
        "longitude": 45.2,
        "hostility": "Robbery",
        "victim": "Merchant Vessel",
        "navArea": "IX",
        "subreg": "62",
        "description": "Armed men boarded vessel.",
    },
    {
        "reference": "2024-456",
        "date": "2024-02-20",
        "latitude": -6.0,
        "longitude": 39.5,
        "hostility": "Hijacking",
        "victim": "Fishing Vessel",
        "navArea": "XI",
        "subreg": "57",
        "description": "Vessel hijacked at anchor.",
    },
    {
        # Missing lat/lon — should be skipped
        "reference": "2024-BAD",
        "date": "2024-01-01",
        "hostility": "Robbery",
    },
    {
        # Invalid date — should be skipped
        "reference": "2024-NODATE",
        "date": "not-a-date",
        "latitude": 5.0,
        "longitude": 10.0,
        "hostility": "Robbery",
    },
    {
        # No reference — should be skipped
        "date": "2024-01-15",
        "latitude": 5.0,
        "longitude": 10.0,
        "hostility": "Robbery",
    },
]


def test_parse_returns_list():
    result = parse_asam_json(SAMPLE_FEED)
    assert isinstance(result, list)


def test_parse_correct_count():
    result = parse_asam_json(SAMPLE_FEED)
    # 3 invalid rows skipped (no lat/lon, bad date, no reference)
    assert len(result) == 2


def test_parse_reference():
    result = parse_asam_json(SAMPLE_FEED)
    refs = [r["reference"] for r in result]
    assert "2024-123" in refs
    assert "2024-456" in refs


def test_parse_coordinates():
    result = parse_asam_json(SAMPLE_FEED)
    first = next(r for r in result if r["reference"] == "2024-123")
    assert first["lat"] == 12.5
    assert first["lon"] == 45.2


def test_parse_date_type():
    result = parse_asam_json(SAMPLE_FEED)
    for r in result:
        assert isinstance(r["incident_date"], date)


def test_parse_hostility():
    result = parse_asam_json(SAMPLE_FEED)
    first = next(r for r in result if r["reference"] == "2024-123")
    assert first["hostility"] == "Robbery"


def test_parse_threat_score_present():
    result = parse_asam_json(SAMPLE_FEED)
    for r in result:
        assert "threat_score" in r
        assert 0.0 <= r["threat_score"] <= 10.0


def test_parse_hijacking_higher_score_than_robbery():
    result = parse_asam_json(SAMPLE_FEED)
    robbery = next(r for r in result if r["reference"] == "2024-123")
    hijacking = next(r for r in result if r["reference"] == "2024-456")
    # Both are old incidents so recency dampens them, but hijacking base > robbery base
    assert hijacking["threat_score"] > robbery["threat_score"]


def test_parse_empty_feed():
    assert parse_asam_json([]) == []


def test_parse_invalid_coords_skipped():
    bad = [{"reference": "X", "date": "2024-01-01", "latitude": 999, "longitude": 0, "hostility": "Robbery"}]
    assert parse_asam_json(bad) == []


def test_parse_alternative_date_format():
    feed = [
        {
            "reference": "2024-ALT",
            "date": "01/15/2024",
            "latitude": 5.0,
            "longitude": 10.0,
            "hostility": "Robbery",
        }
    ]
    result = parse_asam_json(feed)
    assert len(result) == 1
    assert result[0]["incident_date"] == date(2024, 1, 15)

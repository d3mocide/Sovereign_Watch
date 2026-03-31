"""Unit tests for maritime risk assessment pure helpers (Phase 3 Geospatial)."""

import os
import sys

from test_stubs import install_common_test_stubs

# ── mock heavy deps before any project imports ──────────────────────────────
install_common_test_stubs(include_web_stack=True)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routers.maritime import _threat_label  # noqa: E402

# ─── _threat_label ──────────────────────────────────────────────────────────


def test_threat_label_critical():
    assert _threat_label(7.0) == "CRITICAL"


def test_threat_label_critical_max():
    assert _threat_label(10.0) == "CRITICAL"


def test_threat_label_high_lower_bound():
    assert _threat_label(4.5) == "HIGH"


def test_threat_label_high_mid():
    assert _threat_label(5.5) == "HIGH"


def test_threat_label_high_just_below_critical():
    assert _threat_label(6.99) == "HIGH"


def test_threat_label_medium_lower_bound():
    assert _threat_label(2.0) == "MEDIUM"


def test_threat_label_medium_mid():
    assert _threat_label(3.5) == "MEDIUM"


def test_threat_label_medium_just_below_high():
    assert _threat_label(4.49) == "MEDIUM"


def test_threat_label_low_zero():
    assert _threat_label(0.0) == "LOW"


def test_threat_label_low_near_zero():
    assert _threat_label(0.5) == "LOW"


def test_threat_label_low_just_below_medium():
    assert _threat_label(1.99) == "LOW"


# ─── composite_score formula ────────────────────────────────────────────────
# Test the scoring arithmetic used by the endpoint directly.
# composite_score = min(10.0, round(incident_max * 0.7 + (2.0 if sea_anomaly else 0.0), 2))


def _composite(incident_max: float, sea_anomaly: bool) -> float:
    return min(10.0, round(incident_max * 0.7 + (2.0 if sea_anomaly else 0.0), 2))


def test_composite_no_incidents_no_anomaly():
    assert _composite(0.0, False) == 0.0


def test_composite_no_incidents_with_anomaly():
    assert _composite(0.0, True) == 2.0


def test_composite_high_incident_no_anomaly():
    assert _composite(8.0, False) == round(8.0 * 0.7, 2)  # 5.6


def test_composite_high_incident_with_anomaly():
    score = _composite(8.0, True)
    assert score == round(8.0 * 0.7 + 2.0, 2)  # 7.6


def test_composite_max_realistic_value():
    # Max realistic: incident_max=10.0, sea_anomaly=True -> 10*0.7+2=9.0 (cap not triggered)
    assert _composite(10.0, True) == 9.0


def test_composite_cap_is_enforced():
    # Verify the cap logic: a hypothetical incident_max > 11.43 would exceed 10
    # Use a direct call: min(10.0, round(15.0 * 0.7 + 2.0, 2)) = min(10.0, 12.5) = 10.0
    assert _composite(15.0, True) == 10.0


def test_composite_threshold_produces_correct_label():
    score = _composite(8.0, True)  # 7.6 → CRITICAL
    assert _threat_label(score) == "CRITICAL"


def test_composite_medium_scenario():
    score = _composite(3.0, False)  # 2.1 → MEDIUM
    assert _threat_label(score) == "MEDIUM"


def test_composite_low_scenario():
    score = _composite(0.0, False)  # 0.0 → LOW
    assert _threat_label(score) == "LOW"

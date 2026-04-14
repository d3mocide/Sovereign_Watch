"""
Risk Taxonomy: shared constants and classification utilities for all domain risk models.

This module is the single source of truth for:
  - Severity labels and per-domain score thresholds
  - Temporal decay half-lives and the decay weight function
  - Source reliability coefficients
  - Cross-domain convergence constants

Design intent (mirrors hmm_trajectory.py):
  The HMM provides domain-agnostic behavioral state classification with
  domain-tunable observation parameters.  risk_taxonomy.py plays the same
  role for risk scoring: it defines the shared mathematical skeleton that
  every domain-specific risk model imports and calibrates against.

  Adding a new domain (e.g. cyber, MARAD zone, VIIRS dark-fleet) means:
    1. Adding a threshold row to SEVERITY_THRESHOLDS
    2. Adding a half-life row to DECAY_HALF_LIFE_HOURS
    3. Adding source keys to SOURCE_CONFIDENCE
  No changes to callers required.
"""

import math
from datetime import datetime, timezone
from enum import Enum


# ---------------------------------------------------------------------------
# Severity taxonomy
# ---------------------------------------------------------------------------

class RiskSeverity(str, Enum):
    LOW      = "LOW"
    MEDIUM   = "MEDIUM"
    HIGH     = "HIGH"
    CRITICAL = "CRITICAL"


# Per-domain score thresholds on the normalised [0.0, 1.0] scale.
# Each list is [low_max, medium_max, high_max]; scores at or above high_max → CRITICAL.
#
# Rationale for domain differences:
#   maritime  — sea-state buoy Z-scores create frequent low-level noise; tighter thresholds
#               keep MEDIUM from firing on routine swell conditions.
#   orbital   — Kp-index spikes during geomagnetic storms are expected and transient; looser
#               thresholds prevent routine storm activity from flooding CRITICAL alerts.
#   aviation  — ADS-B data is high-fidelity and low-noise; default thresholds are appropriate.
SEVERITY_THRESHOLDS: dict[str, list[float]] = {
    "default":        [0.25, 0.55, 0.80],
    "maritime":       [0.20, 0.45, 0.70],
    "aviation":       [0.25, 0.55, 0.80],
    "orbital":        [0.30, 0.60, 0.85],
    "rf":             [0.25, 0.55, 0.80],
    "infrastructure": [0.25, 0.55, 0.80],
    # VIIRS/MODIS thermal hotspot detections.  Thresholds are maritime-adjacent
    # because FIRMS data has inherent noise from coastal industry and oil platforms.
    "firms":          [0.20, 0.45, 0.75],
    # Dark vessel candidates (AIS-off cross-reference).  Aggressive lower bounds:
    # any AIS gap co-located with a thermal detection is immediately suspicious.
    "dark_vessel":    [0.15, 0.40, 0.70],
}


def score_to_severity(score: float, domain: str = "default") -> RiskSeverity:
    """Map a normalised [0, 1] risk score to a severity label for the given domain."""
    lo, mid, hi = SEVERITY_THRESHOLDS.get(domain, SEVERITY_THRESHOLDS["default"])
    if score < lo:
        return RiskSeverity.LOW
    if score < mid:
        return RiskSeverity.MEDIUM
    if score < hi:
        return RiskSeverity.HIGH
    return RiskSeverity.CRITICAL


# ---------------------------------------------------------------------------
# Temporal decay
# ---------------------------------------------------------------------------

# Exponential decay half-lives per signal domain (hours).
# A signal captured exactly one half-life ago carries 50% of its original weight.
#
# Domain-specific rationale:
#   GDELT     — media-cycle decay; a 12-hour-old report is still contextually relevant.
#   TAK_ADSB  — ADS-B is near-real-time; 2h-old track data is essentially stale.
#   TAK_AIS   — AIS updates every 2–6 min but positional relevance lasts longer than ADS-B.
#   orbital   — satellite signal-loss events are extremely time-sensitive (orbital period ~90 min).
DECAY_HALF_LIFE_HOURS: dict[str, float] = {
    "GDELT":       12.0,
    "TAK_ADSB":    2.0,
    "TAK_AIS":     6.0,
    "orbital":     1.0,
    "default":     6.0,
    # FIRMS NRT data is actionable for ~2 hours after acquisition; thermal plumes
    # from vessel engines dissipate quickly in the IR channel.
    "firms":       2.0,
    # Dark vessel candidates retain investigative relevance longer than raw hotspots —
    # a vessel that went dark 6 hours ago is still a current intelligence concern.
    "dark_vessel": 6.0,
}


def temporal_weight(capture_time: datetime, domain: str = "default") -> float:
    """Return an exponential decay weight for a signal captured at *capture_time*.

    weight = exp(-ln(2) * Δt / half_life)

    Returns ~1.0 for a brand-new signal; 0.5 exactly one half-life ago;
    approaches 0 asymptotically for old signals.
    """
    half_life = DECAY_HALF_LIFE_HOURS.get(domain, DECAY_HALF_LIFE_HOURS["default"])
    if capture_time.tzinfo is None:
        capture_time = capture_time.replace(tzinfo=timezone.utc)
    delta_hours = max((datetime.now(timezone.utc) - capture_time).total_seconds() / 3600.0, 0.0)
    return math.exp(-math.log(2) * delta_hours / half_life)


# ---------------------------------------------------------------------------
# Source reliability coefficients
# ---------------------------------------------------------------------------

# Used to weight each signal source's contribution to density/sentiment scores.
# Keys match the source tag stored in tracks.meta->>'source' and gdelt quad_class tiers.
SOURCE_CONFIDENCE: dict[str, float] = {
    "dump1090":          0.95,  # local ADS-B receiver — highest fidelity
    "opensky_sat":       0.75,  # satellite-received ADS-B
    "opensky_crowd":     0.65,  # crowd-sourced ADS-B
    "ais_terrestrial":   0.90,  # terrestrial AIS receiver
    "ais_satellite":     0.70,  # satellite AIS (position accuracy lower)
    "gdelt_conflict":    0.80,  # quad_class 3 or 4 — material/verbal conflict
    "gdelt_verbal":      0.50,  # quad_class 1 or 2 — cooperation signals
    "satnogs":           0.80,  # SatNOGS network signal observations
    # NASA FIRMS satellite sensors — VIIRS 375 m resolution is significantly
    # more reliable than MODIS 1 km for detecting vessel-scale heat sources.
    "VIIRS_SNPP_NRT":    0.92,
    "VIIRS_NOAA20_NRT":  0.90,
    "MODIS_NRT":         0.78,
    "default":           0.70,
}


# ---------------------------------------------------------------------------
# Cross-domain convergence
# ---------------------------------------------------------------------------

# Multiplicative boost applied per additional distinct domain co-active in a region.
# Rationale: two independent domain signals co-occurring is disproportionately
# significant — it indicates genuine multi-vector threat rather than noise in
# a single data feed.  Each extra domain beyond the first adds this factor.
CONVERGENCE_BOOST_PER_DOMAIN: float = 0.20

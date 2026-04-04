"""
HMM Trajectory Classifier: Discrete Hidden Markov Model for entity behavioral state decoding.

Uses the Viterbi algorithm (log-domain) with hard-coded domain-knowledge transition/emission
matrices.  Pure NumPy — no external ML libraries.

Hidden states: TRANSITING | LOITERING | MANEUVERING | HOLDING_PATTERN | CONVERGING
Observation alphabet: 27 symbols (speed_cat × turn_cat × alt_cat, 3×3×3)
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hidden state definitions
# ---------------------------------------------------------------------------
STATES: list[str] = [
    "TRANSITING",
    "LOITERING",
    "MANEUVERING",
    "HOLDING_PATTERN",
    "CONVERGING",
]
_N_STATES = len(STATES)
_STATE_IDX: dict[str, int] = {s: i for i, s in enumerate(STATES)}

# Anomalous states that contribute to anomaly_score
_ANOMALOUS_STATES: frozenset[str] = frozenset(
    {"MANEUVERING", "HOLDING_PATTERN", "CONVERGING"}
)

# ---------------------------------------------------------------------------
# Observation alphabet (27 symbols: speed_cat * 9 + turn_cat * 3 + alt_cat)
# ---------------------------------------------------------------------------
_N_OBS = 27  # 3 × 3 × 3

# Speed thresholds (knots)
_SPEED_SLOW_MAX = 50.0
_SPEED_FAST_MIN = 250.0

# Turn-rate thresholds (degrees per second)
_TURN_STRAIGHT_MAX = 5.0
_TURN_SHARP_MIN = 20.0

# Altitude-rate thresholds (feet per minute)
_ALT_LEVEL_ABS_MAX = 100.0


def _obs_index(speed_cat: int, turn_cat: int, alt_cat: int) -> int:
    return speed_cat * 9 + turn_cat * 3 + alt_cat


# ---------------------------------------------------------------------------
# Hard-coded model parameters (domain-knowledge priors)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# HMM model parameters — built lazily on first use so that module import
# does not call numpy functions (which would break test stubs that mock numpy).
# ---------------------------------------------------------------------------

_MODEL_CACHE: dict = {}


def _build_emission_matrix() -> object:
    """Build the 5×27 emission matrix. Called lazily on first use."""
    b = np.full((_N_STATES, _N_OBS), 1.0 / _N_OBS, dtype=np.float64)

    def _boost(state_idx: int, indices: list[int], weight: float) -> None:
        for idx in indices:
            b[state_idx, idx] += weight

    # TRANSITING (0): fast + straight + level is dominant flight segment
    trans_idx = _STATE_IDX["TRANSITING"]
    _boost(trans_idx, [_obs_index(2, 0, 0)], 0.30)  # FAST+STRAIGHT+LEVEL
    _boost(trans_idx, [_obs_index(1, 0, 0)], 0.15)  # MEDIUM+STRAIGHT+LEVEL
    _boost(trans_idx, [_obs_index(2, 0, 1), _obs_index(2, 0, 2)], 0.05)  # FAST+STRAIGHT+CLB/DES

    # LOITERING (1): slow speed, straight or gentle turns only, mostly level
    loit_idx = _STATE_IDX["LOITERING"]
    _boost(loit_idx, [_obs_index(0, 0, 0)], 0.25)  # SLOW+STRAIGHT+LEVEL
    _boost(loit_idx, [_obs_index(0, 1, 0)], 0.20)  # SLOW+TURNING+LEVEL
    _boost(loit_idx, [_obs_index(0, 0, 1), _obs_index(0, 0, 2)], 0.05)  # SLOW+STRAIGHT+CLB/DES
    # Note: sharp turns map to MANEUVERING, not LOITERING

    # MANEUVERING (2): sharp or rapid turns at any speed, or evasive manoeuvres
    mane_idx = _STATE_IDX["MANEUVERING"]
    sharp_indices = [_obs_index(s, 2, a) for s in range(3) for a in range(3)]
    _boost(mane_idx, sharp_indices, 0.15)  # all sharp-turn symbols
    turning_med_fast = [_obs_index(s, 1, a) for s in range(1, 3) for a in range(3)]
    _boost(mane_idx, turning_med_fast, 0.04)  # turning at medium/fast speed

    # HOLDING_PATTERN (3): slow/medium + turning + level (race-track pattern)
    hold_idx = _STATE_IDX["HOLDING_PATTERN"]
    _boost(hold_idx, [_obs_index(0, 1, 0)], 0.25)  # SLOW+TURNING+LEVEL
    _boost(hold_idx, [_obs_index(1, 1, 0)], 0.20)  # MEDIUM+TURNING+LEVEL
    _boost(hold_idx, [_obs_index(0, 2, 0)], 0.10)  # SLOW+SHARP+LEVEL
    _boost(hold_idx, [_obs_index(1, 2, 0)], 0.05)  # MEDIUM+SHARP+LEVEL

    # CONVERGING (4): medium/fast, mostly straight, heading toward a point
    conv_idx = _STATE_IDX["CONVERGING"]
    _boost(conv_idx, [_obs_index(1, 0, 0)], 0.20)  # MEDIUM+STRAIGHT+LEVEL
    _boost(conv_idx, [_obs_index(2, 0, 0)], 0.20)  # FAST+STRAIGHT+LEVEL
    _boost(conv_idx, [_obs_index(1, 1, 0)], 0.05)  # MEDIUM+TURNING+LEVEL (course adjustments)

    row_sums = b.sum(axis=1, keepdims=True)
    b /= row_sums
    return b


def _get_model() -> tuple:
    """Return (log_pi, log_A, log_B), building them once and caching."""
    if "log_pi" not in _MODEL_CACHE:
        log_pi = np.log(
            np.array([0.50, 0.20, 0.15, 0.10, 0.05], dtype=np.float64)
        )
        log_A = np.log(
            np.array(
                [
                    [0.70, 0.05, 0.15, 0.05, 0.05],  # TRANSITING
                    [0.10, 0.60, 0.10, 0.15, 0.05],  # LOITERING
                    [0.30, 0.10, 0.40, 0.05, 0.15],  # MANEUVERING
                    [0.05, 0.20, 0.10, 0.60, 0.05],  # HOLDING_PATTERN
                    [0.30, 0.05, 0.20, 0.05, 0.40],  # CONVERGING
                ],
                dtype=np.float64,
            )
        )
        log_B = np.log(_build_emission_matrix())
        _MODEL_CACHE["log_pi"] = log_pi
        _MODEL_CACHE["log_A"] = log_A
        _MODEL_CACHE["log_B"] = log_B
    return _MODEL_CACHE["log_pi"], _MODEL_CACHE["log_A"], _MODEL_CACHE["log_B"]


# ---------------------------------------------------------------------------
# Viterbi algorithm (log-domain)
# ---------------------------------------------------------------------------

def _viterbi(obs_seq: list[int], log_pi: object, log_A: object, log_B: object) -> list[int]:
    """
    Decode the most-probable hidden state sequence via the Viterbi algorithm.

    Args:
        obs_seq: Sequence of observation indices (each in [0, N_OBS)).
        log_pi:  Log initial-state distribution (shape N_STATES).
        log_A:   Log transition matrix (shape N_STATES × N_STATES).
        log_B:   Log emission matrix (shape N_STATES × N_OBS).

    Returns:
        List of state indices (ints) of the same length as obs_seq.
    """
    T = len(obs_seq)
    if T == 0:
        return []

    # delta[t, s] = max log-probability of any path ending in state s at time t
    delta = np.full((T, _N_STATES), -np.inf, dtype=np.float64)
    psi = np.zeros((T, _N_STATES), dtype=np.int32)

    # Initialisation
    delta[0] = log_pi + log_B[:, obs_seq[0]]

    # Recursion
    for t in range(1, T):
        for s in range(_N_STATES):
            trans_probs = delta[t - 1] + log_A[:, s]
            best_prev = int(np.argmax(trans_probs))
            delta[t, s] = trans_probs[best_prev] + log_B[s, obs_seq[t]]
            psi[t, s] = best_prev

    # Backtrack
    path = [0] * T
    path[T - 1] = int(np.argmax(delta[T - 1]))
    for t in range(T - 2, -1, -1):
        path[t] = psi[t + 1, path[t + 1]]

    return path


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

@dataclass
class HMMResult:
    """Output from classify_trajectory()."""

    uid: str
    state_sequence: list[str] = field(default_factory=list)
    dominant_state: str = "TRANSITING"
    confidence: float = 1.0   # fraction of steps in dominant state
    anomaly_score: float = 0.0  # fraction of steps in anomalous states


def _heading_delta(h1: float, h2: float) -> float:
    """Signed minimum angular difference between two headings (−180 to +180)."""
    d = (h2 - h1) % 360.0
    if d > 180.0:
        d -= 360.0
    return d


def _to_utc_dt(t: object) -> Optional[datetime]:
    """Coerce time value to tz-aware datetime."""
    if isinstance(t, datetime):
        return t if t.tzinfo else t.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(t).replace("Z", "+00:00"))
    except (TypeError, ValueError, AttributeError):
        return None


def classify_trajectory(uid: str, track_points: list[dict]) -> HMMResult:
    """
    Classify the behavioral state sequence for a single entity.

    Args:
        uid:          Entity identifier.
        track_points: List of dicts ordered by time (ascending), each with:
                        - speed_kts   (float) — speed in knots
                        - heading_deg (float) — true heading in degrees
                        - alt_ft      (float) — altitude in feet
                        - time        (datetime or ISO string)

    Returns:
        HMMResult with decoded state sequence, dominant state, confidence,
        and anomaly_score.
    """
    # --- Edge case: fewer than 2 points → no observations derivable ----------
    if len(track_points) < 2:
        return HMMResult(
            uid=uid,
            state_sequence=["TRANSITING"],
            dominant_state="TRANSITING",
            confidence=1.0,
            anomaly_score=0.0,
        )

    # --- Parse and sort by time ----------------------------------------------
    parsed = []
    for pt in track_points:
        t = _to_utc_dt(pt.get("time"))
        if t is None:
            continue
        parsed.append(
            (
                t,
                float(pt.get("speed_kts") or 0.0),
                float(pt.get("heading_deg") or 0.0),
                float(pt.get("alt_ft") or 0.0),
            )
        )

    parsed.sort(key=lambda x: x[0])

    if len(parsed) < 2:
        return HMMResult(
            uid=uid,
            state_sequence=["TRANSITING"],
            dominant_state="TRANSITING",
            confidence=1.0,
            anomaly_score=0.0,
        )

    # --- Derive observations from consecutive pairs ---------------------------
    obs_seq: list[int] = []
    for i in range(1, len(parsed)):
        t_prev, spd_prev, hdg_prev, alt_prev = parsed[i - 1]
        t_curr, spd_curr, hdg_curr, alt_curr = parsed[i]

        dt_s = max((t_curr - t_prev).total_seconds(), 1e-6)  # avoid div-by-zero
        dt_min = dt_s / 60.0

        # Speed category (use current point speed)
        if spd_curr < _SPEED_SLOW_MAX:
            speed_cat = 0
        elif spd_curr > _SPEED_FAST_MIN:
            speed_cat = 2
        else:
            speed_cat = 1

        # Turn rate category
        turn_rate = abs(_heading_delta(hdg_prev, hdg_curr)) / dt_s
        if turn_rate < _TURN_STRAIGHT_MAX:
            turn_cat = 0
        elif turn_rate > _TURN_SHARP_MIN:
            turn_cat = 2
        else:
            turn_cat = 1

        # Altitude rate category
        alt_rate_ft_min = (alt_curr - alt_prev) / dt_min
        if abs(alt_rate_ft_min) < _ALT_LEVEL_ABS_MAX:
            alt_cat = 0
        elif alt_rate_ft_min >= _ALT_LEVEL_ABS_MAX:
            alt_cat = 1
        else:
            alt_cat = 2

        obs_seq.append(_obs_index(speed_cat, turn_cat, alt_cat))

    if not obs_seq:
        return HMMResult(
            uid=uid,
            state_sequence=["TRANSITING"],
            dominant_state="TRANSITING",
            confidence=1.0,
            anomaly_score=0.0,
        )

    # --- Viterbi decoding ----------------------------------------------------
    log_pi, log_A, log_B = _get_model()
    state_indices = _viterbi(obs_seq, log_pi, log_A, log_B)
    state_sequence = [STATES[s] for s in state_indices]

    # --- Compute summary statistics ------------------------------------------
    total = len(state_sequence)
    state_counts: dict[str, int] = {}
    for s in state_sequence:
        state_counts[s] = state_counts.get(s, 0) + 1

    dominant_state = max(state_counts, key=lambda s: state_counts[s])
    confidence = state_counts[dominant_state] / total

    anomaly_count = sum(
        count for state, count in state_counts.items() if state in _ANOMALOUS_STATES
    )
    anomaly_score = anomaly_count / total

    return HMMResult(
        uid=uid,
        state_sequence=state_sequence,
        dominant_state=dominant_state,
        confidence=confidence,
        anomaly_score=anomaly_score,
    )

# Analyst Layer Architecture

## Overview

The Sovereign Watch analyst layer is a pipeline of independent, composable services that transform raw multi-domain telemetry into scored, labelled, and narratively-explained threat assessments. It sits between the ingestion pollers and the AI Router endpoints.

```
Pollers (AIS · ADS-B · GDELT · SatNOGS · NDBC · Infra)
                        ↓
             TimescaleDB / Redis
                        ↓
        ┌───────────────────────────────┐
        │        Analyst Layer          │
        │                               │
        │  risk_taxonomy          ←──── shared calibration constants
        │  spatial_temporal_alignment   │
        │  stdbscan                     │
        │  hmm_trajectory               │
        │  escalation_detector          │
        │  sequence_evaluation_engine   │
        └───────────────────────────────┘
                        ↓
             AI Router endpoints
             H3 Risk heatmap endpoint
```

All services in the analyst layer are **stateless pure-Python** — they receive data dicts, return typed dataclasses, and have no database connections of their own. Database I/O lives exclusively in the router layer that calls them.

---

## Service Inventory

| Service | File | Role |
|---|---|---|
| **Risk Taxonomy** | `services/risk_taxonomy.py` | Shared constants; domain calibration foundation |
| **Spatial-Temporal Alignment** | `services/spatial_temporal_alignment.py` | GDELT ↔ TAK fusion and alignment scoring |
| **ST-DBSCAN** | `services/stdbscan.py` | Spatiotemporal density clustering |
| **HMM Trajectory Classifier** | `services/hmm_trajectory.py` | Per-entity behavioral state decoding |
| **Escalation Detector** | `services/escalation_detector.py` | Pattern matching, anomaly detection, risk scoring |
| **Sequence Evaluation Engine** | `services/sequence_evaluation_engine.py` | LLM-driven narrative synthesis |

---

## 1. Risk Taxonomy (`risk_taxonomy.py`)

**Design intent:** The same role that `hmm_trajectory.py` plays for behavioral classification — a domain-agnostic mathematical skeleton that every domain-specific model imports and calibrates against. Adding a new domain (MARAD zone, VIIRS dark-fleet, cyber feed) requires only adding rows to the constant dicts here; no caller changes needed.

### 1.1 Severity Taxonomy

Scores are normalized to `[0.0, 1.0]` everywhere. The taxonomy maps a float to a human-readable label using per-domain threshold tables.

```python
RiskSeverity: LOW | MEDIUM | HIGH | CRITICAL

score_to_severity(score: float, domain: str = "default") -> RiskSeverity
```

**Per-domain thresholds** `[low_max, medium_max, high_max]` (scores ≥ high_max → CRITICAL):

| Domain | LOW | MEDIUM | HIGH | CRITICAL | Rationale |
|---|---|---|---|---|---|
| `default` | < 0.25 | 0.25–0.55 | 0.55–0.80 | ≥ 0.80 | Baseline |
| `maritime` | < 0.20 | 0.20–0.45 | 0.45–0.70 | ≥ 0.70 | Tighter — buoy Z-scores are noisy |
| `aviation` | < 0.25 | 0.25–0.55 | 0.55–0.80 | ≥ 0.80 | ADS-B is high-fidelity, default applies |
| `orbital` | < 0.30 | 0.30–0.60 | 0.60–0.85 | ≥ 0.85 | Looser — Kp spikes are expected and transient |
| `rf` | < 0.25 | 0.25–0.55 | 0.55–0.80 | ≥ 0.80 | Default |
| `infrastructure` | < 0.25 | 0.25–0.55 | 0.55–0.80 | ≥ 0.80 | Default |

### 1.2 Temporal Decay

Older signals contribute less to composite scores. The decay function is exponential with domain-tunable half-lives:

```
weight(t) = exp(−ln(2) × Δt / half_life)
```

Where `Δt` is hours since capture. A signal exactly one half-life old carries 50% weight; a fresh signal carries ~100%.

```python
temporal_weight(capture_time: datetime, domain: str = "default") -> float
```

**Half-lives by domain:**

| Domain key | Half-life | Rationale |
|---|---|---|
| `TAK_ADSB` | 2 h | ADS-B is 1 Hz; 2-hour-old position is stale |
| `TAK_AIS` | 6 h | AIS updates every 2–6 min; positional context lasts longer |
| `GDELT` | 12 h | Media-cycle decay; recent articles outweigh day-old reports |
| `orbital` | 1 h | Signal-loss events are extremely time-sensitive (orbital period ~90 min) |
| `default` | 6 h | Fallback for unknown sources |

**Decay weight at common ages:**

| Signal age | TAK_ADSB (2h) | TAK_AIS (6h) | GDELT (12h) | orbital (1h) |
|---|---|---|---|---|
| 0 h | 1.00 | 1.00 | 1.00 | 1.00 |
| 1 h | 0.71 | 0.89 | 0.94 | 0.50 |
| 6 h | 0.16 | 0.50 | 0.71 | 0.02 |
| 12 h | 0.02 | 0.25 | 0.50 | ~0 |
| 24 h | ~0 | 0.06 | 0.25 | ~0 |

### 1.3 Source Confidence Weights

Each signal source is assigned a reliability coefficient that weights its contribution to density and sentiment scores. Keys match `tracks.meta->>'source'` and GDELT `quad_class` tiers.

| Source key | Weight | Description |
|---|---|---|
| `dump1090` | 0.95 | Local ADS-B receiver — highest fidelity |
| `ais_terrestrial` | 0.90 | Terrestrial AIS receiver |
| `satnogs` | 0.80 | SatNOGS ground station network |
| `gdelt_conflict` | 0.80 | GDELT quad_class 3–4 (material/verbal conflict) |
| `opensky_sat` | 0.75 | Satellite-received ADS-B |
| `ais_satellite` | 0.70 | Satellite AIS (lower position accuracy) |
| `default` | 0.70 | Unknown/unmapped source |
| `opensky_crowd` | 0.65 | Crowd-sourced ADS-B |
| `gdelt_verbal` | 0.50 | GDELT quad_class 1–2 (cooperation signals) |

### 1.4 Cross-Domain Convergence

```python
CONVERGENCE_BOOST_PER_DOMAIN = 0.20
```

When anomaly signals from 2+ distinct intelligence domains co-occur in the same region, the final risk score receives a multiplicative boost:

```
R_final = R_base × (1 + 0.20 × (n_domains − 1))
```

Examples: 2 domains → ×1.20, 3 domains → ×1.40, 4 domains → ×1.60 (capped at 1.0).

The boost only counts *domain-specific* signals. Behavioural anomalies (`clustering`, `maneuvering`, `directional_change`, etc.) are tagged `"multi"` and excluded from the domain count because they can originate from any domain.

**Domain tag map:**

| Anomaly type | Domain |
|---|---|
| `emergency` | `aviation` |
| `satellite_signal_loss` | `orbital` |
| `space_weather` | `orbital` |
| `internet_outage` | `infrastructure` |
| All others | `multi` (excluded from convergence count) |

---

## 2. Spatial-Temporal Alignment (`spatial_temporal_alignment.py`)

**Purpose:** Fuse GDELT macro-level geopolitical events with TAK micro-level tactical tracks by mapping both to a common H3 grid and computing a weighted overlap score.

### H3 Resolution Mapping

| Source | Resolution | Cell edge ≈ | Used for |
|---|---|---|---|
| TAK (AIS/ADS-B) | H3-9 | 174 m | Tactical precision |
| GDELT events | H3-7 | 5.2 km | Regional correlation |
| Domain analysis | H3-7 | 5.2 km | Parent region grouping |

TAK clauses are mapped to H3-9 micro-cells, then traversed up to H3-7 for comparison with GDELT. A GDELT event "aligns" with a TAK clause when their H3-7 parent cells match or are 1-step adjacent.

### Alignment Score

The `alignment_score` is a temporally-weighted overlap ratio between GDELT and TAK clauses in the same region and time window:

```
alignment_score = Σ(w_gdelt_i × w_tak_j × overlap_ij) / Σ(w_gdelt_i × w_tak_j)
```

Where:
- `w_gdelt_i = temporal_weight(clause.time, "GDELT")`
- `w_tak_j = temporal_weight(clause.time, clause.source)`
- `overlap_ij = 1` if `|time_gdelt − time_tak| < 2 hours`, else `0`

This means two clauses from 23 hours ago contribute far less to the alignment score than two clauses from the last hour, even if both fall within the lookback window.

### Lookback Windows

```python
LOOKBACK_WINDOWS = {"24h": 24h, "7d": 7d, "30d": 30d}
```

These are hard filters — clauses older than the window are excluded before temporal weighting begins.

---

## 3. ST-DBSCAN (`stdbscan.py`)

**Purpose:** Identify spatially and temporally coherent clusters of entity positions — e.g. a rendezvous, assembly point, or coordinated loiter pattern.

### Algorithm

Standard DBSCAN extended with a temporal dimension. A point `p` is a neighbour of `q` if:
```
haversine(p, q) ≤ eps_km  AND  |t_p − t_q| ≤ eps_t
```

### Default Parameters

| Parameter | Default | Meaning |
|---|---|---|
| `eps_km` | 2.0 km | Spatial neighbourhood radius |
| `eps_t` | 900 s (15 min) | Temporal neighbourhood half-window |
| `min_samples` | 5 | Minimum neighbours to classify a core point |

### Output

```python
@dataclass
class Cluster:
    cluster_id: int
    uids: list[str]          # deduplicated entity IDs
    centroid_lat: float
    centroid_lon: float
    start_time: datetime
    end_time: datetime
    entity_count: int        # == len(uids)
```

Clusters with `entity_count ≥ min_samples` produce an `AnomalyMetric(metric_type="stdbscan_cluster")` with `score = min(entity_count / 20.0, 1.0)`.

---

## 4. HMM Trajectory Classifier (`hmm_trajectory.py`)

**Purpose:** Decode the most probable sequence of behavioral states for a single entity given its observed kinematic history. Uses the Viterbi algorithm in log-domain (numerically stable).

### Hidden States

| State | Behavior pattern |
|---|---|
| `TRANSITING` | Normal cruise: fast, straight, level |
| `LOITERING` | Slow, gentle turns, level altitude |
| `MANEUVERING` | Sharp turns / evasive / tactical movement |
| `HOLDING_PATTERN` | Race-track circling pattern (slow/medium + turning) |
| `CONVERGING` | Multiple entities moving toward a common point |

**Anomalous states** (trigger risk): `MANEUVERING`, `HOLDING_PATTERN`, `CONVERGING`

### Observation Alphabet (27 symbols)

Each observation is encoded as a triple of discretized kinematic categories:

```
obs_index = speed_cat × 9 + turn_cat × 3 + alt_cat
```

| Axis | Categories | Thresholds |
|---|---|---|
| **Speed** | SLOW (0) · MEDIUM (1) · FAST (2) | ≤ 50 kt / 50–250 kt / ≥ 250 kt |
| **Turn rate** | STRAIGHT (0) · TURNING (1) · SHARP (2) | ≤ 5°/s / 5–20°/s / ≥ 20°/s |
| **Altitude rate** | LEVEL (0) · CLIMBING (1) · DESCENDING (2) | ≤ 100 ft/min abs |

### Output

```python
@dataclass
class HMMResult:
    uid: str
    dominant_state: str       # most common state in sequence
    state_sequence: list[str] # per-observation state labels
    anomaly_score: float      # fraction of observations in anomalous states
    confidence: float         # Viterbi path probability (normalised)
```

The `anomaly_score` is the proportion of the decoded state sequence that falls in `{MANEUVERING, HOLDING_PATTERN, CONVERGING}`. An entity with `anomaly_score = 0.6` spent 60% of its observed history in anomalous states.

---

## 5. Escalation Detector (`escalation_detector.py`)

**Purpose:** The primary signal aggregator. Detects escalation patterns in GDELT event sequences, runs anomaly detectors across multi-INT data, and computes the composite risk score.

### 5.1 GDELT Pattern Detection

The detector maintains a library of prototypical escalation sequences (GDELT CAMEO event codes):

```python
ESCALATION_PATTERNS = [
    ["PROTEST",        "POLICE_DEPLOYMENT",  "VIOLENT_CLASHES"],
    ["DEMONSTRATE",    "LAW_ENFORCEMENT",    "ARRESTS"],
    ["STRIKE",         "MILITARY_MOBILIZATION"],
    ["ARMED_CONFLICT", "CIVILIAN_CASUALTIES"],
    ["CURFEW",         "ARMED_POLICE",       "GUNFIRE"],
]
```

Pattern confidence is the proportion of events in the sequence that match the pattern, weighted by ordering. Returns `(matching_pattern, confidence_0_to_1)`.

### 5.2 Anomaly Detectors

| Detector | Trigger | Score formula |
|---|---|---|
| `clustering` | ≥ 5 distinct entities in same H3-9 cell within time window | `min(entity_count / 10.0, 1.0)` |
| `directional_change` | Course delta > 90° between consecutive positions | Normalized change magnitude |
| `emergency` | ADS-B squawk 7700 / 7600 / 7500 | `1.0` (hard flag) |
| `rendezvous` | 2+ distinct UIDs converge to same H3-9 cell within 30 min | Convergence proximity score |
| `hmm_trajectory` | HMM dominant state ∈ {MANEUVERING, HOLDING_PATTERN, CONVERGING} | `HMMResult.anomaly_score` |
| `stdbscan_cluster` | ST-DBSCAN cluster with ≥ min_samples entities | `min(entity_count / 20.0, 1.0)` |
| `satellite_signal_loss` | SatNOGS signal strength < −10 dBm | Normalized signal deficit |
| `space_weather` | Kp-index ≥ 6.0 | `kp / 9.0` |
| `internet_outage` | IODA-detected outage in region | Outage severity score |

### 5.3 Composite Risk Score

```python
def compute_risk_score(
    pattern_confidence: float,   # from GDELT pattern detection
    anomaly_score: float,        # from TAK behavioral detectors
    alignment_score: float,      # from spatial-temporal alignment
    context_anomalies: list[AnomalyMetric] | None,
) -> float
```

**Step 1 — Base additive sum:**
```
base = 0.40 × pattern_confidence
     + 0.35 × anomaly_score
     + 0.25 × alignment_score
```

**Step 2 — Context blend** (when context anomalies exist):
```
context_score = mean(a.score for active context anomalies)
base = 0.80 × base + 0.20 × context_score
```
This ensures context-only scenarios (e.g. pure space weather event with no TAK activity) produce a non-zero score.

**Step 3 — Cross-domain convergence multiplier:**
```
n = count of distinct domain-specific signals (aviation, orbital, infrastructure)
if n ≥ 2:
    base = base × (1 + 0.20 × (n − 1))
```

**Step 4 — Domain-specific adjustments:**
```
if space_weather.score > 0.5:  base × 0.90   # expected behaviour during storms
if internet_outage.score > 0.7: base × 1.10  # unusual movement during outages
```

**Step 5 — Cap:**
```
final = min(base, 1.0)
```

---

## 6. Sequence Evaluation Engine (`sequence_evaluation_engine.py`)

**Purpose:** Takes the structured output of the escalation detector and spatial-temporal alignment — already classified and scored — and routes it through the LLM for natural-language narrative synthesis.

### Input Schema

```python
await engine.evaluate_escalation(
    h3_region: str,           # H3-7 cell ID
    gdelt_summary: str,       # pre-formatted GDELT clause summary
    tak_summary: str,         # pre-formatted TAK clause summary
    anomalous_uids: list[str],
    behavioral_signals: list[str],  # human-readable anomaly descriptions
    is_sitrep: bool = True,
)
```

The engine does **not** query the database. All data is pre-fetched and pre-formatted by the AI Router before calling this function.

### Output

```python
@dataclass
class RiskAssessment:
    h3_region_id: str
    risk_score: float          # 0.0 – 1.0
    narrative_summary: str     # LLM-generated SITREP paragraph
    anomalous_uids: list[str]
    escalation_indicators: list[str]
    confidence: float          # 0.0 – 1.0
```

### Semantic Cache

Results are cached in RedisVL with cosine similarity threshold `0.94`. If an analytically equivalent query (same region, same anomaly profile) was answered recently, the cached narrative is returned without an LLM call. TTL: 120 seconds.

---

## 7. H3 Risk Heatmap (`routers/h3_risk.py`)

The heatmap endpoint is a lightweight parallel path to the escalation pipeline — it runs continuously in the background and requires no user trigger.

### Formula

```
C = ω_D × Density_norm + ω_S × Sentiment_norm

ω_D = 0.6  (entity density weight)
ω_S = 0.4  (GDELT sentiment weight)
```

**Density** is the temporally-weighted sum of entity positions per H3 cell:
```
Density(cell) = Σ temporal_weight(track.time, domain(track.entity_id))
```
Normalised to `[0, 1]` by dividing by the maximum cell density across all cells.

**Sentiment** is the source-confidence-weighted average Goldstein scale per H3 cell (inverted so conflict → high risk):
```
Goldstein ∈ [−10, +10]  (−10 = destabilising, +10 = stabilising)
w_i = SOURCE_CONFIDENCE["gdelt_conflict" if quad_class ∈ {3,4} else "gdelt_verbal"]
avg_goldstein = Σ(goldstein_i × w_i) / Σ(w_i)
sentiment_norm = (10 − avg_goldstein) / 20   → [0, 1]
```

Cells with no GDELT data receive a neutral `sentiment_norm = 0.5`.

### Severity Assignment

After computing `risk_score`, the cell is labelled using:
```python
severity = score_to_severity(risk_score)   # uses "default" domain thresholds
```

The frontend uses the severity label to drive hard colour breaks (not a continuous gradient):

| Severity | Colour |
|---|---|
| LOW | Green `rgba(0, 200, 100, 40)` |
| MEDIUM | Amber `rgba(255, 200, 0, 110)` |
| HIGH | Orange `rgba(255, 100, 0, 160)` |
| CRITICAL | Red `rgba(255, 0, 50, 220)` |

---

## 8. Domain Analysis Endpoints

Three specialist LLM agents are available via the AI Router for domain-focused assessments. These are deeper than the heatmap but narrower than a full regional evaluation.

### `POST /api/ai_router/analyze/air`

**Agent:** Air Intelligence Officer  
**Focus:** ADS-B tracks, squawk codes, airspace anomalies, holding patterns, flight-path deviations

**Request:**
```json
{
  "h3_region": "872abc123def",
  "lookback_hours": 24
}
```

**Response:**
```json
{
  "domain": "aviation",
  "risk_score": 0.54,
  "severity": "MEDIUM",
  "narrative": "Three aircraft entered holding patterns over the region...",
  "anomalous_uids": ["icao-a1b2c3"],
  "confidence": 0.81
}
```

---

### `POST /api/ai_router/analyze/sea`

**Agent:** Maritime Domain Awareness (MDA) Specialist  
**Focus:** AIS tracks, vessel clustering, sea-state anomalies, suspicious maneuvering, rendezvous patterns

**Request:**
```json
{
  "h3_region": "872abc123def",
  "lookback_hours": 24
}
```

**Response:**
```json
{
  "domain": "maritime",
  "risk_score": 0.38,
  "severity": "MEDIUM",
  "narrative": "Two vessels exhibited parallel track anomaly...",
  "anomalous_uids": ["mmsi-244820061"],
  "confidence": 0.76
}
```

---

### `POST /api/ai_router/analyze/orbital`

**Agent:** Space Weather Analyst  
**Focus:** Satellite signal integrity, Kp-index impact, GPS degradation, SatNOGS observations

**Request:**
```json
{
  "h3_region": "872abc123def",
  "lookback_hours": 24
}
```

**Response:**
```json
{
  "domain": "orbital",
  "risk_score": 0.22,
  "severity": "LOW",
  "narrative": "Kp-index peaked at 5.2 during window. No satellite signal loss...",
  "anomalous_uids": [],
  "confidence": 0.91
}
```

---

## 9. Adding a New Domain Risk Model

The analyst layer is designed so that adding a new domain follows a repeatable three-step pattern, identical to how a new HMM state would be added:

**Step 1 — Calibrate in `risk_taxonomy.py`:**
```python
# Add threshold row
SEVERITY_THRESHOLDS["cyber"] = [0.30, 0.60, 0.85]

# Add decay half-life
DECAY_HALF_LIFE_HOURS["cyber"] = 4.0  # BGP hijack events stale after ~4h

# Add source weights
SOURCE_CONFIDENCE["bgp_monitor"] = 0.88
SOURCE_CONFIDENCE["shodan"] = 0.72
```

**Step 2 — Implement `services/cyber_risk_model.py`:**
```python
from services.risk_taxonomy import score_to_severity, temporal_weight, SOURCE_CONFIDENCE

# Domain-specific signal aggregation logic here.
# Returns AnomalyMetric list + float score.
```

**Step 3 — Wire into `escalation_detector.ANOMALY_DOMAIN_MAP`:**
```python
ANOMALY_DOMAIN_MAP["bgp_hijack"]     = "cyber"
ANOMALY_DOMAIN_MAP["port_scan_spike"] = "cyber"
```

The convergence boost, severity taxonomy, and temporal decay apply automatically. No changes to routers, schemas, or the sequence evaluation engine.

---

## Related Documentation

- [`Documentation/Regional_Risk_Analysis.md`](Regional_Risk_Analysis.md) — Operator workflow and endpoint reference for the AI Router
- [`Documentation/TAK_Clausalizer.md`](TAK_Clausalizer.md) — How TAK state-change events are synthesised into clausal chains
- [`Documentation/AI_Configuration.md`](AI_Configuration.md) — LLM model registry, domain agent definitions, semantic cache configuration
- [`Documentation/API_Reference.md`](API_Reference.md) — Full REST endpoint reference
- [`agent_docs/research/phantom-risk-gap-analysis.md`](../agent_docs/research/phantom-risk-gap-analysis.md) — Gap analysis against the Phantomtide methodology

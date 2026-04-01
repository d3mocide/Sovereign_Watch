# Regional Risk Analysis & AI Router

## Overview

Regional Risk Analysis is an operator-initiated feature that provides AI-powered threat assessment for geographic areas. It combines Temporal Data (clausal chains), GDELT geopolitical intelligence, and multi-INT context (internet outages, space weather, satellite observations) to produce actionable risk scores and narratives.

**Key Innovation:** Users can right-click anywhere on the map to trigger a multi-INT assessment of that region, getting both quantitative risk scores and qualitative LLM-generated explanations.

---

## User Workflows

### **Workflow 1: Quick Regional Assessment (via Right-Click Menu)**

```
User Action: Right-click on map coordinate
    ↓
UI: Context menu appears with options
    • Set Focus Here
    • Save Location As...
    • Analyze Regional Risk  ← NEW
    • Return to Home Base
    ↓
User Action: Click "Analyze Regional Risk"
    ↓
Frontend: Converts coordinates → H3-7 region
    └─ e.g., (40.7128°N, 74.0060°W) → "872abc123def"
    ↓
Frontend: POST /api/ai_router/evaluate
    {
      "h3_region": "872abc123def",
      "lookback_hours": 24,
      "include_gdelt": true,
      "include_tak": true
    }
    ↓
Backend: Execute evaluation pipeline
    1. Query clausal_chains for TAK/GDELT in region + window
    2. Query internet_outages for context
    3. Query space_weather_context for context
    4. Query satnogs_signal_events for context
    5. Detect patterns + anomalies + context anomalies
    6. Compute risk score with dampening/boosting
    7. Generate escalation indicators
    8. (Optional) Stream LLM analysis
    ↓
Frontend: Display response in risk assessment panel
    • Risk score: 0.62 (ELEVATED)
    • Narrative: "Multiple entities clustering in region during minor geomagnetic storm..."
    • Indicators: ["Entity clustering detected", "Space weather event (G1)"]
    • Confidence: 0.88
```

### **Workflow 2: Entity-Specific Deep Dive (via AI Analyst Panel)**

```
User Action: Click entity on map (aircraft, vessel, GDELT event)
    ↓
UI: Entity selected in right sidebar, AI ANALYST button appears
    ↓
User Action: Click "AI ANALYST" to open analysis panel
    ↓
User Configuration:
    • Scan Window: Select 1h, 6h, 12h, 24h, 48h, 72h, or 7d
    • Maneuver Mode: Select TACTICAL, OSINT, or SAR
    • (Optional) Processing Engine: Select model (admin-only)
    ↓
User Action: Click "RUN" button (operator role required)
    ↓
Frontend: POST /api/analyze/{uid}
    {
      "uid": "a-f-A-H-28ACF9",
      "lookback_hours": 24,
      "mode": "tactical",
      "sitrep_context": {...}  // For SITREP entities
    }
    ↓
Backend: Stream LLM analysis via Server-Sent Events
    • Receives chunks every 100-500ms
    • Accumulates tokens in frontend
    • Displays formatted narrative
    ↓
Frontend: Display streaming response
    "TACTICAL ANALYSIS: Aircraft 28ACF9 (Boeing 737)

    MOVEMENT SUMMARY:
    • Origin: Boston Logan (BOS), 06:32 UTC
    • Destination: LaGuardia (LGA), 09:45 UTC
    • Route: Standard northeast corridor
    • Tracking confidence: 0.96

    MULTI-INT CONTEXT:
    • No space weather anomalies
    • No internet outages in routing region
    • SatNOGS transponder signal nominal

    ASSESSMENT: Routine commercial flight.
    Risk: LOW | Confidence: 0.94"
```

---

## Endpoint Reference

### **POST /api/ai_router/evaluate**

**Purpose:** Evaluate escalation risk for a specific H3 region

**Request:**
```json
{
  "h3_region": "872abc123def",
  "lookback_hours": 24,
  "include_gdelt": true,
  "include_tak": true
}
```

**Parameters:**
| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| h3_region | string | H3 cell ID | Required | Target region at resolution 7 |
| lookback_hours | integer | 1-168 | 24 | Analysis time window |
| include_gdelt | boolean | true/false | true | Include GDELT events |
| include_tak | boolean | true/false | true | Include TAK clauses |

**Response (200 OK):**
```json
{
  "h3_region_id": "872abc123def",
  "risk_score": 0.62,
  "narrative_summary": "Multiple entities clustering in region. Space weather G1 event detected. No escalation indicators, monitoring recommended.",
  "anomalous_uids": ["a-f-A-H-28ACF9", "a-f-A-S-123456"],
  "escalation_indicators": [
    "Entity clustering detected",
    "Space weather event (Kp: G1)"
  ],
  "confidence": 0.88,
  "pattern_detected": false,
  "anomaly_count": 1
}
```

**Response Fields:**
| Field | Type | Range | Meaning |
|-------|------|-------|---------|
| h3_region_id | string | — | H3-7 cell identifier |
| risk_score | number | 0.0-1.0 | Threat level (0=safe, 1=critical) |
| narrative_summary | string | — | AI-generated context summary |
| anomalous_uids | array | — | Entity IDs with anomalies |
| escalation_indicators | array | — | Detected threat conditions |
| confidence | number | 0.0-1.0 | How confident the assessment is |
| pattern_detected | boolean | — | GDELT pattern matched |
| anomaly_count | integer | 0-N | Number of detected anomalies |

**Error Responses:**
```json
// 400 Bad Request
{
  "detail": "Invalid h3_region: not a valid H3 cell"
}

// 500 Internal Server Error
{
  "detail": "Database connection failed"
}
```

---

### **GET /api/ai_router/regional_risk**

**Purpose:** Get risk heatmap for region and surrounding cells

**Request:**
```
GET /api/ai_router/regional_risk?h3_region=872abc123def&lookback_hours=24
```

**Query Parameters:**
| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| h3_region | string | H3-7 cell | Required | Center region |
| lookback_hours | integer | 1-720 | 24 | Analysis window |

**Response (200 OK):**
```json
{
  "center_region": "872abc123def",
  "lookback_hours": 24,
  "max_risk": 0.78,
  "heatmap": {
    "872abc123def": {
      "risk_score": 0.62,
      "confidence": 0.88,
      "anomaly_count": 2
    },
    "872abc123dee": {
      "risk_score": 0.41,
      "confidence": 0.75,
      "anomaly_count": 0
    },
    "872abc123dde": {
      "risk_score": 0.78,
      "confidence": 0.92,
      "anomaly_count": 5
    },
    // ... surrounding H3-7 cells (7 total: center + ring of 6)
  }
}
```

**Visualization:**
- Center cell + 6 neighboring H3-7 cells
- Colors: Green → Yellow → Orange → Red (by risk_score)
- Hover: Show risk_score, confidence, anomaly_count
- Click: Drill down to tactical analysis

---

### **POST /api/ai_router/clausal-chains**

**Purpose:** Fetch narrative clausal chains for a region

**Request:**
```json
{
  "region": "872abc123def",
  "lookback_hours": 24,
  "source": "TAK_ADSB"
}
```

**Query Parameters:**
| Parameter | Type | Options | Default | Description |
|-----------|------|---------|---------|-------------|
| region | string | H3 cell | Required | Target region (any resolution) |
| lookback_hours | integer | 1-168 | 24 | Time window |
| source | string | TAK_ADSB, TAK_AIS, GDELT | null | Filter by source |

**Response (200 OK):**
```json
[
  {
    "uid": "a-f-A-H-28ACF9",
    "source": "TAK_ADSB",
    "predicate_type": "a-f-A-H-A-C-I",
    "narrative_summary": "Commercial aircraft descended from 35,000 ft to 15,000 ft",
    "clauses": [
      {
        "time": "2026-04-01T06:32:15Z",
        "locative_lat": 40.7128,
        "locative_lon": -74.0060,
        "locative_hae": 35000,
        "state_change_reason": "ALTITUDE_TRANSITION",
        "adverbial_context": {
          "speed": 461.5,
          "course": 220,
          "altitude": 35000,
          "battery_pct": null,
          "confidence": 0.96
        }
      },
      {
        "time": "2026-04-01T09:15:42Z",
        "locative_lat": 40.7755,
        "locative_lon": -73.8740,
        "locative_hae": 15000,
        "state_change_reason": "ALTITUDE_TRANSITION",
        "adverbial_context": {
          "speed": 350,
          "course": 225,
          "altitude": 15000,
          "battery_pct": null,
          "confidence": 0.97
        }
      }
    ]
  }
]
```

---

### **POST /api/analyze/{uid}**

**Purpose:** Get AI-powered entity-specific analysis (streaming)

**Request:**
```
POST /api/analyze/a-f-A-H-28ACF9
```

**Body:**
```json
{
  "uid": "a-f-A-H-28ACF9",
  "lookback_hours": 24,
  "mode": "tactical",
  "sitrep_context": null
}
```

**Parameters:**
| Parameter | Type | Options | Default | Description |
|-----------|------|---------|---------|-------------|
| uid | string | — | URL param | Entity identifier |
| lookback_hours | integer | 1-168 | 24 | Analysis window |
| mode | string | tactical, osint, sar | tactical | Analysis focus |
| sitrep_context | object | — | null | SITREP-specific metadata |

**Response (200 OK with SSE):**
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Transfer-Encoding: chunked

event: analysis_start
data: {"entity": "a-f-A-H-28ACF9", "type": "aircraft"}

data: TACTICAL ANALYSIS:
data:
data: Aircraft 28ACF9 (Boeing 737-900)
data: Track: Boston Logan (BOS) → LaGuardia (LGA)
data: Flight time: 3h 13m, average cruise: 461.5 kt
data:
data: MOVEMENT ANALYSIS:
data: • Climb phase (06:32-06:58): 10,000 ft/min rate
data: • Cruise phase (06:58-09:12): Level at 35,000 ft
data: • Descent phase (09:12-09:45): 3,300 ft/min rate
data:
data: MULTI-INT CONTEXT:
data: • Space weather: Kp=4.2 (quiet), no GPS degradation expected
data: • Internet: No outages detected in routing region
data: • SatNOGS: Transponder signal nominal on all ground passes
data:
data: ASSESSMENT:
data: Routine commercial flight. No anomalies detected.
data: Risk: LOW | Confidence: 0.94

event: analysis_end
data: {"complete": true, "tokens": 427}
```

**Event Types:**
- `analysis_start` - Analysis begun
- (streamed data lines) - Tokens from LLM
- `analysis_end` - Analysis complete with metadata

---

## Context Data Integration

### **Internet Outages (IODA)**

**Query Window:** ±2 hours from clause time
**Data Source:** IODA API (Internet Outage Detection and Analysis)
**Table:** `internet_outages`

**Impact on Risk Scoring:**
```
Base Risk Score: 0.45

Internet Outage Detected:
├─ Severity: 0.75 (major)
└─ Boosting: +10% (unusual entity movement during outage)

Final Risk Score: 0.45 × 1.1 = 0.495 → ELEVATED

Escalation Indicator:
"Internet outage detected (severity: 0.75)"
```

**Example Scenario:**
Entity accelerates rapidly → normally HIGH_RISK
BUT concurrent major ISP outage in region → Expected behavior
→ Risk DAMPENED by context analysis

---

### **Space Weather (Geomagnetic Storms)**

**Query Window:** ±1 hour from clause time
**Data Source:** NOAA Space Weather Prediction Center
**Table:** `space_weather_context`

**Kp-Index Categories:**
```
Kp 0-3:   Quiet (no aurora)
Kp 4-5:   Unsettled (weak aurora)
Kp 6:     Active (minor storm G1)
Kp 7:     Major storm (G2)
Kp 8:     Severe storm (G3)
Kp 9:     Extreme storm (G4-G5)
```

**Impact on Risk Scoring:**
```
Base Risk Score: 0.65

Space Weather Event:
├─ Kp Index: 7 (major geomagnetic storm G2)
├─ Normalized Score: 7/9 = 0.78
└─ Dampening: -10% (expected GPS/comms degradation)

Final Risk Score: 0.65 × 0.9 = 0.585 → MODERATE

Escalation Indicator:
"Space weather event (Kp: G2 Major Storm)"

Narrative Addition:
"Geomagnetic storm G2-level expected. GPS positioning accuracy may degrade
by 2-3 meters; satellite comms blackouts possible. TAK positioning jitter
within expected parameters for current space weather conditions."
```

**Example Scenario:**
Aircraft heading changes erratically → normally ESCALATION_ALERT
BUT concurrent G3 geomagnetic storm → Expected GPS degradation
→ Risk DAMPENED, categorized as SPACE_WEATHER_JITTER

---

### **Satellite Signal Intelligence (SatNOGS)**

**Query Window:** ±1 hour from clause time
**Data Source:** SatNOGS Ground Station Network
**Table:** `satnogs_signal_events`

**Signal Loss Threshold:** -10 dBm

**Impact on Risk Scoring:**
```
Base Risk Score: 0.52

SatNOGS Signal Events Detected:
├─ Event 1: Iridium constellation signal loss
│  └─ Ground stations: USA-1, USA-3 (lost signal simultaneously)
│  └─ Duration: 23 minutes
├─ Event 2: GPS signal degradation
│  └─ Signal strength: -14 dBm (threshold: -10 dBm)
│  └─ Duration: 18 minutes
└─ AnomalyMetric: signal_loss aggregation

Context Analysis:
"Multiple TAK entities reporting position fixes during satellite
signal outage window. SatNOGS ground stations unable to receive
transponder signals. This suggests:
  • Jamming in satellite communication bands, OR
  • Intentional suppression of identify-friend-foe (IFF) signals, OR
  • Orbital angular momentum loss (satellite degradation)"

Escalation Indicator:
"Satellite signal loss detected (Iridium constellation)"

Risk Impact:
If concurrent with military-grade vessel maneuvering
  → Possible electronic warfare / jamming signature
  → Risk ELEVATED to 0.72 (tactical interest)
If concurrent with anomalous flight routes
  → Possible GPS spoofing attack
  → Risk ELEVATED to 0.68 (forensic interest)
```

---

## Frontend Implementation

### **MapContextMenu Component**

**Location:** `src/components/map/MapContextMenu.tsx`

**Menu Items:**
```
┌─ Mission Control
├─ Set Focus Here          [Operator] Crosshair icon, green
├─ Save Location As...     [Operator] Save icon, cyan
├─ Analyze Regional Risk   [Operator] Zap icon, amber (NEW)
├─ ─────────────────────
└─ Return to Home Base     [All Roles] Home icon, white
```

**Implementation:**
```typescript
const handleAnalyzeRegionalRisk = () => {
  if (onAnalyzeRegionalRisk && coordinates) {
    const h3Region = h3.latLngToCell(coordinates.lat, coordinates.lon, 7);
    onAnalyzeRegionalRisk(h3Region, coordinates.lat, coordinates.lon);
    onClose();
  }
};
```

**H3 Resolution Mapping:**
- User clicks: H3-9 (tactical precision)
- Convert to H3-7: Regional assessment scope
- Display returns H3-7 heatmap + neighbors

---

### **AIAnalystPanel Component**

**Location:** `src/components/widgets/AIAnalystPanel.tsx`

**Lookback Window Options:**
```
┌─ Scan_Window
├─ 1 h  (real-time threats)
├─ 6 h  (recent activity)
├─ 12 h (half-day context)
├─ 24 h (daily assessment)
├─ 48 h (2-day patterns)
├─ 72 h (historical correlation)
└─ 7 d  (full week analysis) ← NEW
```

**State Variables:**
```typescript
const [lookback, setLookback] = useState<number>(1);     // Hours
const [mode, setMode] = useState<string>('tactical');    // tactical|osint|sar
const [isStreaming, setIsStreaming] = useState(false);   // SSE active
const [text, setText] = useState('');                    // Accumulated response
const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
```

**Trigger Logic:**
1. User selects lookback window
2. User selects analysis mode
3. User clicks "RUN" button (operator role required)
4. Panel sends POST /api/analyze/{uid}
5. Receives SSE stream, accumulates tokens
6. Displays formatted markdown output

---

### **Context Display Panels**

**SpaceWeatherPanel:**
- Real-time Kp-index gauge
- 24-hour historical sparkline
- G1/G2/G3+ storm level indicators
- GPS degradation risk warning

**OutageAlertPanel:**
- Country-level internet severity
- Color-coded bars: Green/Yellow/Orange/Red
- Severity percentage labels
- Refreshes every 5 minutes

---

## Data Flow Diagram

```
┌────────────────────────────────────────────────────────────┐
│ USER INTERACTION                                           │
│ • Right-click coordinate on map                           │
│ • Select "Analyze Regional Risk"                          │
└────────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────────┐
│ FRONTEND (MapContextMenu)                                  │
│ • Extract lat/lon from click coordinates                  │
│ • Convert to H3-7 region (h3.latLngToCell)               │
│ • Call onAnalyzeRegionalRisk(h3Region, lat, lon)         │
└────────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────────┐
│ FRONTEND (API Call)                                        │
│ POST /api/ai_router/evaluate                             │
│ {                                                          │
│   "h3_region": "872abc123def",                           │
│   "lookback_hours": 24,                                   │
│   "include_gdelt": true,                                  │
│   "include_tak": true                                     │
│ }                                                          │
└────────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────────┐
│ BACKEND (AI Router - evaluate_regional_escalation)         │
│                                                            │
│ 1. Query clausal_chains (7-day TAK data):                │
│    SELECT * FROM clausal_chains                          │
│    WHERE source IN ('TAK_ADSB', 'TAK_AIS')              │
│      AND time > now() - interval '24 hours'             │
│                                                            │
│ 2. Query context tables:                                 │
│    a) internet_outages (severity, country)              │
│    b) space_weather_context (kp_index, category)        │
│    c) satnogs_signal_events (signal_strength < -10)     │
│                                                            │
│ 3. Spatial-temporal alignment:                           │
│    • Map H3-7 region → H3-9 tactical cells              │
│    • Filter clauses by time window                       │
│    • Group by predicate_type, source                     │
│                                                            │
│ 4. Escalation pattern detection:                         │
│    • GDELT sequence matching                             │
│    • TAK anomaly concentration (>5 in 2km)              │
│    • Directional anomalies (>90° change)                │
│    • Emergency transponders (7700/7600/7500)            │
│                                                            │
│ 5. Context anomaly detection:                            │
│    a) detect_internet_outage_correlation()              │
│       → Score: outage severity (0-1)                     │
│       → Indicator: "Internet outage (severity: X)"       │
│    b) detect_space_weather_anomaly(kp_index)            │
│       → Score: kp/9 (normalized 0-1)                     │
│       → Indicator: "Space weather (Kp: G1-G5)"          │
│    c) detect_satnogs_signal_loss(events)                │
│       → Score: aggregated                                │
│       → Indicator: "Satellite signal loss"               │
│                                                            │
│ 6. Compute composite risk score:                         │
│    base_score = (pattern_conf + anomaly_score) / 2     │
│    if (kp_index > 0.5):                                 │
│      final_score = base_score * 0.9  // Dampening       │
│    if (outage_severity > 0.7):                          │
│      final_score = base_score * 1.1  // Boosting        │
│    final_score = min(final_score, 1.0)  // Cap at 1.0   │
│                                                            │
│ 7. Compile response:                                     │
│    {                                                      │
│      "h3_region_id": "872abc123def",                    │
│      "risk_score": 0.62,                                │
│      "escalation_indicators": [...],                    │
│      "confidence": 0.88,                                │
│      ...                                                │
│    }                                                      │
│                                                            │
└────────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────────┐
│ FRONTEND (Display Result)                                  │
│ • Show risk_score with color indicator                    │
│ • Display escalation_indicators                           │
│ • Show narrative_summary                                  │
│ • Optionally stream /api/analyze for entity details      │
│ • Update map with heatmap layer                           │
└────────────────────────────────────────────────────────────┘
```

---

## Configuration

### **Lookback Window Settings**
```typescript
const LOOKBACK_OPTIONS = [
  { label: '1 h',  value: 1 },
  { label: '6 h',  value: 6 },
  { label: '12 h', value: 12 },
  { label: '24 h', value: 24 },
  { label: '48 h', value: 48 },
  { label: '72 h', value: 72 },
  { label: '7 d',  value: 168 },  // NEW: 7 days = 168 hours
];
```

### **Analysis Modes**
```typescript
const MODE_OPTIONS = [
  { label: 'Tactical', value: 'tactical' },   // Military focus
  { label: 'OSINT',    value: 'osint' },      // Open-source intel
  { label: 'SAR',      value: 'sar' },        // Search & rescue
];
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Invalid h3_region" | Coordinates outside valid range | Verify lat/lon: ±180°, ±90° |
| No escalation indicators | No matching patterns/anomalies | Try larger lookback window |
| Regional risk returns empty | No clauses in time window | Check TAK poller is running |
| Space weather context missing | NOAA API not updating | Check space_weather_context table |
| Outage data not correlating | IODA API down | Check internet_outages table INSERT rate |
| SatNOGS signal loss not detected | Ground stations offline | Verify satnogs_signal_events data quality |
| LLM analysis not streaming | Ollama model not loaded | Run: `ollama pull llama3` |
| Risk score always 0.5 | No entities in region | Try urban area with higher TAK density |

---

## Performance Tips

1. **For large regions:** Use H3-6 or H3-5 to reduce computation
2. **For historical analysis:** Use 72h or 7d lookback (cached aggregates)
3. **For real-time:** Use 1h-6h lookback (minimal database load)
4. **Batch regional assessments:** Query heatmap endpoint instead of evaluate multiple times

---

## Future Enhancements

- [ ] Predictive escalation (pre-event detection)
- [ ] Correlation with weather/ocean conditions
- [ ] Cross-source timeline visualization (TAK + GDELT + context)
- [ ] Custom risk thresholds per user/team
- [ ] Escalation automation (auto-notify if risk > X AND context Y)
- [ ] Export risk assessment to threat intelligence platforms

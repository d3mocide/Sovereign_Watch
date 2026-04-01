# TAK Clausalizer & Multi-INT Autonomous Threat Detection

## Overview

The TAK Clausalizer is a 4-phase autonomous threat detection system that transforms raw Tactical (TAK) protocol data into actionable threat narratives through semantic state-change analysis, multi-source intelligence correlation (multi-INT), and AI-driven risk assessment.

**Key Innovation:** Rather than isolated anomaly detection, the system correlates temporal state changes across TAK (aircraft/maritime), GDELT (geopolitical events), internet infrastructure, space weather, and satellite observations into cohesive "clausal chains"—narratives that explain *why* entities change behavior.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     SOVEREIGN WATCH ECOSYSTEM                    │
└─────────────────────────────────────────────────────────────────┘

INPUT SOURCES (Pollers)
├─ TAK Protocol (ADSB/AIS ground stations)
│  └─ Aircraft tracks (Type code: a-f-A/M/P)
│  └─ Maritime tracks (Type code: a-f-A/S/S)
├─ GDELT (Geopolitical events)
│  └─ Conflict/tension events with lat/lon
├─ IODA (Internet Outage Detection)
│  └─ Regional internet connectivity status
├─ NOAA Space Weather (Kp-index, DST)
│  └─ Geomagnetic storm indices
├─ SatNOGS (Ground station observations)
│  └─ Satellite signal strength/loss events
└─ Various APIs (SGP4 TLE, weather, buoys, etc.)

                           ↓

┌─────────────────────────────────────────────────────────────────┐
│              TAK CLAUSALIZER MICROSERVICE (Phase 1A-1B)         │
├─────────────────────────────────────────────────────────────────┤
│ Input: Kafka topics (adsb_raw, ais_raw)                         │
│                                                                  │
│ Components:                                                      │
│ ┌─ DeltaEngine: Detects meaningful state changes               │
│ │  └─ Haversine jitter filtering (100m threshold)              │
│ │  └─ H3-9 geofence boundary crossing detection                │
│ │  └─ Speed/course/altitude transitions                        │
│ │  └─ Redis-backed state caching (3600s TTL)                   │
│ │                                                               │
│ ├─ StateChangeEvaluator: 6 transition types                    │
│ │  ├─ Type code changes (affiliation/category updates)         │
│ │  ├─ Location transitions (H3-9 cell crossing)                │
│ │  ├─ Speed transitions (< 0.5 m/s threshold)                 │
│ │  ├─ Course changes (> 30° delta)                             │
│ │  ├─ Altitude changes (> 500m delta)                          │
│ │  └─ Battery critical (< 20%)                                 │
│ │                                                               │
│ └─ ClauseEmitter: Publishes state-change narratives            │
│    └─ Topic: clausal_chains_state_changes                      │
│    └─ Partition key: UID (ensures ordering)                    │
│    └─ Payload: StateChangeEvent with confidence               │
│                                                                  │
│ Processing: consume_loop() + batch_flush_loop()                │
│ (concurrent, ordered by UID partition)                         │
└─────────────────────────────────────────────────────────────────┘

                           ↓

┌─────────────────────────────────────────────────────────────────┐
│              TIMESCALEDB STORAGE LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ clausal_chains (hypertable)                                     │
│ ├─ Time-partitioned (1-day chunks)                             │
│ ├─ Compressed after 7 days                                     │
│ ├─ Retention: 90 days                                          │
│ ├─ Columns: time, uid, source, predicate_type,               │
│ │           locative_lat/lon/hae, state_change_reason,        │
│ │           adverbial_context (JSONB), narrative_summary      │
│ ├─ Indices: (uid, time DESC), (source, time DESC),           │
│ │           GIST geom, trigram narrative, GIN adverbial      │
│ └─ Triggers: auto-update timestamp, populate geom            │
│                                                                  │
│ hourly_clausal_summaries (continuous aggregate)               │
│ ├─ 1-hour windows (auto-refresh)                              │
│ └─ Aggregates: state_change_count, predicates[],             │
│               positions, max_confidence, reasons[]             │
│                                                                  │
│ CONTEXT TABLES (NEW - Phase 1C):                               │
│                                                                  │
│ internet_outages (IODA - Internet Outage Detection)           │
│ ├─ Time-partitioned (1-day chunks)                            │
│ ├─ Retention: 7 days                                          │
│ ├─ Columns: time, country_code, asn, severity (0-1),         │
│ │           affected_nets, asn_name, geom (country centroid) │
│ ├─ Indices: (country_code, time DESC), (severity DESC),      │
│ │           GIST geom                                         │
│ └─ Purpose: Correlate TAK anomalies with comms disruptions   │
│                                                                  │
│ satnogs_signal_events (SatNOGS Signal Intelligence)           │
│ ├─ Time-partitioned (1-day chunks)                            │
│ ├─ Retention: 30 days                                         │
│ ├─ Columns: time, norad_id, ground_station_id/name,         │
│ │           signal_strength (dBm), frequency, modulation,    │
│ │           observation_start/end, confidence                │
│ ├─ Indices: (norad_id, time DESC), (signal_strength),       │
│ │           (ground_station_id, time DESC)                   │
│ └─ Purpose: Detect satellite comms anomalies/jamming         │
│                                                                  │
│ space_weather_context (NOAA Aurora/Space Weather)            │
│ ├─ Time-partitioned (1-day chunks)                            │
│ ├─ Retention: 30 days                                         │
│ ├─ Columns: time, kp_index (0-9), kp_category               │
│ │           (quiet/unsettled/active/storms), dst_index,      │
│ │           f10_7 (solar flux), explanation                  │
│ ├─ Indices: (kp_category, time DESC), (time DESC)           │
│ └─ Purpose: Explain GPS/comms anomalies during storms       │
│                                                                  │
│ clausal_chains_enriched (VIEW)                                │
│ └─ LEFT JOINs clausal_chains with context tables             │
│    (±2h for outages, ±1h for space weather/SatNOGS)         │
│    └─ Returns augmented clause data with context scores      │
│       for multi-INT correlation                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

                           ↓

┌─────────────────────────────────────────────────────────────────┐
│              AI ROUTER - MULTI-INT FUSION (Phase 1B-1C)         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Endpoints:                                                      │
│                                                                  │
│ POST /api/ai_router/evaluate                                  │
│ ├─ Input: h3_region (H3-7), lookback_hours (1-168)           │
│ ├─ Queries: clausal_chains + context tables                  │
│ ├─ Outputs: RiskAssessmentResponse                           │
│ │  ├─ risk_score (0.0-1.0)                                  │
│ │  ├─ narrative_summary (LLM-generated)                      │
│ │  ├─ anomalous_uids[]                                       │
│ │  ├─ escalation_indicators[]                                │
│ │  └─ confidence                                             │
│ │                                                             │
│ ├─ Processing Pipeline:                                      │
│ │  1. Spatial-temporal alignment                             │
│ │     └─ Map clauses to H3-7 region, filter by time          │
│ │  2. Escalation pattern detection                           │
│ │     └─ GDELT prototypical sequences                        │
│ │  3. TAK anomaly detection                                  │
│ │     ├─ Entity clustering (>5 in <2km)                     │
│ │     ├─ Directional anomalies (>90° heading change)         │
│ │     └─ Emergency transponder codes (7700/7600/7500)        │
│ │  4. CONTEXT ANOMALY DETECTION (NEW):                       │
│ │     ├─ Internet outage correlation (severity → score)      │
│ │     ├─ Space weather (Kp normalization: 0-1)             │
│ │     └─ SatNOGS signal loss (< -10 dBm)                    │
│ │  5. Risk score computation                                 │
│ │     ├─ Base: pattern_confidence + anomaly_score           │
│ │     └─ Apply context dampening/boosting:                  │
│ │        • Kp > 0.5 → 10% dampening (expected behavior)     │
│ │        • Outage severity > 0.7 → 10% boosting             │
│ │  6. LLM sequence evaluation (if risk > 0.3)               │
│ │     └─ Streams analysis via SSE                            │
│ │                                                             │
│ GET /api/ai_router/regional_risk                             │
│ ├─ Input: h3_region, lookback_hours                          │
│ ├─ Output: heatmap with risk scores for region + neighbors   │
│ └─ Uses: H3 ring aggregation (grid_ring)                     │
│                                                                  │
│ POST /api/clausal-chains                                     │
│ ├─ Input: region, lookback_hours, source (TAK/GDELT)         │
│ ├─ Output: ClausalChain[] with full state narratives         │
│ └─ Groups by UID, orders by time                             │
│                                                                  │
│ POST /api/analyze/{uid}                                      │
│ ├─ Input: uid, lookback_hours, mode (tactical/osint/sar)     │
│ ├─ Output: SSE stream (Server-Sent Events)                   │
│ └─ LLM-powered entity-specific analysis                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

                           ↓

┌─────────────────────────────────────────────────────────────────┐
│              FRONTEND VISUALIZATION LAYER                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ AIAnalystPanel (Widget)                                         │
│ ├─ Displays streaming LLM analysis in real-time               │
│ ├─ User-selectable: Lookback (1h-7d), Mode, Engine            │
│ ├─ Run button → POST /api/analyze/{uid}                       │
│ └─ Shows escalation indicators with context info              │
│                                                                  │
│ SpaceWeatherPanel (Context Display)                           │
│ ├─ Kp-index gauge + 24h history                               │
│ ├─ GPS degradation warning                                    │
│ └─ Polls every 5 minutes                                      │
│                                                                  │
│ OutageAlertPanel (Context Display)                            │
│ ├─ Country-level internet outage severity bars                │
│ └─ Color-coded by impact percentage                           │
│                                                                  │
│ MapContextMenu (Right-click)                                   │
│ ├─ "Set Focus Here" (operator-only)                           │
│ ├─ "Save Location" (operator-only)                            │
│ ├─ "Analyze Regional Risk" (NEW - operator-only)              │
│ │  └─ Converts coordinates to H3-7 region                     │
│ │  └─ Triggers POST /api/ai_router/evaluate                  │
│ └─ "Return to Home Base"                                      │
│                                                                  │
│ Clausal Chain Layer (Deck.gl composite)                        │
│ ├─ PathLayer: Movement history (color by predicate)           │
│ ├─ IconLayer: State-change markers (confidence opacity)       │
│ └─ TextLayer: Narrative labels at final position              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 Implementation Breakdown

### **Phase 1A: TAK Clausalizer Microservice** ✅ COMPLETE

**Deliverables:**
- `backend/ingestion/tak_clausalizer/main.py` - Entry point, graceful shutdown
- `backend/ingestion/tak_clausalizer/service.py` - TakClausalizerService orchestrator
- `backend/ingestion/tak_clausalizer/delta_engine.py` - State change detection with Redis caching
- `backend/ingestion/tak_clausalizer/state_change_evaluator.py` - 6 transition type detection
- `backend/ingestion/tak_clausalizer/clause_emitter.py` - Kafka producer for state changes
- `backend/db/init.sql` - clausal_chains hypertable schema

**Key Features:**
- Consumes from `adsb_raw` and `ais_raw` Kafka topics
- Detects meaningful state transitions (not jitter/noise)
- Haversine distance filtering (100m threshold)
- H3-9 geofence boundary crossing
- Speed/course/altitude change thresholds
- Redis-backed medial clause caching (3600s TTL)
- Publishes to `clausal_chains_state_changes` topic
- Statistics tracking: messages_consumed, processed, jitter_filtered, state_changes_emitted

**Data Retention:** 7 days (increased from 72 hours for GDELT parity)

---

### **Phase 1B: AI Router - Escalation Detection & Pattern Analysis** ✅ COMPLETE

**Deliverables:**
- `backend/api/routers/ai_router.py` - Regional risk evaluation endpoint
- `backend/api/services/escalation_detector.py` - Pattern & anomaly detection
- `backend/api/services/sequence_evaluation_engine.py` - LLM-powered risk assessment
- `backend/api/services/spatial_temporal_alignment.py` - H3 alignment & GDELT correlation

**Key Features:**
- Regional escalation risk scoring (0.0-1.0)
- GDELT prototypical sequence matching (protest→clashes, etc.)
- TAK anomaly concentration detection (5+ entities in 2km)
- Directional anomalies (>90° heading change)
- Emergency transponder detection (aviation squawk codes)
- Alignment scoring between TAK and GDELT events
- LiteLLM routing for zero-shot escalation analysis
- Risk score capped at 1.0, threat-level categorization

**Endpoints:**
- `POST /api/ai_router/evaluate` - Regional risk assessment
- `GET /api/ai_router/regional_risk` - H3 heatmap for region + neighbors
- `POST /api/clausal-chains` - Fetch narrative chains by region
- `GET /api/ai_router/health` - Health check

---

### **Phase 1C: Multi-INT Context Integration** ✅ COMPLETE

**Deliverables:**
- `backend/db/init.sql` - 3 new context tables + enriched view
- `backend/api/services/escalation_detector.py` - 3 new detector methods
- `backend/api/routers/ai_router.py` - Context query + dampening/boosting logic

**Context Data Integrated:**

1. **Internet Outages (IODA)**
   - Table: `internet_outages` (7-day retention)
   - Detector: `detect_internet_outage_correlation()`
   - Scoring: Outage severity (0.0-1.0) as AnomalyMetric score
   - Boosting: 10% risk increase if severity > 0.7 (anomalous behavior during outage)

2. **Space Weather (NOAA)**
   - Table: `space_weather_context` (30-day retention)
   - Detector: `detect_space_weather_anomaly()`
   - Scoring: Kp-index normalization (0-9 → 0.0-1.0)
   - Dampening: 10% risk decrease if Kp > 0.5 (expected degradation during storms)

3. **Satellite Signal Intelligence (SatNOGS)**
   - Table: `satnogs_signal_events` (30-day retention)
   - Detector: `detect_satnogs_signal_loss()`
   - Threshold: -10 dBm signal loss events
   - Scoring: Aggregated as list of AnomalyMetric objects

**Data Flow:**
```
Regional Escalation Request
  ↓
Query clausal_chains + internet_outages + space_weather_context + satnogs_signal_events
  ↓
Detect pattern + TAK anomalies + context anomalies
  ↓
Compute risk score with context-aware dampening/boosting
  ↓
Generate escalation indicators including context factors
  ↓
Stream LLM analysis to frontend
```

---

## Frontend User Interface

### **AI Analyst Panel**
- **Triggering:** User-initiated (click "RUN" button)
- **Lookback Window:** 1h, 6h, 12h, 24h, 48h, 72h, **7d** (NEW)
- **Analysis Modes:** TACTICAL, OSINT, SAR
- **Role Gating:** Operator role minimum
- **Output:** Real-time streaming LLM narrative via SSE

### **Regional Risk Analysis** (NEW)
- **Entry Point:** Right-click context menu on map → "Analyze Regional Risk"
- **Triggering:** Operator-only, manual click
- **Behavior:**
  1. Right-click on map coordinate
  2. Select "Analyze Regional Risk"
  3. Frontend converts to H3-7 region
  4. Calls `POST /api/ai_router/evaluate`
  5. Receives regional risk assessment
  6. Displays risk score + heatmap + narrative

### **Context Indicators**
- **Space Weather Panel:** Real-time Kp-index + GPS degradation warning
- **Outage Alert Panel:** Internet outage severity by country
- **Escalation Indicators:** Include context factors (e.g., "Space weather event (G2)", "Internet outage severity: 0.75")

---

## Data Model

### **Clausal Chain Structure**
```typescript
interface ClausalChain {
  uid: string;                    // Entity ID
  source: 'TAK_ADSB' | 'TAK_AIS' | 'GDELT';
  predicate_type: string;         // Type code or GDELT event code
  narrative_summary?: string;     // AI summary
  clauses: {
    time: string;                 // ISO8601
    locative_lat/lon: number;
    locative_hae?: number;        // Height above ellipsoid
    state_change_reason?: string; // e.g., "LOCATION_TRANSITION"
    adverbial_context: {
      speed: number;              // m/s
      course: number;             // degrees
      altitude: number;           // meters
      battery_pct?: number;        // 0-100
      confidence: number;         // 0.0-1.0
    }
  }[]
}
```

### **Risk Assessment Response**
```typescript
interface RiskAssessmentResponse {
  h3_region_id: string;
  risk_score: number;            // 0.0-1.0
  narrative_summary: string;
  anomalous_uids: string[];
  escalation_indicators: string[];
  confidence: number;            // 0.0-1.0
  pattern_detected: boolean;
  anomaly_count: number;
}
```

---

## Configuration

### **TAK Clausalizer (Environment Variables)**
```bash
KAFKA_BROKERS=sovereign-redpanda:9092
REDIS_HOST=sovereign-redis
REDIS_PORT=6379
DB_DSN=postgresql://sovereign:password@sovereign-timescaledb/sovereign_watch
```

### **AI Router (LiteLLM Configuration)**
```python
litellm_config = {
    "api_key": "",
    "api_base": "http://localhost:11434",  # Local Ollama
    "model_name": "llama3"
}
```

### **Data Retention Policies**
| Table | Window | Compression | Purpose |
|-------|--------|-------------|---------|
| clausal_chains | 90 days | After 7 days | Primary TAK narrative storage |
| internet_outages | 7 days | None | Short-term context |
| satnogs_signal_events | 30 days | None | Satellite anomaly history |
| space_weather_context | 30 days | None | Aurora/storm forecast |
| hourly_clausal_summaries | 30-day offset | Auto-refresh hourly | Aggregated trend analysis |

---

## Performance Considerations

### **Storage Optimization**
- **Orbital Data:** Stores only TLEs (~10 KB), computes positions on-demand via SGP4
  - Prevents: ~1.5+ TB/week of redundant positional data
  - Trade-off: Minimal CPU overhead for SGP4 calculations (nanoseconds)

- **TAK Hypertable Compression:**
  - 1-day chunk intervals
  - Automatic compression after 7 days
  - ~70% storage reduction on historical data

- **Context Table Pruning:**
  - internet_outages: 7-day window (minimal)
  - space_weather_context: 30-day window (sparse data)
  - satnogs_signal_events: 30-day window (event-driven)

### **Query Optimization**
- Indices on: (uid, time DESC), (source, time DESC), spatial geom, narrative trigram
- GIN indices on JSONB adverbial_context for fast filtering
- Continuous aggregates for hourly summaries (pre-computed)

### **Streaming Architecture**
- Kafka partitioning by UID ensures ordered processing
- Batch flush loop (5-second windows) reduces database writes
- Redis medial clause caching reduces repeated state lookups
- SSE streaming prevents large response payload buffering

---

## Future Enhancements (Captured for Implementation)

### **Regional Risk Visualization**
- [ ] H3-based heatmap rendering on map (Deck.gl H3CoverageLayer)
- [ ] Color gradient: Green (STABLE) → Yellow (MONITORING) → Orange (ELEVATED) → Red (CRITICAL)
- [ ] Click H3 cell → drill-down to tactical view (H3-9 resolution)
- [ ] Auto-refresh on data updates

### **Advanced Escalation Patterns**
- [ ] Temporal clustering: sequence of events over time
- [ ] Spatial clustering: geographic proximity of anomalies
- [ ] Cross-source correlation: TAK + GDELT + infrastructure simultaneously
- [ ] Predictive escalation: ML model for pre-event detection

### **Enhanced Context Integration**
- [ ] Ocean buoy/weather correlation (sea state anomalies)
- [ ] Atmospheric conditions (wind, temp) → GPS/RF degradation
- [ ] Solar flare prediction → preemptive alert suppression
- [ ] Submarine cable strain → coordinated attack detection

### **Multi-Language LLM Analysis**
- [ ] Local model fine-tuning on Sovereign Watch threat taxonomy
- [ ] Multi-model ensemble (speed vs accuracy trade-off)
- [ ] Custom prompt templates per entity type (air/sea/orbital)
- [ ] Analysis caching to reduce token costs

### **Automated Escalation Workflows**
- [ ] Tier 1→2→3 escalation automation
- [ ] Conditional alerts (notify if risk > X AND context Y)
- [ ] Auto-tagging for threat intelligence platform export (STIX/TAXII)
- [ ] Webhook integration for external SIEM/SOC systems

### **Regulatory Compliance**
- [ ] GDPR data retention automation (configurable per region)
- [ ] Audit logging for all AI-driven decisions
- [ ] Explainability: trace which context factors influenced risk score
- [ ] Data minimization: option to anonymize historical PII

---

## Deployment Architecture

### **Docker Compose Services**
```yaml
sovereign-tak-clausalizer:
  image: tak-clausalizer:latest
  depends_on: [sovereign-redis, sovereign-redpanda, sovereign-timescaledb]
  environment:
    KAFKA_BROKERS: sovereign-redpanda:9092
    REDIS_HOST: sovereign-redis
  restart: unless-stopped
```

### **Database Initialization**
```sql
-- Run migrations in order:
1. Create hypertables (clausal_chains, hourly_clausal_summaries)
2. Create context tables (internet_outages, satnogs_signal_events, space_weather_context)
3. Create enriched view (clausal_chains_enriched)
4. Create indices
5. Set retention policies
6. Set compression policies
```

### **Kafka Topics**
| Topic | Partition Key | Retention | Replicas |
|-------|--------------|-----------|----------|
| adsb_raw | ICAO | 7 days | 3 |
| ais_raw | MMSI | 7 days | 3 |
| clausal_chains_state_changes | UID | 3 days | 3 |

---

## Testing & Validation

### **Unit Tests**
- [x] DeltaEngine: Haversine filtering, state caching
- [x] StateChangeEvaluator: All 6 transition types
- [x] ClauseEmitter: Message formatting, Kafka publishing
- [x] EscalationDetector: Pattern matching, anomaly detection, context methods
- [ ] SequenceEvaluationEngine: LLM response parsing, error handling

### **Integration Tests**
- [ ] End-to-end: TAK message → clausal chain → AI Router → risk assessment
- [ ] Context correlation: Outage + space weather + signal loss simultaneous
- [ ] Multi-source alignment: GDELT + TAK in same region

### **Performance Tests**
- [ ] Throughput: Messages/second under sustained load
- [ ] Latency: Time from TAK input to Risk Assessment output
- [ ] Storage: Hypertable compression efficiency
- [ ] Query: Regional risk evaluation on 7-day window

---

## Troubleshooting

### **Common Issues**

**1. Clausal chains not being created**
- Check Kafka broker connectivity: `rpk cluster info`
- Verify TAK poller is writing to `adsb_raw` / `ais_raw`
- Check service logs: `docker logs sovereign-tak-clausalizer`

**2. Regional risk returns empty**
- Verify H3 cell is valid: `h3.latLngToCell(lat, lon, 7)`
- Check lookback_hours is within data window
- Query database directly: `SELECT COUNT(*) FROM clausal_chains WHERE time > now() - interval '7 days'`

**3. LLM analysis not streaming**
- Verify Ollama is running: `curl http://localhost:11434/api/tags`
- Check model is loaded: `ollama pull llama3`
- Inspect SSE stream: `curl -N http://localhost:8000/api/analyze/uid123`

**4. Context data not correlating**
- Verify context tables exist: `\dt space_weather_context`
- Check data is being inserted: `SELECT COUNT(*) FROM space_weather_context`
- Verify query windows: outages (±2h), space weather (±1h), satnogs (±1h)

---

## References

- TAK Protocol: [TAK_Protocol.md](TAK_Protocol.md)
- API Reference: [API_Reference.md](API_Reference.md)
- Configuration: [Configuration.md](Configuration.md)
- Development: [Development.md](Development.md)
- Deployment: [Deployment.md](Deployment.md)

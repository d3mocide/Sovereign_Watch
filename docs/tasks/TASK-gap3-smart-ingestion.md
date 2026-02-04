# Task: Gap 3 & 1 - Smart Python Ingestion Service

**Status**: Planned
**Priority**: P1 (High)
**Owner**: Data Engineering Agent
**Reference**: [API-PIPE-Line Design](../research/API-PIPE-Line%20Design.md)

## 1. Objective

Replace the static Benthos-based polling ("Tier 1") with a dynamic **Python Poller Service** that implements **Gap 3 (H3 Sharding)** and **Gap 1 (Round-Robin Multi-Source)**. This will increase update frequency from ~2/min to ~120/min by prioritizing active airspace cells over empty areas.

## 2. Architecture Shift

- **Current**: Benthos Input (YAML) -> Kafka
- **New**: Python Service (`backend/ingestion/poller`) -> Kafka
  - _Note_: Benthos will still likely be used for Maritime or just as a stream processor, but Aviation Ingestion moves to Python code.

## 3. Implementation Plan

### 3.1 Python Service Scaffold

- Create `backend/ingestion/poller/`
- Create `requirements.txt`:
  - `aiohttp` (Async HTTP)
  - `tenacity` (Smart Retries - Gap 2)
  - `aiolimiter` (Rate Limiting)
  - `h3` (Geospatial Sharding - Gap 3)
  - `redis` (State/Priority Queue)
  - `aiokafka` (Output to Redpanda)

### 3.2 Core Logic Implementation

(Based on research doc code)

1.  **`multi_source_poller.py`**: Round-robin client for Airplanes.live, ADSB.fi, ADSB.lol.
2.  **`h3_sharding.py`**: Manage H3 Res-7 cells. Priority queue logic (Redis ZSET).
3.  **`deduplication.py`**: 5-second window dedupe using ICAO24 (Gap 4).
4.  **`main.py`**: Service loop.

### 3.3 Infrastructure Updates

- Update `docker-compose.yml` to add `ingestion-poller` service.
- Ensure Redis persistence is enabled for priority queue state.

## 4. Work Breakdown

1.  **Dependency Setup**: Create folder structure and requirements.
2.  **Poller Implementation**: Port the research code into runnable service.
3.  **Docker Integration**: Deploy and verify data flow to `adsb_raw` topic.
4.  **Cleanup**: Disable `aviation_ingest.yaml` Benthos pipeline.

## 5. Success Metrics

- **Throughput**: >100 requests/minute (aggregate).
- **Latency**: High-traffic cells updated every <10s.
- **Quota**: Zero 429 errors (managed by `aiolimiter`).

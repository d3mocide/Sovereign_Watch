# Task: Gap 3 & 1 - Smart Python Ingestion Service

**Status**: ✅ COMPLETED (2026-02-03)
**Priority**: P1 (High)
**Owner**: Data Engineering Agent
**Reference**: [API-PIPE-Line Design](../research/API-PIPE-Line%20Design.md)

## 1. Objective

Replace the static Benthos-based polling ("Tier 1") with a dynamic **Python Poller Service** that implements **Multi-Source Round-Robin** with weighted selection. This improves reliability and reduces rate limit errors by distributing load across multiple API providers.

## 2. Final Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  sovereign-adsb-poller (Python 3.11)                        │
│  ├── multi_source_poller.py  - Weighted API rotation        │
│  ├── main.py                 - Service loop + TAK normalize │
│  └── h3_sharding.py          - (Available, not used in MVP) │
└───────────────────┬─────────────────────────────────────────┘
                    │ Kafka: adsb_raw
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  sovereign-backend (FastAPI)                                │
│  └── WebSocket /api/tracks/live → Frontend                  │
└─────────────────────────────────────────────────────────────┘
```

## 3. Implementation Notes

### 3.1 What Was Built

- **`backend/ingestion/poller/`** - Python async service
- **Weighted Source Selection**:
  - `adsb.fi` (40% of requests)
  - `adsb.lol` (40% of requests)
  - `airplanes.live` (20% - strictest rate limits)
- **Rate Limiting**: `aiolimiter` with per-source limits
- **Smart Retries**: `tenacity` with exponential backoff + jitter
- **TAK Normalization**: Converts ADSBx format to TAK-like JSON

### 3.2 Simplified from Original Plan

- **H3 Sharding**: Code written but NOT USED in production
  - Reason: With only 3 API sources, spreading requests across 469 H3 cells caused 5+ minute update gaps
  - Solution: Use 3 fixed overlapping polling points (simpler, faster updates)
- **Redis Priority Queue**: Not used (would be for H3 cell prioritization)
- **Deduplication**: Moved to future Gap 4 task

### 3.3 Files Created

| File                            | Purpose                                             |
| ------------------------------- | --------------------------------------------------- |
| `poller/main.py`                | Service entrypoint, polling loop, TAK normalization |
| `poller/multi_source_poller.py` | Weighted round-robin API client                     |
| `poller/h3_sharding.py`         | H3 priority manager (for future scaling)            |
| `poller/Dockerfile`             | Python 3.11-slim with dependencies                  |
| `poller/requirements.txt`       | aiohttp, tenacity, aiolimiter, h3, aiokafka         |

## 4. Docker Integration

Container renamed from `ingestion-poller` → `sovereign-adsb-poller` for clarity.

```yaml
# docker-compose.yml
adsb-poller:
  build: ./backend/ingestion/poller
  container_name: sovereign-adsb-poller
  environment:
    - KAFKA_BROKERS=sovereign-redpanda:9092
  depends_on:
    - redpanda
```

## 5. Future Enhancements (When More API Capacity Available)

- [ ] Re-enable H3 sharding when we have 10+ API sources
- [ ] Add Gap 4 deduplication (5-second ICAO24 window)
- [ ] Prometheus metrics endpoint
- [ ] Centralized ENV config for LAT/LON center point

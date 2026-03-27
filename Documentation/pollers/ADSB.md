# ADS-B Aviation Poller — User Guide

> **Container:** `sovereign-adsb-poller`
> **Source Code:** `backend/ingestion/aviation_poller/`
> **Kafka Output Topic:** `adsb_raw`

---

## Overview

The ADS-B poller ingests real-time aircraft transponder data from multiple public ADS-B networks. It implements a **multi-source round-robin architecture** with automatic failover, rate limiting, and an **H3-based adaptive priority queue** that focuses polling density on the highest-traffic airspace cells within your configured area of responsibility (AOR).

Each aircraft position is normalized into the internal **TAK JSON format** (see [TAK Protocol Reference](../TAK_Protocol.md)) before being published to the Redpanda `adsb_raw` topic.

---

## Data Sources

| Source | Base URL | Priority | Rate Limit |
| :--- | :--- | :--- | :--- |
| **adsb.fi** | `opendata.adsb.fi/api/v3` | Primary (alternates with adsb.lol) | 1 request / **2 seconds** |
| **adsb.lol** | `api.adsb.lol/v2` | Primary (alternates with adsb.fi) | 1 request / **2 seconds** |
| **airplanes.live** | `api.airplanes.live/v2` | Backup (used every ~10th request) | 1 request / **30 seconds** |

No API keys are required for any of the above sources.

### Source Rotation Logic

The poller maintains three **independent async loops**, one per source, each driven by the H3 priority queue:

- adsb.fi and adsb.lol are used alternately as the primary sources.
- airplanes.live is inserted approximately every 10th poll cycle to conserve its strict rate limit.
- If a source returns HTTP 429 (rate-limited), it enters an **exponential cooldown** starting at 30 seconds and doubling on each successive failure (capped at 5 minutes).
- If all sources are simultaneously in cooldown, the poller falls through to whichever source recovers soonest.

---

## H3 Adaptive Coverage

Instead of polling a single center point, the poller divides the AOR into an **H3 hexagonal grid** (Uber H3 spatial indexing). Each cell is tracked independently with a dynamic priority score based on observed aircraft traffic density.

- High-traffic cells (e.g., near an airport) are polled more frequently.
- Low-traffic cells are polled less often, conserving API quota.
- For AORs smaller than 50 nm radius, a single-point poll is used for maximum update frequency.

The H3 cell state is stored in Redis (`h3:cell_state` hash) and is visible via the `/api/debug/h3_cells` endpoint.

---

## Polling Rate Summary

| Scenario | Effective Update Rate |
| :--- | :--- |
| Normal operation (adsb.fi + adsb.lol alternating) | ~1 update / **2 seconds** per H3 cell |
| Small AOR (< 50 nm) single-point mode | ~1 update / **2 seconds** |
| Airplanes.live contribution | 1 request / **30 seconds** (backup only) |
| Source in cooldown (429) | Paused 30s–5 min (exponential backoff) |

---

## Configuration

All configuration is provided via environment variables (set in `docker-compose.yml` or `.env`):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `CENTER_LAT` | `45.5152` | AOR center latitude (degrees) |
| `CENTER_LON` | `-122.6784` | AOR center longitude (degrees) |
| `COVERAGE_RADIUS_NM` | `150` | AOR radius in nautical miles |
| `KAFKA_BROKERS` | `sovereign-redpanda:9092` | Redpanda bootstrap servers |
| `REDIS_HOST` | `sovereign-redis` | Redis hostname |
| `HOLDING_PATTERN_THRESHOLD` | `300` | Degrees of total turn within window to flag |
| `HOLDING_WINDOW_S` | `300` | Rolling observation window (seconds) |
| `MIN_VELOCITY_KNOTS` | `0` | Minimum velocity for detection |
| `ARBITRATION_CLEANUP_INTERVAL` | `30` | Stale arbitration entry cleanup interval (seconds) |

### Dynamic Mission Area

The mission area (center + radius) can be updated **at runtime** without restarting the poller. The Frontend Settings HUD issues a `POST /api/config/location` request, which publishes to the Redis `navigation-updates` pub/sub channel. The poller subscribes to this channel and seamlessly re-seeds its H3 grid for the new AOR within seconds.

---

## Data Flow

```
External ADS-B APIs
    ↓  (HTTP REST, ADSBx v2 JSON format)
MultiSourcePoller._fetch()
    ↓  (rate-limited, with exponential backoff)
H3PriorityManager  ←→  Redis (h3:cell_state)
    ↓
PollerService.process_aircraft_batch()
    ↓  (de-duplicate via Arbitrator)
normalize_to_tak()  →  classify_aircraft()
    ↓  (TAK JSON)
Redpanda: adsb_raw topic  →  Backend API / TimescaleDB
```

---

## Aircraft Classification

Each aircraft is classified by the `classify_aircraft()` function, which maps ADS-B category codes and ICAO type designators to a structured `Classification` object:

| Field | Example Values |
| :--- | :--- |
| `affiliation` | `civilian`, `military` |
| `platform` | `fixed_wing`, `helicopter`, `drone` |
| `size_class` | `light`, `medium`, `heavy` |
| `icao_type` | `B738`, `A320`, `F16` |
| `squawk` | `7700` (emergency), `7600` (comms failure) |
| `emergency` | `"general"`, `"medical"`, `""` |

### CoT Type Mapping

| Classification | CoT Type String |
| :--- | :--- |
| Civilian Fixed Wing | `a-f-A-C-F` |
| Military Fixed Wing | `a-f-A-M-F` |
| Civilian Helicopter | `a-f-A-C-H` |
| Military Helicopter | `a-f-A-M-H` |
| Drone/RPV | `a-f-A-C-Q` |
| Ground Vehicle (Emergency/Service) | `a-f-G-E-V-C` |

---

## Holding Pattern Detection (Ingest-05)

The ADS-B poller includes a stateful **Holding Pattern Detector** that tracks the heading history of every aircraft in the AOR. It identifies circular flight paths common in loitering, airspace stacking, or tactical surveillance.

### Detection Logic
- **Rolling Window**: Tracks heading changes over a `HOLDING_WINDOW_S` period (default: 5 min).
- **Cumulative Turn**: Accumulates the shortest-turn angle between consecutive updates (e.g., 350° → 10° is counted as 20°). 
- **Trigger**: An aircraft is flagged when its total turn angle exceeds the `HOLDING_PATTERN_THRESHOLD` (default: 300°).
- **Noise Filter**: Heading changes smaller than `HEADING_CHANGE_THRESHOLD` (default: 2°) are ignored to filter out GPS drift/noise.
- **Velocity Gate**: Detection only occurs when aircraft speed is above `MIN_VELOCITY_KNOTS`.

### Confidence Scoring (0.0–1.0)
The system calculates a "confidence" metric based on:
1.  **Revolutions**: High base confidence after 1.5 complete circles (540°).
2.  **Duration**: Bonus if the pattern lasts longer than `MIN_CIRCLE_DURATION` (default: 60s).
3.  **Consistency**: Bonus if the turn rate is stable (low variance in heading change intervals).

Detected holding patterns are published as a separate GeoJSON collection to the Redis key `holding_pattern:active_zones` and annotated in the individual aircraft telemetry.

---

## Duplicate Suppression (Arbitration)

Because multiple sources poll the same airspace, the **Arbitrator** de-duplicates updates by ICAO hex ID. An update is only published to Kafka if:

1. It is from a different source than the last update for that aircraft, **or**
2. Enough time has elapsed since the last published position, **or**
3. The position has moved significantly (preventing stale re-publishes).

Stale arbitration entries are evicted every `ARBITRATION_CLEANUP_INTERVAL` seconds (default 30s).

---

## Tactical Display

On the Tactical Map, aviation assets appear as **directional chevrons**:

- **Color** encodes altitude using a thermal gradient:
  - Green → Grounded / low (< 5,000 ft)
  - Yellow → Approach altitude (~10,000 ft)
  - Orange → Mid-altitude (~20,000 ft)
  - Red → High cruise (~30,000 ft)
  - Magenta → Very high altitude (> 40,000 ft)
- **Tactical Orange aura** highlights military aircraft, drones, and helicopters.
- **Pulsating ring** indicates active telemetry refresh.
- **Emergency squawk alerts** (7700, 7600, 7500) trigger cross-domain HUD notifications.

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
| :--- | :--- | :--- |
| No aircraft visible | AOR not configured / wrong lat/lon | Check `CENTER_LAT` / `CENTER_LON` in `.env` |
| Aircraft disappear after ~2 min | Stale TTL expiry (expected behavior) | Normal — aircraft re-appear when new position arrives |
| "All sources in cooldown" in logs | Sustained 429s from all three sources | Wait for backoff to expire; check your network/IP rate limit |
| H3 grid not seeding | Redis not reachable | Verify `sovereign-redis` container is healthy |

---

## Related

- [TAK Protocol Reference](../TAK_Protocol.md)
- [Configuration Reference](../Configuration.md)
- [API Reference — Tracks](../API_Reference.md#tracks)

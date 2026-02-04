# Task: Tier 1 ADS-B Ingestion Optimization (Software-Only)

**Status**: Planned
**Priority**: P1
**Owner**: Data Engineering Agent

## 1. Objective

Implement "Tier 1" software optimizations from the [Feeder Optimization Roadmap](../research/Sovereign_Watch_Feeder_Optional_Roadmap.md). The goal is to increase aviation data resilience and coverage by 300% (4x sources) without any capital expenditure/hardware, using a "Federated Poller" architecture.

## 2. Scope

- **target**: `backend/ingestion/aviation_ingest.yaml`
- **inputs**:
  - `airplanes.live` (Primary)
  - `adsb.fi` (Secondary)
  - `adsb.lol` (Tertiary)
- **logic**: Round-robin/Parallel polling with deduplication.

## 3. Implementation Plan

### 3.1 Multi-Source Input Configuration

Modify the Benthos `input` section to accept multiple HTTP polling sources.

- **Sources**:
  1.  **Airplanes.live**: `https://api.airplanes.live/v2/point/$LAT/$LON/$RADIUS`
  2.  **ADSB.fi**: `https://opendata.adsb.fi/api/v3/lat/$LAT/lon/$LON/dist/$RADIUS`
  3.  **ADSB.lol**: `https://api.adsb.lol/v2/point/$LAT/$LON/$RADIUS`

- **Strategy**: Use Benthos `broker` input with `pattern: fan_in` to pull from all sources simultaneously (or staggered).

### 3.2 Deduplication Layer

Since multiple sources track the same aircraft (same ICAOs), we will receive duplicate messages.

- **Mechanism**: Use Benthos `dedupe` processor.
- **Key**: `root = this.hex + "-" + this.now()` (or similar unique event ID vs time window).
- **TTL**: 1-2 seconds (we want fresh updates, but strictly redundant same-second updates should be dropped).

### 3.3 Normalization Standardization

Ensure all 3 APIs are mapped to the standard TAK Protobuf schema. Happily, most "fediverse" ADS-B aggregators use the same `readsb` JSON format, so the mapping logic should be nearly identical.

### 3.4 Rate Limiting & Ethics

- Implement `rate_limit` resource in Benthos to respect the "1 req/sec" etiquette for community APIs.

## 4. Verification

1.  **Throughput Check**: Monitor Redpanda topic `adsb_raw`. Expect higher message volume but consistent unique entity counts (deduped).
2.  **Failover Test**: Temporarily block one domain (e.g., via `hosts` file or docker network rule) and verify stream continuity.

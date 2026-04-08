# AIS Maritime Poller — User Guide

> **Container:** `sovereign-ais-poller`
> **Source Code:** `backend/ingestion/maritime_poller/`
> **Kafka Output Topic:** `ais_raw`

---

## Overview

The AIS poller ingests real-time maritime vessel positions from WebSocket feeds. By default it uses **AISStream.io** as the primary source. When `AISHUB_USERNAME` is configured, the poller can automatically fail over to **AISHub** after repeated connection failures and later restore the primary source when it recovers.

Vessel positions are normalized to the internal **TAK JSON format** and published to the Redpanda `ais_raw` topic for consumption by the backend API and TimescaleDB historian.

---

## Data Source

| Feed | URL | Auth Required |
| :--- | :--- | :--- |
| **AISStream.io** | `wss://stream.aisstream.io/v0/stream` | Yes — `AISSTREAM_API_KEY` |
| **AISHub** | `wss://data.aishub.net/ws.php` | Optional — `AISHUB_USERNAME` |

AISStream.io aggregates AIS signals from a global network of terrestrial receivers and satellites. A free API key is available at [aisstream.io](https://aisstream.io).

AISHub is a free, volunteer-operated global AIS network. When enabled, its vessel frames are normalized into the same internal AISStream-style message shape, so downstream TAK transformation and publishing stay identical regardless of source.

---

## How It Works

### Connection Model

The poller maintains a **persistent WebSocket connection** to the currently active source. At connection time it uses:

- **API Key** — your `AISSTREAM_API_KEY`
- **AISHub Username** — your `AISHUB_USERNAME` when AISHub is enabled
- **Bounding Box** — always set to a **350 nm radius** around the mission center (larger than your display radius to prevent frequent reconnects during local pan/zoom)
- **Message Types** subscribed: `PositionReport`, `ShipStaticData`, `StandardClassBPositionReport`, `StaticDataReport`

The poller then **client-side filters** incoming messages, dropping vessels outside your configured `COVERAGE_RADIUS_NM`.

### Primary / Fallback Behavior

- Default source order is `aisstream` first, then `aishub` if `AISHUB_USERNAME` is set.
- Set `AIS_PRIMARY_SOURCE=aishub` to invert that order.
- After **3 consecutive failed connection attempts**, the poller switches to the fallback source when one is configured.
- While running on fallback, it probes the preferred primary again every **5 minutes** and restores it automatically when healthy.
- The currently active source is published to Redis as `maritime:active_source` for external visibility.

### Message Types Handled

| AIS Message Type | Action |
| :--- | :--- |
| `PositionReport` (Class A) | Transform to TAK event → publish to `ais_raw` |
| `StandardClassBPositionReport` (Class B) | Transform to TAK event → publish to `ais_raw` |
| `ShipStaticData` | Cache vessel name, type, dimensions, destination |
| `StaticDataReport` | Cache vessel name and type (Class B supplement) |

### Static Data Cache

Because AIS separates position reports from vessel metadata, the poller maintains an **in-memory static data cache** keyed by MMSI. When a position update arrives, it is enriched with the cached name, ship type, dimensions, and destination before publishing.

- Cache entries expire after **30 minutes** of inactivity.
- If no cached data exists for an MMSI, the vessel name falls back to the MMSI number.

---

## Polling Rate

AIS does not use a fixed polling interval. The update frequency depends entirely on the vessel's AIS transponder class and navigational status:

| Vessel Type / Status | AIS Reporting Interval |
| :--- | :--- |
| Class A — Under way (> 14 kts) | Every **2 – 6 seconds** |
| Class A — Under way (< 14 kts) | Every **6 – 10 seconds** |
| Class A — At anchor / moored | Every **3 minutes** |
| Class B — Under way | Every **30 seconds** |
| Class B — Stationary | Every **3 minutes** |

---

## Reconnection & Backoff

The poller implements a robust reconnection strategy:

| Parameter | Value |
| :--- | :--- |
| Minimum reconnect interval | **30 seconds** (rate limit protection) |
| Initial backoff delay | 5 seconds |
| Backoff multiplier | 2× per failure |
| Maximum backoff delay | 300 seconds (5 minutes) |
| Backoff reset condition | Connection stable for ≥ 60 seconds |
| Bounding-box debounce | 5 seconds (prevents rapid reconnects during AOR changes) |
| Source switch threshold | 3 consecutive failed connection attempts |
| Primary reprobe interval | 300 seconds (5 minutes) while on fallback |

When the mission area is updated via the Settings HUD, the poller **debounces** the reconnect — rapid AOR changes collapse into a single reconnect after 5 seconds of stability.

---

## Configuration

| Variable | Default | Description |
| :--- | :--- | :--- |
| `AISSTREAM_API_KEY` | *(required for AISStream)* | Your AISStream.io API key |
| `AISHUB_USERNAME` | *(empty)* | Optional AISHub username that enables fallback or AISHub-first operation |
| `AIS_PRIMARY_SOURCE` | `aisstream` | Which source to try first: `aisstream` or `aishub` |
| `CENTER_LAT` | `45.5152` | AOR center latitude (degrees) |
| `CENTER_LON` | `-122.6784` | AOR center longitude (degrees) |
| `COVERAGE_RADIUS_NM` | `150` | Client-side vessel filter radius (nm) |
| `KAFKA_BROKERS` | `sovereign-redpanda:9092` | Redpanda bootstrap servers |
| `REDIS_HOST` | `sovereign-redis` | Redis hostname |

### Dynamic Mission Area

Like the ADS-B poller, the AIS poller subscribes to the Redis `navigation-updates` channel. A significant change (> 0.05° in either latitude or longitude) triggers a new connection for the currently preferred AIS source with the updated bounding box. Radius-only changes update the client-side filter without triggering a reconnect.

---

## Data Flow

```
AISStream.io WebSocket (wss://stream.aisstream.io)
    ↓  (push: PositionReport / ShipStaticData / ClassB)
MaritimePollerService.stream_loop()
    ↓  (client-side distance filter vs COVERAGE_RADIUS_NM)
transform_to_tak()  →  classify_vessel()
    ↓  (enriched with static cache: name, type, dimensions)
Redpanda: ais_raw topic  →  Backend API / TimescaleDB
```

---

## Vessel Classification

Each vessel is classified by the `classify_vessel()` function based on ITU-R M.1371 ship type codes:

| Category | Ship Type Codes | Notes |
| :--- | :--- | :--- |
| `cargo` | 70–79 | Cargo ships |
| `tanker` | 80–89 | Tankers |
| `passenger` | 60–69 | Passenger / Cruise ships |
| `military` | 35 | Naval vessels |
| `sar` | 51 | Search and Rescue |
| `law_enforcement` | 55 | Law Enforcement |
| `tug` | 52 | Tugboats |
| `pleasure` | 36–37 | Sailing / Pleasure craft |
| `fishing` | 30 | Fishing vessels |
| `unknown` | all others | Unclassified |

Hazardous cargo is flagged based on ship type codes 80–89.

### CoT Type

All maritime vessels use the CoT type `a-f-S-C-M` (Friendly — Surface — Contact — Maritime).

---

## Tactical Display

On the Tactical Map, maritime vessels appear as **directional chevrons** colored by speed:

- **Dark Blue** — Stationary / anchored (0 kts)
- **Medium Blue** — Harbor speed / patrolling (< 10 kts)
- **Light Blue** — Cruising (~15 kts)
- **Cyan/White** — High-speed transit (25+ kts)

**Tactical Orange aura** highlights high-value vessels: military, SAR, law enforcement.

**AIS-SART distress** signals (MMSI starting with `97x`) trigger cross-domain HUD emergency alerts.

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
| :--- | :--- | :--- |
| No vessels visible | Missing or invalid API key | Check `AISSTREAM_API_KEY` in `.env` |
| "Connection timed out" in logs | Active AIS source unreachable | Check internet connectivity and source credentials; backoff will retry automatically |
| Repeated source switching | Primary source is degraded or misconfigured | Check `AISSTREAM_API_KEY`, `AISHUB_USERNAME`, and `AIS_PRIMARY_SOURCE`; inspect `maritime:active_source` |
| Vessels appear without names | Static data not yet received | Normal — names populate when `ShipStaticData` message arrives |
| Vessel position jumps | Multiple MMSI updates in rapid succession | Expected from Class A vessels reporting frequently |
| Reconnecting rapidly in logs | AOR change debounce not clearing | Check Redis pub/sub connectivity |

---

## Related

- [TAK Protocol Reference](../TAK_Protocol.md)
- [Configuration Reference](../Configuration.md)
- [API Reference — Tracks](../API_Reference.md#tracks)

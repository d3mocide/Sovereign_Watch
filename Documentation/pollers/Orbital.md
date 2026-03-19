# Orbital Pulse — Satellite Tracking Guide

> **Container:** `sovereign-orbital-pulse`
> **Source Code:** `backend/ingestion/orbital_pulse/`
> **Kafka Output Topic:** `orbital_raw`

---

## Overview

Orbital Pulse tracks approximately **14,000 satellites** in real time using Two-Line Element (TLE) data from **Celestrak** and the **SGP4** orbital mechanics propagator. Unlike ADS-B or AIS (which receive live transponder signals), satellite positions are **mathematically derived** from publicly published orbital parameters.

TLE data is refreshed every 6 hours from Celestrak. Between refreshes, satellite positions are propagated (computed) every **5 seconds** and published to the `orbital_raw` Kafka topic.

---

## Data Source

| Source | URL | Auth Required |
| :--- | :--- | :--- |
| **Celestrak** | `celestrak.org/NORAD/elements/` | No |

Celestrak distributes NORAD-published TLE data for all tracked Earth-orbiting objects. Sovereign Watch fetches specific curated groups rather than the full active catalog to balance coverage with performance.

---

## Tracked Satellite Groups

| Celestrak Group | Sovereign Category | Named Constellation |
| :--- | :--- | :--- |
| `gps-ops` | `gps` | GPS |
| `glonass-ops` | `gps` | GLONASS |
| `galileo` | `gps` | Galileo |
| `beidou` | `gps` | BeiDou |
| `weather` | `weather` | — |
| `noaa` | `weather` | NOAA |
| `goes` | `weather` | GOES |
| `sarsat` | `sar` | SARSAT |
| `starlink` | `comms` | Starlink |
| `oneweb` | `comms` | OneWeb |
| `iridium-NEXT` | `comms` | Iridium |
| `amateur` | `comms` | — |
| `military` | `intel` | — |
| `cubesat` | `leo` | — |
| `radarsat` | `intel` | RADARSAT |
| `stations` | `leo` | — (ISS, Tiangong, etc.) |
| `visual` | `leo` | — (100 brightest objects) |
| `resource` | `weather` | — |
| `spire` | `intel` | Spire |
| `planet` | `intel` | Planet |

> **Note:** The general `active` Celestrak catalog (~9,000+ unclassified satellites) is intentionally excluded to maintain a focused, curated dataset.

---

## Polling Rates

| Operation | Interval |
| :--- | :--- |
| TLE data fetch from Celestrak | Every **6 hours** |
| Celestrak on-disk cache validity | **2 hours** (prevents redundant HTTP requests between cycles) |
| SGP4 position propagation | Every **5 seconds** |
| Kafka publish batch size | Up to 500 messages per batch |
| Celestrak per-group request delay | 1 second (rate limit courtesy) |

---

## How SGP4 Propagation Works

1. **Load TLEs** — At startup and every 6 hours, TLE text is fetched (or read from disk cache) for all 20 groups.
2. **Parse** — Each TLE triplet (name, Line 1, Line 2) is parsed by the `sgp4` Python library into a `Satrec` object.
3. **Vectorized propagation** — All satellites are propagated simultaneously using `SatrecArray.sgp4()` with NumPy arrays (eliminates per-satellite Python loops).
4. **Coordinate transforms** — TEME (True Equator Mean Equinox) positions are converted to ECEF (Earth-Centered Earth-Fixed) and then to geodetic LLA (Lat/Lon/Altitude).
5. **Course & speed** — Each satellite is propagated at `now` and `now - 1 second`; the bearing between those two points gives the ground track heading; velocity magnitude gives speed.
6. **Publish** — Each valid satellite position is published as a TAK JSON event to the `orbital_raw` Kafka topic.

---

## TAK Event Fields for Satellites

Each satellite publish includes:

| Field | Value |
| :--- | :--- |
| `uid` | `SAT-<NORAD_ID>` (e.g., `SAT-25544` for the ISS) |
| `type` | `a-s-K` (Assumed — Space — Space Vehicle) |
| `how` | `m-g` (machine / GPS-equivalent) |
| `point.hae` | Altitude above ellipsoid in **meters** |
| `detail.norad_id` | NORAD catalog number |
| `detail.category` | `gps`, `weather`, `comms`, `intel`, `leo`, `sar` |
| `detail.constellation` | Named constellation (e.g., `Starlink`) or `null` |
| `detail.period_min` | Orbital period in minutes |
| `detail.inclination_deg` | Orbital inclination in degrees |
| `detail.eccentricity` | Orbital eccentricity (0 = circular) |
| `detail.tle_line1` / `tle_line2` | Raw TLE strings (published to clients for re-propagation; **not** stored per track row — see Storage Architecture below) |

---

## Configuration

| Variable | Default | Description |
| :--- | :--- | :--- |
| `KAFKA_BROKERS` | `sovereign-redpanda:9092` | Redpanda bootstrap servers |
| `REDIS_HOST` | `sovereign-redis` | Redis hostname |

The fetch interval (6 hours) and propagation interval (5 seconds) are hardcoded constants in `service.py`. They can be adjusted by editing `self.fetch_interval_hours` and `self.propagate_interval_sec`.

---

## Data Flow

```
Celestrak (celestrak.org)
    ↓  (HTTPS, TLE text format, every 6 hours)
OrbitalPulseService.fetch_tle_data()
    ↓  (disk cache: /app/cache/*.txt, 2-hour validity)
parse_tle_data()  →  sgp4.Satrec objects  →  SatrecArray
    ↓  (every 5 seconds)
SatrecArray.sgp4(jd, fr)  →  TEME positions
    ↓
teme_to_ecef_vectorized()  →  ecef_to_lla_vectorized()
    ↓
compute_course()  →  TAK JSON events  (includes TLE for client re-propagation)
    ↓
Redpanda: orbital_raw topic
    ↓
Backend Historian
    └── satellites table  ←  TLE upsert only (norad_id, tle_line1/2, orbital params)
                              permanent lookup; positions NOT stored
```

Live satellite positions reach the frontend via the broadcast service
(WebSocket), which also consumes `orbital_raw` independently.

---

## Storage Architecture

Satellite data lives in a single table:

| Table | What it holds | Retention |
| :--- | :--- | :--- |
| `satellites` | TLE catalogue (norad_id, tle_line1/2, category, constellation, orbital params) | Permanent (upserted) |

**Positions are not stored.**  Orbital positions are 100% reproducible from the
current TLE via SGP4 at any historical timestamp.  Persisting ~2 000 rows/sec
(~10 000 satellites × every 5 seconds) consumed significant I/O with no
operational benefit:

- `/api/tracks/history/{SAT-*}` — propagates positions on-demand via SGP4.
- `/api/tracks/search` — computes current position per matched satellite via SGP4.
- `/api/orbital/groundtrack/{norad_id}` — already computed positions via SGP4.
- `/api/tracks/replay` — orbital data excluded; replay covers ADS-B and AIS only.

---

## Orbital Categories — Color Coding

On the Orbital Map, satellite tracks are color-coded by category:

| Category | Color | Includes |
| :--- | :--- | :--- |
| `gps` | Sky Blue | GPS, GLONASS, Galileo, BeiDou |
| `weather` | Amber | NOAA, GOES, weather, resource |
| `comms` | Emerald | Starlink, OneWeb, Iridium, amateur |
| `intel` | Rose/Red | Military, RADARSAT, Spire, Planet |
| `leo` / other | Gray | ISS, cubesats, visual objects |
| `sar` | Gray | SARSAT search-and-rescue |

---

## Pass Predictor

The API provides a **satellite pass prediction** endpoint (`GET /api/orbital/passes`) that calculates upcoming overhead passes for your observer location. See [API Reference — Orbital](../API_Reference.md#orbital) for full details.

Pass results include:
- **AOS** (Acquisition of Signal) time and azimuth
- **TCA** (Time of Closest Approach) and maximum elevation
- **LOS** (Loss of Signal) time and azimuth
- **Duration** in seconds
- 10-second point array for polar plot rendering

> **Note:** Pass prediction for the `comms` category (Starlink/OneWeb) requires specifying a specific `constellation` or `norad_ids` parameter due to the large fleet size.

---

## Ground Track Visualization

Clicking a satellite on the Orbital Map renders its **predicted ground track** for one full orbit (90 minutes by default) using `GET /api/orbital/groundtrack/{norad_id}`.

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
| :--- | :--- | :--- |
| No satellites visible | TLE fetch not yet completed | Wait ~60 seconds for initial load; check logs |
| Old satellite positions | Stale TLE data (> 6 hours old) | Check Celestrak connectivity; disk cache may serve stale data |
| Missing constellation | Group not in curated list | Only the 20 listed groups are fetched |
| `sgp4 error` for a satellite | Decayed / maneuver in progress TLE | Expected for some objects; those satellites are silently skipped |
| High CPU during propagation | Normal — ~14,000 SGP4 computations | Vectorized NumPy; typical cycle takes 1–3 seconds |

---

## Related

- [TAK Protocol Reference](../TAK_Protocol.md)
- [Configuration Reference](../Configuration.md)
- [API Reference — Orbital](../API_Reference.md#orbital)

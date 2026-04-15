# Space Pulse — Space Domain Intelligence Guide

> **Container:** `sovereign-space-pulse`
> **Source Code:** `backend/ingestion/space_pulse/`
> **Kafka Topics:** `orbital_raw`, `satnogs_transmitters`, `satnogs_observations`

---

## Overview

Space Pulse is a unified ingestion service for space domain awareness (SDA). It combines satellite tracking, spectrum verification, and space weather monitoring into a single high-performance microservice.

By orchestrating multiple asynchronous sources within a single container, SpacePulse reduces total system overhead while providing a multi-layered view of orbital activity.

---

## 1. Orbital Tracking (SGP4)

Tracks approximately **14,000 satellites** in real time using Two-Line Element (TLE) data from **Celestrak** and the **SGP4** orbital mechanics propagator.

- **TLE Refresh:** Daily at the configured UTC hour (`SPACE_TLE_FETCH_HOUR`, default `02:00 UTC`). If hour gating is disabled, refresh every 24 hours.
- **Propagation Rate:** Every 5 seconds.
- **Output:** `orbital_raw` Kafka topic.

### How it Works

1. **Load TLEs**: Fetches curated groups (GPS, Weather, Starlink, etc.) from Celestrak.
2. **Vectorized Propagation**: Uses NumPy and the `sgp4` library to compute positions for the entire catalog simultaneously.
3. **Coordinate Transforms**: Converts TEME coordinates to geodetic Lat/Lon/Alt.
4. **Publish**: Generates TAK-compatible JSON events for the real-time map.

---

## 2. Spectrum Verification (SatNOGS)

Integrates data from the **SatNOGS Network** and **Transmitter Database** to provide ground-truth verification of satellite transmissions.

- **Transmitter DB**: Periodic sync of the global SatNOGS transmitter catalogue.
- **Network Observations**: Real-time fetch of "good" observations from volunteer ground stations.
- **Logic**: Enables cross-referencing of observed signals against registered frequencies to detect anomalies or verify status.

| Topic | Data |
| :--- | :--- |
| `satnogs_transmitters` | Registered frequencies, modes, and statuses. |
| `satnogs_observations` | Verified signal receptions from global ground stations. |

---

## 3. Space Weather (NOAA)

Monitors the Earth's geomagnetic environment to provide context for potential signal degradation or orbital anomalies.

- **Aurora Forecast**: Fetches the 30-minute aurora probability from NOAA SWEPC.
- **Kp-Index**: Tracks the planetary K-index (magnetic storm intensity), updated every 15 minutes.
- **NOAA Scales**: Polls the current R (Radio Blackout), S (Solar Energetic Particle), and G (Geomagnetic Storm) event levels every 15 minutes.
- **Storage**: Direct writes to TimescaleDB for historical analysis + Redis for real-time HUD status.

### NOAA Scale Alert Suppression

When R-scale ≥ R3 (Strong Radio Blackout) **or** G-scale ≥ G3 (Strong Geomagnetic Storm), the poller sets a Redis suppression key:

```
space_weather:suppress_signal_loss  (TTL: 70 minutes)
```

The AI Router reads this key before running satellite signal-loss anomaly detection. If suppression is active, signal-loss alerts are suppressed to prevent false-positive jamming/interference reports caused by natural space weather conditions.

### Redis Keys

| Key | Contents | TTL |
| :--- | :--- | :--- |
| `space_weather:kp_current` | Latest Kp value + storm level | None (overwritten) |
| `space_weather:kp_history` | Last 24h of Kp readings | None (overwritten) |
| `space_weather:aurora_geojson` | Auroral oval GeoJSON (intensity ≥ 5%) | None (overwritten) |
| `space_weather:noaa_scales` | Current R/S/G scale levels from NOAA | None (overwritten) |
| `space_weather:suppress_signal_loss` | Active suppression payload (reason, scales, timestamps) | **70 minutes** |

### Poll Intervals

| Source | Default | Env Variable |
| :--- | :--- | :--- |
| Kp-index | 15 minutes | `KP_INTERVAL_S` |
| Aurora GeoJSON | 5 minutes | `AURORA_INTERVAL_S` |
| NOAA Scales (R/S/G) | 15 minutes | `SCALES_INTERVAL_S` |

---

## Tracked Satellite Groups

| Celestrak Group | Sovereign Category | Named Constellation |
| :--- | :--- | :--- |
| `gps-ops` | `gps` | GPS |
| `glonass-ops` | `gps` | GLONASS |
| `weather` | `weather` | — |
| `starlink` | `comms` | Starlink |
| `visual` | `leo` | — (100 brightest objects) |
| `stations` | `leo` | — (ISS, Tiangong, etc.) |

---

## Related Documents

- [TAK Protocol Reference](../TAK_Protocol.md)
- [Configuration Reference](../Configuration.md)
- [API Reference — Orbital](../API_Reference.md#orbital)

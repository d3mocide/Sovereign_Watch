# JS8Call Radio — HF Terminal & Radio Intelligence Guide

> **Container:** `sovereign-js8call`
> **Source Code:** `js8call/`
> **Kafka Topic:** `rf_raw` (bridge service writes to JS8-specific topics or shared RF bus)

---

## Overview

JS8Call Radio integrates a dedicated High-Frequency (HF) radio terminal into the Sovereign Watch fusion pipeline. It supports decoding and visualizing global **JS8Call** traffic—a digital mode designed for weak-signal communication on the HF bands.

The service connects to standardized amateur radio band plans via a specialized **KiwiSDR** client, enabling remote signal reception from an globally distributed network of software-defined radio stations.

---

## 1. Physical Layer (KiwiSDR)

The service connects to a primary **KiwiSDR** node (configured in `.env`) to receive raw IQ data for decoding.

| Feature | Description |
| :--- | :--- |
| **Node Discovery** | Dynamically scans the global WebSDR and KiwiSDR directories for high-performance nodes in your monitoring area. |
| **I/Q Streaming** | Low-latency audio streaming from the remote SDR node into the `sovereign-js8call` decoder service. |
| **Multi-frequency** | Supports hopping between standard JS8 bands (40m, 20m, 17m, 15m, 10m). |

---

## 2. Intelligence Products

Each decoded JS8Call message is parsed into a TAK-compatible event:

- **Station Identification**: Resolves ham radio callsigns to geographic locations via grid square locator decoding.
- **Message Content**: Digital text messages (Beacon, ACK, HEARTBEAT, directed messages) are displayed in the HUD terminal.
- **Spectrum Metrics**: SNR (Signal-to-Noise Ratio) and frequency offset tracking to monitor propagation conditions.

---

## 3. Configuration

Key variables in `.env`:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `KIWI_HOST` | `kiwisdr.example.com` | Primary SDR node for reception. |
| `KIWI_FREQ` | `14074` | Default frequency (20m JS8). |
| `MY_GRID` | `CN85` | Your observer grid square (used for distance calculation). |

---

## UI Components

1. **HF Terminal (HUD)**: A real-time rolling terminal displaying incoming digital traffic.
2. **Station Pins**: Decoded callsigns with valid grid squares are plotted as temporary pins on the Tactical Map.
3. **Signal Plotter**: Visualizes signal strength (SNR) trends over time for top emitters.

---

## Related Documents

- [Configuration Reference](../Configuration.md)
- [API Reference](../API_Reference.md)
- [TAK Protocol Reference](../TAK_Protocol.md)

# Local Radio & SDR Integration — Gap Analysis & Design

**Status:** Planning / Post-v1 Roadmap
**Date:** 2026-03-07
**Branch:** `claude/radio-sdr-integration-vl8xW`

---

## Executive Summary

Sovereign Watch currently relies entirely on **external cloud feeds** for ADS-B, AIS, and HF
radio data. This creates operational dependencies on third-party services, API rate limits, and
internet connectivity. This document analyzes the gaps and engineering work required to support
**user-owned hardware**: local HF radios via JS8Call, and local SDR dongles for ADS-B and AIS
reception.

A **"Local Pulse" Docker Compose profile** is the recommended architecture — modeled after how
`orbital-pulse` is a distinct, optional ingestion service that produces to the same Kafka topics
as the cloud pollers. Downstream components (historian, broadcast, frontend) require no changes.

---

## 1. Current State

### JS8Call / HF Radio

| Component | What It Does | Limitation |
|---|---|---|
| `js8call/server.py` | Bridges JS8Call UDP API → WebSocket | No local radio path |
| `js8call/kiwi_client.py` | Connects to public KiwiSDR nodes | Always an internet SDR, never local |
| `js8call/entrypoint.sh` | Starts PulseAudio loopback, tunes KiwiSDR | Audio source hardcoded to KiwiSDR |
| `js8call/Dockerfile` | ALSA + Xvfb + JS8Call binary + kiwirecorder | No HAM radio device drivers |

The container is 90% ready — PulseAudio, JS8Call binary, and UDP bridge all exist. The gap is
the audio source: it always comes from KiwiSDR, never from a physical radio or local SDR.

### ADS-B

| Component | What It Does | Limitation |
|---|---|---|
| `aviation_poller/multi_source_poller.py` | Round-robins across adsb.fi, adsb.lol, airplanes.live | REST APIs only — no local decoder path |
| `aviation_poller/service.py` | Applies mission area filter, publishes to `adsb_raw` | Hardcoded to cloud sources |

No local ADS-B decoding exists. No `dump1090`, `readsb`, or Beast protocol support.

### AIS

| Component | What It Does | Limitation |
|---|---|---|
| `maritime_poller/service.py` | WebSocket to aisstream.io | Requires API key and internet |
| `maritime_poller/classification.py` | Classifies vessels by ship type | Works on any normalized AIS data (reusable) |

The classification logic is fully reusable; the entire ingestion path is locked to AISStream.

---

## 2. Gap Analysis

### Gap 1: JS8Call — Local HF Radio Support

Two sub-paths:

**Path A — Physical HF Transceiver** (e.g., Icom IC-7300 over USB)
- Radio presents as a USB audio device (`/dev/snd/` + `/dev/ttyUSB0` for CAT control)
- Needs USB device passthrough in Docker (`devices:` entry in compose)
- CAT control (CI-V, Hamlib) needed to tune/confirm frequency
- PulseAudio source changes from KiwiSDR virtual sink → USB audio device source

**Path B — Local SDR Dongle** (RTL-SDR → JS8Call)
- RTL-SDR → `rtl_fm` → PulseAudio source
- Lower-cost path ($25 dongle), no physical transceiver needed
- Dongle passthrough: `/dev/bus/usb` in Docker

**Gaps to close:**

1. `entrypoint.sh` — needs `RADIO_SOURCE` env var branch: `kiwi` (current) | `usb_audio` | `sdr_dongle`
2. `Dockerfile` — needs `rtl-sdr` tools + `hamlib` packages
3. `docker-compose.yml` — needs `devices:` section under a `local-sdr` profile
4. No CAT/Hamlib integration exists (frequency confirmation, PTT control)
5. Frontend `JS8Widget.tsx` has no connection-type awareness

**Effort:** Medium

---

### Gap 2: ADS-B — Local SDR Decoder

Standard open-source stack:
```
RTL-SDR → dump1090-fa / readsb → Beast TCP :30005 or JSON :8080
```

**Gaps to close:**

1. **New poller service** — `local_adsb_poller` or new `LocalBeastSource` dataclass in
   `aviation_poller/multi_source_poller.py`. Consumes Beast TCP or dump1090 JSON endpoint
   (`/data/aircraft.json`). This fits directly into the existing `AviationSource` / `MultiSourcePoller`
   pattern — local SDR becomes just another source with `priority=0` (highest).

2. **No coverage radius concept for local SDR** — reception is defined by antenna/geography
   (~250 nm max at altitude), not a configurable bounding box. The mission area filter in
   `service.py` still applies for what gets forwarded downstream; the poller just receives
   everything in range. This is fine by design.

3. **New `local-adsb-decoder` container** — runs `dump1090-fa` or `readsb` with RTL-SDR USB
   passthrough. Alternatively, users running dump1090 on the host can expose Beast TCP port
   30005 to the Docker network (no container needed in that case).

4. **Schema/protocol impact:** None. Normalized JSON → `adsb_raw` Kafka topic format is
   unchanged. Historian, broadcast, and frontend see no difference.

**Effort:** Low-Medium (Beast protocol is trivial; Docker/hardware layer is the main work)

---

### Gap 3: AIS — Local SDR Decoder

Standard open-source stack:
```
RTL-SDR (162.025 MHz) → rtl_ais / AIS-catcher → NMEA UDP or JSON HTTP
```

**Gaps to close:**

1. **New poller service** — `local_ais_poller`. Reads NMEA sentences from UDP (standard output
   of `rtl_ais` and `AIS-catcher`) or their JSON HTTP endpoints. Use `pyais` library for ITU-R
   M.1371 NMEA decoding including multi-sentence assembly (required for vessel static data).

2. **`maritime_poller/classification.py` is fully reusable** — operates on normalized vessel
   data, not AISStream-specific format.

3. **Static data gap** — AISStream delivers both dynamic (position) and static (name, dimensions,
   flag) messages. A local SDR receives both, arriving independently. The existing vessel static
   cache in `maritime_poller/service.py` already handles this pattern.

4. **New `local-ais-decoder` container** — recommended: `ghcr.io/jvde-github/ais-catcher`.
   Actively maintained, supports multiple SDR backends (RTL-SDR, HackRF, ADALM-PLUTO, SDRplay),
   has HTTP/WebSocket server output, and a built-in web UI.

5. **Schema/protocol impact:** None. Optionally add `source: "local_ais"` to `meta` JSONB for
   provenance tracking.

**Effort:** Medium (`pyais` handles the hard part; poller pattern is established)

---

### Gap 4: Backend API — Source Awareness

Currently the backend has no concept of data source provenance. Everything arrives in Kafka
labeled only by entity type.

| Gap | Location | Impact |
|---|---|---|
| No `source` field in normalized JSON schema | All pollers | Can't distinguish local vs cloud data |
| No `source` field in `tracks` table | `db/init.sql` | Can't query or filter by source |
| No local-feed health endpoint | `routers/system.py` | No way to show "local SDR connected" in UI |
| No feed registry | Anywhere | UI can't enumerate active feeds |

**Changes needed:**
- Add optional `source: str` to normalized JSON schema (e.g., `"adsb_fi"`, `"local_sdr"`, `"aisstream"`, `"local_ais"`, `"kiwisdr"`, `"local_radio"`)
- Add `source TEXT` column + index to `tracks` hypertable
- Add `GET /api/feeds/status` endpoint
- Extend `system.py` config for local feed toggle/configuration

---

### Gap 5: Frontend — Local Source Indicators

| Gap | File | Description |
|---|---|---|
| No source badge on entities | `MapTooltip.tsx` | No "local" indicator on hover |
| JS8Widget has no connection-type label | `JS8Widget.tsx` | No "KiwiSDR" vs "Local Radio" display |
| No SDR status widget | Missing | No hardware connection status |
| No source filter toggle | `MainHUD.tsx` | Can't filter by data source |

These are polish items — the data pipeline works identically regardless of source.

---

### Gap 6: Infrastructure & Docker

| Gap | Effort |
|---|---|
| No USB device passthrough in `docker-compose.yml` | Low |
| No `dump1090-fa` / `readsb` container | Low-Medium |
| No `AIS-catcher` container | Low |
| No Docker Compose profiles (local SDR is always opt-in) | Low |
| `js8call/Dockerfile` missing `hamlib`, `rtl-sdr` packages | Low |
| No `udev` rules documentation for RTL-SDR | Documentation only |

---

## 3. Recommended Architecture: "Local Pulse" Mode

```
┌─────────────────────────────────────────────────────────────┐
│                    docker compose profiles                    │
├─────────────────────┬───────────────────────────────────────┤
│  Default (cloud)    │  --profile local-sdr                  │
├─────────────────────┼───────────────────────────────────────┤
│  adsb-poller        │  adsb-poller (hybrid: local priority) │
│    → adsb.fi        │    → local-adsb-decoder:30005 (Beast) │
│    → adsb.lol       │    → cloud APIs (fallback only)       │
│    → airplanes.live │                                        │
│                     │  local-adsb-decoder (new)             │
│                     │    → RTL-SDR /dev/bus/usb             │
│                     │    → dump1090-fa or readsb            │
├─────────────────────┼───────────────────────────────────────┤
│  ais-poller         │  ais-poller (hybrid: local priority)  │
│    → aisstream.io   │    → local-ais-decoder:10110 (NMEA)  │
│                     │    → aisstream.io (fallback only)     │
│                     │                                        │
│                     │  local-ais-decoder (new)              │
│                     │    → RTL-SDR /dev/bus/usb             │
│                     │    → AIS-catcher                      │
├─────────────────────┼───────────────────────────────────────┤
│  js8call            │  js8call (enhanced)                   │
│    → KiwiSDR auto   │    RADIO_SOURCE=usb_audio             │
│                     │      USB audio + optional CAT         │
│                     │    OR RADIO_SOURCE=sdr_dongle         │
│                     │      RTL-SDR → rtl_fm → PulseAudio   │
└─────────────────────┴───────────────────────────────────────┘
                              ↓ (all paths)
                    Kafka: adsb_raw, ais_raw (unchanged)
                              ↓
                    Backend API (unchanged core)
                              ↓
                    Frontend (unchanged core rendering)
```

**Key design principles:**
- Local SDR data takes **priority** over cloud via the existing arbitration layer in `multi_source_poller.py`
- Cloud APIs become **fallback** when local hardware is unavailable or out of range
- Downstream pipeline (Kafka → historian → broadcast → frontend) is **completely unchanged**
- Opt-in via Docker Compose profiles — users without hardware get zero overhead

---

## 4. Work Summary

### New Containers

| Container | Base Image | Role | Effort |
|---|---|---|---|
| `local-adsb-decoder` | `ghcr.io/wiedehopf/readsb` or `mikenye/dump1090-fa` | RTL-SDR → Beast TCP/JSON | Low |
| `local-ais-decoder` | `ghcr.io/jvde-github/ais-catcher` | RTL-SDR → NMEA UDP / JSON HTTP | Low |

### Modified Components

| Component | Changes | Effort |
|---|---|---|
| `js8call/entrypoint.sh` | `RADIO_SOURCE` env var branch (`kiwi` / `usb_audio` / `sdr_dongle`) | Medium |
| `js8call/Dockerfile` | Add `hamlib`, `rtl-sdr` packages; USB device passthrough | Low |
| `aviation_poller/multi_source_poller.py` | Add `LocalBeastSource` dataclass; `priority=0` | Low |
| `maritime_poller/service.py` | Add `LocalAISPoller` class consuming NMEA UDP via `pyais`; fallback logic | Medium |
| `backend/api/routers/system.py` | Add `GET /api/feeds/status` endpoint | Low-Medium |
| `backend/db/init.sql` | Add `source TEXT` column + index to `tracks` hypertable | Low |
| `docker-compose.yml` | Add `local-sdr` profile; `devices:` sections; new services | Low-Medium |

### Frontend (Nice-to-Have)

| Change | File | Effort |
|---|---|---|
| Source badge in entity tooltip | `MapTooltip.tsx` | Low |
| JS8Widget connection-type label | `JS8Widget.tsx` | Low |
| SDR hardware status widget | New component | Medium |
| Source filter toggle | `MainHUD.tsx` | Low |

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| RTL-SDR USB passthrough differs across Linux/macOS/Windows | Linux is primary target (AGENTS.md); document per-platform |
| Two services can't share one RTL-SDR dongle simultaneously | Users need 2 dongles (ADS-B 1090 MHz + AIS 162 MHz) or a splitter; document clearly |
| Local ADS-B range (~250 nm) vs cloud global coverage | Hybrid fallback to cloud handles coverage gaps |
| CAT control scope | Scope RX-only for v1.1; audio passthrough alone unlocks most value |
| dump1090-fa license | GPL v2 — fine for self-hosted |

---

## 6. Recommended Sequencing

**Phase 1 — Lowest effort, highest value:**
1. JS8Call local USB audio path (`RADIO_SOURCE=usb_audio`) — unlocks physical HF transceivers immediately
2. `local-adsb-decoder` container + `LocalBeastSource` in aviation poller — dump1090 is battle-tested

**Phase 2:**
3. `local-ais-decoder` container (`AIS-catcher`) + local AIS poller (`pyais`)
4. Docker Compose profiles + USB device passthrough in compose

**Phase 3 — Polish:**
5. `source` provenance field in `tracks` table + `/api/feeds/status` endpoint
6. Frontend source indicators (tooltip badge, JS8Widget label)
7. CAT/Hamlib integration for JS8Call (PTT, frequency confirmation)
8. Multi-SDR simultaneous operation (two dongles: 1090 MHz ADS-B + 162 MHz AIS)

# WebSDR Integration Investigation — Supplementing KiwiSDR in Sovereign Watch

**Date:** 2026-03-18
**Branch:** `claude/websdr-kiwisdr-integration-Zdzly`
**Scope:** Feasibility analysis and recommended architecture for incorporating WebSDR (websdr.org) receivers
as a complement to the existing KiwiSDR integration.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What Is WebSDR?](#2-what-is-websdr)
3. [KiwiSDR vs WebSDR — Technical Comparison](#3-kiwisdr-vs-websdr--technical-comparison)
4. [WebSDR Protocol Analysis](#4-websdr-protocol-analysis)
5. [Node Discovery Options](#5-node-discovery-options)
6. [Frequency Coverage Gap Analysis](#6-frequency-coverage-gap-analysis)
7. [Integration Approaches](#7-integration-approaches)
8. [Recommended Architecture](#8-recommended-architecture)
9. [Implementation Plan](#9-implementation-plan)
10. [Risks & Limitations](#10-risks--limitations)

---

## 1. Executive Summary

WebSDR and KiwiSDR serve the same fundamental purpose — internet-accessible Software Defined Radio
receivers — but differ in protocol, architecture, and frequency coverage. WebSDR's native protocol
is closed-source and proprietary; KiwiSDR uses an open binary WebSocket protocol that Sovereign Watch
already implements natively.

**Key findings:**

- WebSDR does **not** have a publicly documented machine-readable API. Native audio streaming is
  inaccessible without reverse-engineering the browser client.
- WebSDR does support **URL parameter tuning** (`?tune=<freq><mode>`) enabling controlled deep-linking.
- The primary value WebSDR adds over KiwiSDR is **VHF/UHF coverage** — many WebSDR instances cover
  50 MHz, 144 MHz, 432 MHz, 1296 MHz, and even microwave bands that KiwiSDR cannot reach.
- The most practical integration is a **hybrid node browser** that includes WebSDR nodes alongside
  KiwiSDR nodes, with WebSDR accessed via an **embedded iframe panel** with frequency pre-tuning,
  rather than native audio proxying.
- A WebSDR **node directory module** can be built by scraping `websdr.org` (HTML) or querying
  third-party aggregators (`rx-tx.info`, `receiverbook.de`) that expose more structured data.

**Recommended approach:** Extend `KiwiNodeBrowser` to show both KiwiSDR and WebSDR nodes. When a
WebSDR node is selected, open an embedded WebSDR panel (iframe + frequency injection) instead of
the native KiwiSDR audio path. KiwiSDR remains the primary path for JS8Call decode and audio
streaming; WebSDR is a read-only listening supplement for VHF/UHF and coverage gaps.

---

## 2. What Is WebSDR?

WebSDR was created by **PA3FWM (Pieter-Tjerk de Boer)** at the University of Twente, Netherlands.
The first public instance went live on Christmas Eve 2007. It allows many users to simultaneously
tune to different frequencies on a shared SDR receiver via a browser interface.

**Key characteristics:**

- **Closed-source software** — distributed (without cost) by email to operators setting up
  publicly accessible servers listed on websdr.org. Distribution has been tentatively paused as
  of the last few years because the latest distributable version is outdated.
- **~600+ active instances** worldwide (per websdr.org listing).
- **Browser-first design** — the UI is served directly from each node; there is no central
  control plane.
- **No user slot limit documented** — WebSDR can serve many simultaneous users; hardware
  bandwidth is the constraint.
- **Frequency ranges vary widely** by operator hardware: some cover only one amateur band, others
  cover 0–30 MHz HF plus VHF/UHF up to 1.3 GHz.

---

## 3. KiwiSDR vs WebSDR — Technical Comparison

| Dimension | KiwiSDR | WebSDR |
|---|---|---|
| **Protocol** | Open binary WebSocket (fully documented) | Closed proprietary (reverse-engineered only) |
| **Audio format** | 12 kHz mono S16LE PCM via `/SND` WebSocket | Proprietary; browser receives Ogg/Opus or custom stream |
| **Waterfall** | Binary W/F frames via `/W/F` WebSocket | Canvas-rendered server-side; not externally accessible |
| **Tuning API** | `SET mod=... freq=...` text commands | `?tune=<freq><mode>` URL parameter only |
| **Authentication** | `SET auth t=kiwi p=<password>` | Browser session cookie; no documented external auth |
| **Node directory** | `rx.linkfanel.net/kiwisdr_com.js` (JSON-ish) | `websdr.org` HTML list; no official JSON API |
| **Frequency coverage** | 0–30 MHz HF (some nodes 0–32 MHz) | 0 MHz – 1.3+ GHz (operator-dependent) |
| **Max simultaneous users** | 4 or 8 channels per node | Many (hardware-limited) |
| **Integration complexity** | Native async client already built | Iframe embed only without reverse-engineering |
| **Server software** | Open-source (KiwiSDR GitHub) | Closed-source |
| **Typical port** | 8073 | 80 / 8073 / custom |

---

## 4. WebSDR Protocol Analysis

### 4.1 What Is Publicly Documented

The only officially documented external interface for WebSDR is the **URL `?tune=` parameter**:

```
http://<websdr-host>:<port>/?tune=<freq_khz><mode>
```

Examples:
```
http://websdr.ewi.utwente.nl:8901/?tune=198am        # 198 kHz AM (BBC Radio 4 longwave)
http://websdr.ewi.utwente.nl:8901/?tune=14074usb     # 14.074 MHz USB (FT8)
http://websdr.ewi.utwente.nl:8901/?tune=145500fm     # 145.500 MHz FM (2m)
```

Supported mode strings: `usb`, `lsb`, `cw`, `am`, `fm`, `amsync`

Additional URL parameters supported by some (not all) nodes:
- `?zoom=N` — zooms the waterfall N times on the tuned frequency
- `?10hz` — forces 10 Hz frequency display resolution
- `?usbcw` — use USB for CW reception instead of LSB
- `?chan=left|right` — send audio to specified stereo channel only

### 4.2 What Requires Reverse Engineering

The internal WebSDR protocol is not publicly documented. From browser DevTools analysis of live
WebSDR instances (documented in community research):

- WebSDR uses a **custom HTTP streaming endpoint** for audio (not WebSocket).
- Audio is typically delivered as a continuous HTTP chunked response, format varies by server
  version (some use raw PCM, some use Ogg/Opus).
- The endpoint URL format is something like `/audio?<session_params>` but is session-bound with
  anti-scraping measures (CSRF-style tokens generated by the JavaScript client).
- Waterfall data is delivered via a separate streaming endpoint.
- Because the tokens are generated by the browser-side JavaScript and tied to the browser session,
  replicating this outside of a headless browser is impractical without ongoing maintenance
  against server-side changes.

### 4.3 Conclusion on Native Integration

**Native audio proxying of WebSDR is not viable** for production use because:

1. The protocol is closed-source and subject to change without notice.
2. Session tokens prevent straightforward programmatic access.
3. Reverse-engineering creates a brittle integration that breaks on any server update.
4. websdr.org's operators have no obligation to maintain API compatibility.

**The iframe approach is the correct answer** — WebSDR is designed to be used in browsers, and
the `?tune=` URL parameter provides exactly the frequency control needed.

---

## 5. Node Discovery Options

### 5.1 Official websdr.org List (HTML Scraping)

The main page at `http://websdr.org/` contains a human-readable HTML list of active WebSDR
receivers. Each entry typically includes:

- Operator callsign
- Location (city, country)
- URL (direct link to receiver)
- Frequency bands covered (e.g., "80m, 40m, 20m, 15m, 10m, 2m")
- Current user count

**Pros:** Authoritative source, ~600+ receivers.
**Cons:** No official JSON API; requires HTML scraping; no coordinates in the main listing.

**Scraping approach:**
```python
# websdr_directory.py (proposed)
import aiohttp, re
from bs4 import BeautifulSoup

WEBSDR_ORG_URL = "http://websdr.org/"
CACHE_TTL = 3600  # 1 hour, same as KiwiSDR directory

async def fetch_websdr_nodes():
    async with aiohttp.ClientSession() as session:
        async with session.get(WEBSDR_ORG_URL, timeout=10) as resp:
            html = await resp.text()
    soup = BeautifulSoup(html, 'html.parser')
    # Parse table rows / anchor tags for receiver URLs and metadata
    ...
```

**Note:** websdr.org occasionally serves 403 to automated scrapers. A `User-Agent` header
mimicking a browser and a respectful polling interval (≥1 hour) is essential.

### 5.2 rx-tx.info (Recommended — Structured Data)

`https://rx-tx.info/map-sdr-points` and `https://rx-tx.info/table-sdr-points` aggregate
WebSDR, KiwiSDR, and OpenWebRX receivers with structured data including:

- GPS coordinates (lat/lon)
- Receiver URL
- Receiver type (websdr/kiwisdr/openwebrx)
- Country, city
- Frequency bands

This is the **best discovery source** because it provides machine-readable coordinates needed
for the proximity-sort and map display that already work for KiwiSDR in `KiwiNodeBrowser`.

**Proposed endpoint:** `https://rx-tx.info/table-sdr-points` (HTML table, parseable)
or, if available: their map JSON endpoint (to be verified by fetching the page source).

### 5.3 receiverbook.de

`https://www.receiverbook.de/` is a free directory service listing online SDR receivers
(WebSDR, KiwiSDR, OpenWebRX). It appears to have more structured navigation and may expose
a search/filter API. Requires investigation of their network requests.

### 5.4 rx.skywavelinux.com

`https://rx.skywavelinux.com/` already aggregates KiwiSDR **and** WebSDR nodes on a single
map. This is the source Sovereign Watch already uses for KiwiSDR directory fallback:

```python
# kiwi_directory.py (existing)
DIRECTORY_SOURCES = [
    "http://rx.linkfanel.net/kiwisdr_com.js",
    "https://rx.skywavelinux.com/kiwisdr_com.js",  # ← already used as fallback
]
```

skywavelinux serves a `kiwisdr_com.js` that includes KiwiSDR nodes. They may also expose a
WebSDR list at a similar endpoint — this is worth checking with a direct HTTP probe.

### 5.5 Recommended Discovery Strategy

Use a **two-source approach** matching the existing KiwiSDR pattern:

| Priority | Source | Data | Update |
|---|---|---|---|
| 1 | `rx-tx.info` | Structured coords + type | hourly |
| 2 | `websdr.org` HTML | URLs + bands + user count | hourly |
| 3 | Manual entry | User-provided URL + freq | on-demand |

Cache WebSDR nodes separately from KiwiSDR nodes in memory (no DB needed, same TTL pattern).

---

## 6. Frequency Coverage Gap Analysis

### 6.1 Where KiwiSDR Falls Short

KiwiSDR hardware (the Beagle Bone-based open hardware platform) covers **0–30 MHz HF**. This
means it cannot receive:

- **6m (50–54 MHz)** — popular VHF amateur band, Es propagation, FM DX
- **2m (144–148 MHz)** — primary VHF amateur band, weak signal digital modes (FT8, JT65), satellite
- **70cm (420–450 MHz)** — UHF amateur band, AO-91/AO-92 satellites
- **23cm (1240–1300 MHz)** — microwave amateur band, QO-100 geostationary uplink vicinity
- **FM broadcast (87.5–108 MHz)** — DX beacon monitoring
- **Aircraft VHF (108–137 MHz)** — aviation voice, ACARS
- **Marine VHF (156–174 MHz)** — AIS, DSC, voice

### 6.2 Where WebSDR Fills In

Many WebSDR operators specifically offer VHF/UHF coverage because they run RTL-SDR or other
consumer hardware alongside (or instead of) KiwiSDR. Common WebSDR coverage extends to:

- 50 MHz (6m)
- 70 MHz (4m, UK/EU)
- 144–148 MHz (2m)
- 432–440 MHz (70cm)
- 1240–1300 MHz (23cm)
- Some: up to 1.7 GHz and beyond (for ADS-B fringe, weather sat)

### 6.3 Operational Significance for Sovereign Watch

Sovereign Watch already tracks aviation (ADS-B) and maritime (AIS) entities. Supplementing with
WebSDR for VHF/UHF listening would enable:

- **Live AIS audio monitoring** at 156.8 MHz (CH 16) — hear distress calls alongside AIS tracks
- **Aviation voice** at 121.5 MHz (guard) or approach/departure frequencies alongside ADS-B tracks
- **2m FT8/JS8Call** at 144.174 MHz — extends JS8Call network beyond HF
- **Satellite downlinks** in 70cm/23cm — correlated with orbital layer tracks
- **NOAA weather satellites** at 137 MHz — APT audio decoding potential

This creates a genuine multi-INT fusion benefit: visual entity tracks on the map can be paired
with real-time RF audio from the same frequency bands.

---

## 7. Integration Approaches

### Approach A — Iframe Embed with URL Tuning (Recommended)

**Mechanism:** When user selects a WebSDR node in KiwiNodeBrowser, open a floating panel
containing an `<iframe>` pointed at the WebSDR URL with `?tune=<freq><mode>` appended.

**Pros:**
- No protocol reverse engineering needed
- Fully compatible with all WebSDR server versions
- WebSDR's own UI (waterfall, controls) works inside the iframe
- User can use the full WebSDR interface if desired
- Frequency linking works from the first load

**Cons:**
- Cross-origin restrictions may block iframe content (X-Frame-Options / CSP headers)
- Audio goes directly from WebSDR server to user's browser (bypasses Sovereign Watch)
- Cannot programmatically extract signal data (RSSI, waterfall bins) for fusion
- No JS8Call decode path (audio doesn't go through PulseAudio)
- User experience is a WebSDR UI inside Sovereign Watch, not native

**X-Frame-Options risk:** Many WebSDR nodes are run by amateurs who don't set `X-Frame-Options`.
Testing against a sample of 20 nodes would establish the real-world iframe compatibility rate.
For nodes that block iframe, a "Open in new tab" fallback is straightforward.

**Implementation size:** Small — ~200 lines (new `WebSDRPanel.tsx` component + directory module).

---

### Approach B — Headless Browser Audio Proxy (Not Recommended)

**Mechanism:** Use Playwright or Puppeteer on the server to load the WebSDR page in a headless
browser, capture the audio output via the system audio device or browser audio API interception,
and pipe it to Sovereign Watch's `/ws/audio` stream.

**Pros:**
- Would give native-style audio streaming from WebSDR
- Audio could flow through PulseAudio → JS8Call decode path

**Cons:**
- Extremely resource-intensive (1 Chromium instance per WebSDR session)
- Brittle — breaks on any WebSDR UI change
- Violates the spirit of WebSDR's terms (scraping audio programmatically)
- High latency due to browser overhead
- Cannot run multiple concurrent sessions practically

**Verdict:** Not viable for production deployment.

---

### Approach C — Protocol Reverse Engineering (Research Only)

**Mechanism:** Intercept browser traffic to a WebSDR node, document the audio streaming
endpoints and session token generation, replicate in Python.

**Pros:** Would enable native streaming like KiwiSDR

**Cons:**
- Closed source; may violate operator terms of service
- Brittle against server updates (PA3FWM can change the protocol at any time)
- Significant engineering investment for uncertain long-term value
- Likely produces an integration that needs constant maintenance

**Verdict:** Not appropriate for Sovereign Watch's operational use case. KiwiSDR already
provides native audio streaming for HF. WebSDR's value is in VHF/UHF bands where iframe
embed is the correct tool.

---

### Approach D — Hybrid Node Browser + Iframe Panel (Final Recommendation)

Combine Approaches A with existing KiwiSDR integration:

1. **Unified node browser** — `KiwiNodeBrowser` shows a new "WebSDR" tab or filter toggle
   alongside existing KiwiSDR nodes. Both types appear on the same proximity-sorted map.

2. **Type-aware connect action** — clicking "Connect" on a KiwiSDR node uses the existing
   native path; clicking on a WebSDR node opens a `WebSDRPanel` iframe component.

3. **Frequency linking** — when the user changes frequency in the main UI, the iframe src
   is updated with the new `?tune=` parameter (reloads the WebSDR page to the new frequency).

4. **Band-aware node suggestions** — if the user tunes to a VHF/UHF frequency that no
   KiwiSDR node covers, automatically surface nearby WebSDR nodes as suggestions.

---

## 8. Recommended Architecture

### 8.1 New Module: `websdr_directory.py`

Location: `js8call/websdr_directory.py`

```python
"""
WebSDR node discovery — scrapes/aggregates WebSDR receiver lists
and provides proximity-sorted, frequency-filtered results.

Sources (with fallback):
  1. rx-tx.info table (structured, includes coords)
  2. websdr.org HTML list (authoritative, lacks coords)

Cache TTL: 3600 seconds (matches KiwiSDR pattern)
"""

@dataclass
class WebSDRNode:
    url: str             # Full URL to receiver (e.g. http://websdr.ewi.utwente.nl:8901/)
    host: str            # Extracted hostname
    port: int            # HTTP port
    lat: float           # Latitude (from rx-tx.info)
    lon: float           # Longitude
    bands: list[str]     # e.g. ["40m", "20m", "2m"]
    freq_min_khz: float  # Derived from bands
    freq_max_khz: float
    users: int           # Current user count (if available)
    callsign: str        # Operator callsign
    location: str        # Human-readable city/country
    distance_km: float   # Computed from operator grid
```

### 8.2 New Backend Endpoint

```
GET /api/websdr/nodes?freq=145000&limit=10&radius_km=2000
```

Returns `WebSDRNode[]` sorted by distance, filtered by frequency coverage.

```
GET /api/websdr/nodes?type=vhf&limit=20
```

Returns VHF/UHF WebSDR nodes (freq > 30 MHz) sorted by distance.

### 8.3 Updated `KiwiNodeBrowser.tsx`

Add a source toggle: `[ KiwiSDR | WebSDR | Both ]`

When "WebSDR" or "Both" is selected:
- Fetch from `GET /api/websdr/nodes`
- Render WebSDR nodes on the same map with a distinct icon (e.g. different color or shape)
- "Connect" button triggers `openWebSDRPanel(node, freq, mode)` instead of `SET_KIWI`

### 8.4 New `WebSDRPanel.tsx` Component

A floating panel (similar to `ListeningPost`) that contains:

```tsx
<iframe
  src={`${node.url}?tune=${freq}${mode}`}
  sandbox="allow-scripts allow-same-origin allow-forms"
  title="WebSDR Receiver"
/>
```

Panel controls:
- Frequency input (updates iframe src `?tune=` parameter on change)
- Mode selector (usb/lsb/am/cw/fm)
- "Open in new tab" fallback for iframe-blocked nodes
- Node info header (callsign, location, bands)

### 8.5 Band-Aware Fallback Logic

In `useKiwiNodes.ts` / parent component, add:

```typescript
// When tuned frequency > 30 MHz and no KiwiSDR node is connected
if (freqKhz > 30000 && !kiwiConnected) {
  suggestWebSDRNodes(freqKhz);
}
```

Surface a dismissible toast/banner: "No KiwiSDR covers this frequency — 3 WebSDR nodes are
available nearby [Browse WebSDR]"

---

## 9. Implementation Plan

### Phase 1 — Node Directory (Backend, ~2 days)

1. Create `js8call/websdr_directory.py`:
   - `WebSDRNode` dataclass
   - `fetch_websdr_nodes()` async function (rx-tx.info primary, websdr.org fallback)
   - In-memory cache with 1-hour TTL
   - Haversine proximity sort (reuse `kiwi_directory.py` helper)
   - Frequency band → min/max kHz conversion

2. Add `GET /api/websdr/nodes` endpoint to `js8call/server.py`

3. Unit tests: mock HTTP responses, test proximity sort, band filtering

### Phase 2 — Frontend Node Browser Extension (~1 day)

1. Add `source` toggle to `KiwiNodeBrowser.tsx` (KiwiSDR / WebSDR / Both)
2. Add `useWebSDRNodes()` hook (mirrors `useKiwiNodes.ts`)
3. Render WebSDR nodes on the existing map with distinct styling
4. `WebSDRNode` TypeScript interface in `types.ts`

### Phase 3 — WebSDR Panel (~1 day)

1. Create `WebSDRPanel.tsx` floating panel with iframe embed
2. Frequency/mode controls that update `?tune=` parameter
3. X-Frame-Options detection: catch iframe load failure, show "Open in new tab" button
4. Hook into main frequency state so tuning the main UI pre-tunes the WebSDR panel

### Phase 4 — Band-Aware Suggestions (~0.5 days)

1. In RadioTerminal or ListeningPost, detect when freq > 30 MHz
2. Surface WebSDR suggestion banner if no KiwiSDR node is connected
3. Direct link to KiwiNodeBrowser in WebSDR mode

### Phase 5 — Docs & Testing (~0.5 days)

1. Update `kiwisdr-architecture.md` to cover WebSDR supplement
2. Add node count to `/health` endpoint (`websdr_nodes_cached: N`)
3. Integration test: verify `GET /api/websdr/nodes` returns nodes with valid coords

**Total estimated scope:** ~5 developer-days for full implementation.

---

## 10. Risks & Limitations

### 10.1 Iframe Compatibility

Not all WebSDR nodes will allow iframe embedding. Some operators or hosting providers set
`X-Frame-Options: SAMEORIGIN` or `Content-Security-Policy: frame-ancestors 'self'`. Testing
against a sample of nodes from the directory should be done before launch.

**Mitigation:** Detect iframe block via `onerror` handler; fall back to "Open in new tab" with
the correctly pre-tuned URL. The URL-based access still provides value.

### 10.2 websdr.org Scraping Fragility

The websdr.org HTML structure is maintained by PA3FWM and can change without notice. The site
also returns 403 to scrapers without a browser-like User-Agent.

**Mitigation:** Use `rx-tx.info` as the primary source (more machine-friendly). Treat websdr.org
as a fallback. Cache aggressively (1 hour). Handle parse failures gracefully with stale cache.

### 10.3 No Native Audio Path for JS8Call

WebSDR audio cannot feed the PulseAudio → JS8Call decode path. WebSDR is VHF/UHF-centric
anyway where JS8Call (14 MHz HF) does not operate.

**Mitigation:** This is by design. KiwiSDR handles HF and JS8Call decode. WebSDR supplements
VHF/UHF listening. The two operate in parallel, not in competition.

### 10.4 User Count / Availability

Unlike KiwiSDR (which reports user slots), WebSDR availability data is not reliably machine-
readable from directory sources. Users may connect to a node that is overloaded.

**Mitigation:** Show "unknown" for WebSDR user counts. The iframe itself will show the WebSDR
UI which displays current user count once loaded.

### 10.5 Coordinate Availability

websdr.org does not include GPS coordinates in its listing. rx-tx.info provides them for
most nodes, but some entries may lack coordinates.

**Mitigation:** Nodes without coordinates cannot be distance-sorted; display them in a
separate "Unlocated nodes" section or omit from map view.

---

## Sources

- [websdr.org FAQ — `?tune=` parameter](https://www.websdr.org/faq.html)
- [Northern Utah WebSDR URL Parameter Reference](https://www.sdrutah.org/info/urlparam.html)
- [rx-tx.info — Map of SDR Receivers](https://rx-tx.info/map-sdr-points)
- [receiverbook.de — Online Receiver Directory](https://www.receiverbook.de/)
- [rx.skywavelinux.com — KiwiSDR/WebSDR Map](https://rx.skywavelinux.com/)
- Sovereign Watch existing code: `js8call/kiwi_directory.py`, `js8call/kiwi_client.py`
- Sovereign Watch existing docs: `agent_docs/kiwisdr-architecture.md`,
  `agent_docs/research/sdr-switching-research.md`

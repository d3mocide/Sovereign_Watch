# Release - v0.61.0 - Intelligence Fusion & Pipeline Hardening

## High-Level Summary

v0.61.0 is a broad operational hardening and intelligence-quality release. It closes the gap between "data arriving in Kafka" and "data visible in the HUD" across the clausalizer, GDELT, replay, and SatNOGS pipelines, while simultaneously tightening security posture, fixing silent failure modes in the AI router, and polishing the operator UX across the map, stats dashboard, and replay controls.

Forty-three agent tasks were completed in a single session.

---

## What's New

### Clausalizer Pipeline Visibility
The clausalizer now has end-to-end operational observability:
- **System Health widget** surfaces a `CLAUSALIZER FLOW` monitoring bar inline — freshness state (`HEALTHY` / `STALE` / `ERROR`) and `Rows/5m` activity without leaving the HUD.
- **Stats dashboard** gains a dedicated Clausalizer tab with KPI cards, source-split timeline, and a recent clause sample list.
- **Persistence gap closed** — the clause emitter now writes every state-change directly to `clausal_chains` in TimescaleDB rather than Kafka-only.

### Regional Risk Analysis — Fully Wired
Right-clicking the map and selecting "Analyze Regional Risk" now works end-to-end:
- Calls `/api/ai_router/evaluate` with H3 cell + coordinates.
- Shows an overlay panel with loading spinner, risk %, anomaly count, narrative, and top-3 escalation indicators.
- Panel anchors dynamically relative to the entity sidebar (no more floating widget).
- 15-second client-side abort timeout prevents indefinite pending UX.

### Replay — Bias Fix + Better Controls
- **Window bias fixed**: the underlying query now distributes rows evenly across all time buckets rather than greedily favouring the newest interval.
- **Widget refresh**: wider layout (640 px), less cramped controls, and a new density strip showing track count, point count, and a `⚠ SAMPLED` warning when the 10 K row cap was hit.

### GDELT Map Quality
- Labels now read `VERBAL COOP / MATERIAL COOP / VERBAL CONFLICT / MATERIAL CONFLICT` instead of raw domains.
- Spatial deconfliction (0.35° buckets, max 2 labels, priority-sorted, stacked offsets, `+N` overflow) prevents illegible overlaps in dense regions.
- Orbital view no longer renders GDELT (no toggle existed, layer was pure noise there).

### AI Analyst Improvements
- Three genuinely distinct analysis modes: **tactical** (classification/risk), **OSINT** (source context/actor intent), **SAR** (distress indicators/operational actions).
- Prompts now include domain classification and compact telemetry summaries; `INSUFFICIENT DATA` is enforced when evidence is thin.
- 8-second LLM timeout with heuristic fallback prevents silent regional risk hangs.

---

## Fixes

| Area | Issue Fixed |
|---|---|
| Track stream | ADS-B full reset on reconnect (15-min disconnect grace period) |
| Track stream | Auth recovery via `sessionStorage` fallback + indefinite reconnect backoff |
| AI router | `asyncpg` interval binding crash in regional risk / clausal chain queries |
| AI router | Regional risk silent hang when LLM endpoint is slow |
| Clausal chains | `POST` method + broken `%s` placeholders + H3 spatial filter missing |
| Frontend | `h3-js` named import crash (blank screen) |
| Frontend | Docker `node_modules` volume — `Cannot find module vite` at runtime |
| Frontend | `pnpm-lock.yaml` frozen-build failure after `h3-js` addition |
| TAK clausalizer | Missing `uv.lock` blocking Docker build |
| TAK clausalizer | `ModuleNotFoundError: aiokafka` at container start |
| SatNOGS | All stations showing as offline (normalisation + online-first fetch) |
| SatNOGS | No hover tooltip on ground stations |

---

## Security

- `/api/stats/*` fully restricted to `admin` role at the router level.
- `/api/analyze/{uid}` restricted to `operator` (prevents viewer-role LLM cost escalation).
- `/api/config/ai` restricted to `admin` (prevents unauthorised model switching).
- JS8 TX, KiwiSDR tuning, and AI Analyst `Run` button all gated to `operator` in the HUD.

---

## Upgrade Instructions

1. Pull the latest repository changes.
2. Rebuild all services: `docker compose up -d --build`
3. The clausalizer will now persist directly to TimescaleDB — no migration required; table already exists.
4. If the frontend container fails to start, run: `docker compose down sovereign-frontend && docker compose up -d sovereign-frontend` to recreate the node_modules volume.


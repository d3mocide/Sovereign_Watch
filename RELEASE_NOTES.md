# Release — v1.0.7 — Security Hardening & Intelligence Accuracy

**Released:** 2026-04-18  
**Type:** Patch  
**Previous:** v1.0.6

---

## Summary

v1.0.7 ships a high-priority security patch alongside a set of runtime stability fixes and a significant accuracy improvement to the Active Conflict Zone intelligence engine. Operators on HTTPS deployments will also see mixed-content WebSocket and WebSDR iframe errors resolved.

---

## Key Changes

### 🛡️ Security

- **SSRF Fix — News Article Reader** *(HIGH)*  
  The `/api/news/article` reader endpoint now blocks requests to private/loopback addresses (`127.0.0.1`, `192.168.x.x`, `169.254.x.x`, etc.) and non-HTTP schemes before making any outbound connection. This closes a Server-Side Request Forgery vector that could have allowed authenticated operators to probe internal services.

---

### 🎯 Active Conflict Zone Accuracy

The ACTIVE CONFLICT ZONES panel previously showed `[0]` almost always, even with active warzones (Ukraine, Israel, Sudan) appearing in the actor feed. Root cause: the old Goldstein thresholds were calibrated against an idealised model rather than real GDELT data distributions.

**What changed:**
- CRITICAL threshold: `≤ −6.0` → **`≤ −4.5`** (Ukraine/Gaza cluster at −3 to −5)
- ELEVATED threshold: `≤ −3.0` → **`≤ −2.0`**
- New **material-conflict volume shortcut**: actors with >150 kinetic events → CRITICAL; >50 → at least ELEVATED (prevents dilution by high diplomatic-media volume)
- **MONITORING-level actors** now appear in the conflict zone panel with a yellow `WATCH` badge, so operators see the full threat spectrum instead of just the top tier

---

### 🔧 Runtime Stability

- **AI Model Overload Advisory** — Analyst Panel now shows an amber "Model Overloaded" notice instead of silently presenting heuristic fallback text when the LLM provider returns `503 / high demand`.
- **SatNOGS Timeout Resilience** — One retry added for transient station fetch timeouts; timeout vs. network failures now distinguished in response metadata.
- **HTTPS WebSocket Fix** — Shared URL resolver promotes `ws://`/`http://` build-time endpoints to same-origin secure paths when the app is served behind TLS. Eliminates mixed-content failures on HTTPS deployments.
- **WebSDR HTTPS Iframe** — WebSDR receiver iframes are now HTTPS-upgraded on secure pages; original HTTP URL preserved as an external link fallback.
- **FIRMS Poller** — Normalized legacy `VIIRS_SNPP_NR` alias; fixed empty-cache cooldown guard that caused tight re-poll loops.
- **News Feed** — DefenseNews removed from the default feed set (intermittent non-standard HTTP status).

---

### 🐛 Code Review Bug Audit

A parallel audit identified and patched 7 confirmed bugs across the backend, frontend, and JS8Call service:

| Component | Bug | Severity |
|-----------|-----|----------|
| `analysis.py` | `detect_rendezvous()` / `detect_emergency_transponders()` called `.description` on a list → `AttributeError` crash when multiple anomalies fired simultaneously | **High** |
| `stats.py` | Octant index into `OCT_LABELS` without bounds check → `IndexError` on unexpected DB data | Medium |
| `js8call/server.py` | UDP send socket not closed in exception path → resource leak | Medium |
| `App.tsx` | `res.json()` called before `res.ok` check → HTTP error bodies silently parsed as valid GeoJSON | Medium |
| `analysis.py` | Bare `except Exception: pass` on intel-context DB lookup → failures completely invisible | Low |
| `kiwi_client.py` | `self._password` stored but never read → unnecessary sensitive-data retention in memory | Low |
| `auth.ts` | `res.status !== 204` guard unreachable (204 is 2xx, `res.ok` already `true`) → dead code | Low |

A second set of findings (pool exhaustion risk, lock-free read in `kiwi_directory.py`, orphaned subprocess handles) was documented in the task log as a backlog for the next audit cycle.

---

### ⚙️ Configuration

- **GDELT Conflict Keywords** — Now configurable via `GDELT_CONFLICT_KEYWORDS` env var without a code change.
- **ReliefWeb App Name** — Now configurable via `RELIEFWEB_APPNAME` env var.
- **nginx-spa.conf** — `index.html` is no longer cached, reducing stale-bundle issues after deploys behind CDNs.

---

## Technical Notes

- No database migrations — no schema changes in this release.
- No new environment variables are mandatory; all new vars have sensible defaults matching previous behaviour.
- The `sovereign-backend` container should be rebuilt to pick up AI overload handling, SatNOGS, and news changes.
- The `sovereign-gdelt-pulse` container should be rebuilt to pick up the conflict-filter and ReliefWeb config changes.
- The `sovereign-space-pulse` container should be rebuilt to pick up the FIRMS poller alias fix.
- Frontend: no rebuild required for already-deployed prod builds if served via nginx (nginx-spa.conf change only affects cache headers, not functionality).

---

## Verification

| Suite | Result |
|-------|--------|
| Frontend lint | ✅ Clean |
| Frontend typecheck | ✅ Clean |
| Frontend tests | ✅ 272/272 |
| Backend API lint | ✅ Clean |
| Backend API tests | ✅ 152/152 |
| GDELT threshold tests | ✅ 11/11 (6 new) |

---

## Upgrade Instructions

```bash
git pull origin dev

# Rebuild affected services
docker compose up -d --build sovereign-backend sovereign-gdelt-pulse sovereign-space-pulse

# Frontend (if running prod static build)
docker compose up -d --build sovereign-frontend
```

No `docker compose down` required. No migrations to run.

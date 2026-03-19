# Dependency Changes & Upgrade Log

**Date:** 2026-03-16
**Branch:** `claude/audit-dependencies-tApww`
**Triggered by:** Dependency audit identifying no lock files, unpinned packages, outdated versions, and supply-chain risks.

---

## JS8Call Binary: Intentional Exception

The `js8call/Dockerfile` downloads the JS8Call application as a pre-built AppImage from:

> **https://github.com/JS8Call-improved/JS8Call-improved**

This is an **intentional exception** — the project uses the `JS8Call-improved` community fork, not the upstream `KD8CEC/js8call` official repo. Do not change this URL to the official JS8Call releases.

Current version: **2.5.2** (latest release on the fork as of 2026-03-16; verified at `release/2.5.2` tag).

To check for newer releases: https://github.com/JS8Call-improved/JS8Call-improved/releases

When a new version is available, update the version string and download URL in `js8call/Dockerfile` Layer 7.

---

## Summary of Changes

| Area | What Changed |
|---|---|
| **All Python components** | Migrated from `requirements.txt` (no lock) → `pyproject.toml` + `uv.lock` |
| **All Python Dockerfiles** | Migrated from `python:3.11-slim + pip` → `python:3.12-slim + uv` |
| **Frontend** | All dependencies updated to latest stable; exact pins replacing `^` ranges |
| **Tailwind CSS** | Upgraded 3.4.x → 4.2.1 (major); config files updated for v4 API |
| **React** | Upgraded 18.3.1 → 19.2.4 (major) |
| **Bug fix** | `asyncio` (stdlib) removed from `orbital_pulse` deps |
| **Bug fix** | `pyjs8call>=0.9.0` was unsatisfiable — pinned to actual latest (0.2.3) |
| **Bug fix** | `fakeredis[aioredis]` extra no longer exists; removed (async built-in) |
| **Bug fix** | `redis[asyncio]` extra removed in redis 7.x; removed the extra specifier |
| **Resolved conflict** | `protobuf` + `grpcio-tools` compatibility resolved by uv: protobuf 6.33.5 |
| **Standardized** | `aiokafka` now pinned to 0.13.0 across all components (was 0.10/0.11/0.8+) |

---

## Package Management: Migration to `uv`

### Why uv

- **Reproducibility:** `uv.lock` pins every direct *and* transitive dependency to an exact version with hashes. `requirements.txt` only pins direct deps when `==` is used.
- **Speed:** uv resolves and installs 10–100x faster than pip.
- **Correctness:** uv's resolver detects conflicts at `uv lock` time, not at runtime inside a container.
- **Docker integration:** `COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv` adds the binary with a single layer; `uv sync --frozen --no-dev` installs exactly what the lock file specifies.

### File structure per component

```
<component>/
├── pyproject.toml   ← Human-maintained: project name, requires-python, direct deps pinned with ==
└── uv.lock          ← Machine-generated: full dependency graph with hashes; commit this file
```

**The old `requirements.txt` files are superseded by `pyproject.toml` + `uv.lock` and can be removed after testing.**

### Updating dependencies in future

```bash
# Update a single package
cd backend/api
uv add fastapi==X.Y.Z    # updates pyproject.toml and re-locks

# Re-lock everything (pick up patch releases)
uv lock --upgrade

# Re-lock a single package only
uv lock --upgrade-package fastapi
```

---

## Python Base Image: 3.11 → 3.12

All Dockerfiles updated from `python:3.11-slim` to `python:3.12-slim`.

- Python 3.11 EOL: October 2027 (still supported, but 3.12 is newer)
- Python 3.12 provides ~5% performance improvement and improved error messages
- Python 3.13 is available but many packages do not yet publish 3.13 wheels; 3.12 is the current recommended production target

---

## Component-by-Component Changes

### `backend/api`

| Package | Old | New | Notes |
|---|---|---|---|
| `fastapi` | `==0.109.0` | `==0.135.1` | 15 months of fixes and improvements |
| `uvicorn` | `==0.27.0` | `==0.42.0` | Major stability improvements |
| `asyncpg` | `==0.29.0` | `==0.31.0` | Python 3.12 compatibility fixes |
| `pgvector` | `==0.2.4` | `==0.4.2` | New index types (HNSW improvements) |
| `litellm` | `==1.18.0` | `==1.82.2` | **40+ releases behind** — critical to update |
| `pydantic` | `==2.5.3` | `==2.12.5` | Performance and validation improvements |
| `pydantic-settings` | `==2.1.0` | `==2.13.1` | |
| `python-dotenv` | `==1.0.0` | `==1.2.2` | |
| `sse-starlette` | `==2.0.0` | `==3.3.2` | ⚠️ Major version; SSE event format API may differ |
| `aiokafka` | `==0.10.0` | `==0.13.0` | Standardized across all components |
| `protobuf` | `>=5.29.0` | `==6.33.5` | ⚠️ Pinned to 6.x (grpcio-tools 1.78.0 requires protobuf<7.0.0) |
| `grpcio-tools` | `>=1.60.0` | `==1.78.0` | Latest; resolved with protobuf 6.33.5 |
| `websockets` | `>=12.0` | `==16.0` | ⚠️ Major version; connection/handshake API changed in v13+ |
| `redis` | `>=5.0.0` | `==7.3.0` | ⚠️ Major version; see Redis 6/7 migration notes below |
| `sgp4` | `>=2.22` | `==2.25` | |
| `numpy` | `>=1.26` | `==2.4.3` | ⚠️ Major version; see NumPy 2.x migration notes below |
| `httpx` | `>=0.27.0` | `==0.28.1` | |
| `pyyaml` | `>=6.0.1` | `==6.0.3` | |
| `pytest` | `>=8.0.0` | `==9.0.2` (dev) | |
| `pytest-asyncio` | `>=0.23.0` | `==1.3.0` (dev) | ⚠️ Major version; fixture mode defaults may differ |

### `backend/ingestion/aviation_poller`

| Package | Old | New | Notes |
|---|---|---|---|
| `aiohttp` | `>=3.9.0` | `==3.13.3` | |
| `aiolimiter` | `>=1.1.0` | `==1.2.1` | |
| `tenacity` | `>=8.2.0` | `==9.1.4` | ⚠️ Major version; retry decorator API updated |
| `h3` | `>=4.0.0b2` | `==4.4.2` | ✅ Stable release (was beta pinned); Uber H3 v4 is production-ready |
| `redis` | `>=5.0.0` | `==7.3.0` | ⚠️ See Redis migration notes below |
| `aiokafka` | `>=0.10.0` | `==0.13.0` | Standardized |
| `uvloop` | `>=0.19.0` | `==0.22.1` | Platform guard retained (`sys_platform != 'win32'`) |
| `python-dotenv` | `>=1.0.0` | `==1.2.2` | |
| `fakeredis` | `>=2.20.0[aioredis]` | `==2.34.1` (dev) | **`[aioredis]` extra was removed** — async support is now built-in |
| `pytest` | `>=7.4.0` | `==9.0.2` (dev) | |
| `pytest-asyncio` | `>=0.23.0` | `==1.3.0` (dev) | |

### `backend/ingestion/infra_poller`

| Package | Old | New | Notes |
|---|---|---|---|
| `requests` | *(no version)* | `==2.32.5` | **Was completely unpinned** |
| `redis` | *(no version)* | `==7.3.0` | **Was completely unpinned** |

### `backend/ingestion/maritime_poller`

| Package | Old | New | Notes |
|---|---|---|---|
| `aiokafka` | `>=0.8.0` | `==0.13.0` | Very wide range (0.8–any) closed |
| `redis` | `>=5.0.0` | `==7.3.0` | |
| `websockets` | `>=12.0` | `==16.0` | ⚠️ Major version; see websockets migration notes |

### `backend/ingestion/orbital_pulse`

| Package | Old | New | Notes |
|---|---|---|---|
| `asyncio` | *(no version)* | **REMOVED** | ❌ **Bug fix:** `asyncio` is Python stdlib; listing it as a pip dependency is incorrect and a supply-chain risk (a malicious PyPI package named `asyncio` could be installed) |
| `aiohttp` | *(no version)* | `==3.13.3` | **Was completely unpinned** |
| `aiokafka` | *(no version)* | `==0.13.0` | **Was completely unpinned** |
| `redis` | *(no version)* | `==7.3.0` | **Was completely unpinned** |
| `sgp4` | *(no version)* | `==2.25` | **Was completely unpinned** |
| `numpy` | *(no version)* | `==2.4.3` | **Was completely unpinned** |

### `backend/ingestion/rf_pulse`

| Package | Old | New | Notes |
|---|---|---|---|
| `aiokafka` | `==0.11.0` | `==0.13.0` | Standardized (was out-of-sync with other components) |
| `redis[asyncio]` | `==5.0.4` | `==7.3.0` | **`[asyncio]` extra removed in redis 7.x** — async is built-in |
| `httpx` | `==0.27.0` | `==0.28.1` | |
| `aiohttp` | `==3.9.5` | `==3.13.3` | |
| `zeep` | `==4.2.1` | `==4.3.2` | |
| `beautifulsoup4` | `==4.12.3` | `==4.14.3` | |
| `lxml` | `==5.2.1` | `==6.0.2` | ⚠️ Major version; XML/HTML parsing API generally stable |
| `python-dotenv` | `==1.0.1` | `==1.2.2` | |

### `js8call`

| Package | Old | New | Notes |
|---|---|---|---|
| `fastapi` | `>=0.109.0` | `==0.135.1` | |
| `uvicorn[standard]` | `>=0.27.0` | `==0.42.0` | |
| `pyjs8call` | `>=0.9.0` | `==0.2.3` | **Critical bug fix:** no version ≥0.9.0 has ever been published on PyPI. The `>=0.9.0` requirement was permanently unsatisfiable. Pinned to actual latest (0.2.3). |
| `websockets` | `>=12.0` | `==16.0` | |
| `aiohttp` | `>=3.9.0` | `==3.13.3` | |

---

## Frontend Changes

### Package version changes

| Package | Old | New | Notes |
|---|---|---|---|
| `react` | `^18.2.0` → `18.3.1` | `19.2.4` | ⚠️ **Major version** — see React 19 migration notes |
| `react-dom` | `^18.2.0` → `18.3.1` | `19.2.4` | ⚠️ Major version |
| `@types/react` | `^18.2.43` → `18.3.28` | `19.2.14` | Must match React major |
| `@types/react-dom` | `^18.2.17` → `18.3.7` | `19.2.3` | Must match React-DOM major |
| `mapbox-gl` | `^3.18.1` → `3.19.1` | `3.20.0` | Minor — no breaking changes |
| `maplibre-gl` | `^5.0.0` → `5.20.0` | `5.20.1` | Patch |
| `lucide-react` | `^0.300.0` → `0.300.0` | `0.577.0` | 277 new icons; removed icons may cause build errors |
| `protobufjs` | `^7.5.4` → `7.5.4` | `8.0.0` | ⚠️ **Major version** — see protobufjs 8.x migration notes |
| `react-map-gl` | `^8.0.0` → `8.1.0` | `8.1.0` | No change |
| `@deck.gl/*` | `^9.0.0` → `9.2.11` | `9.2.11` | No change |
| `tailwindcss` | `^3.4.0` → `3.4.19` | `4.2.1` | ⚠️ **Major version** — see Tailwind 4 migration notes |
| `@tailwindcss/vite` | *(new)* | `4.2.1` | Required by Tailwind 4 Vite integration |
| `vite` | `^7.3.1` → `7.3.1` | `7.3.1` | Unchanged; see constraint note below |
| `@vitejs/plugin-react` | `^4.2.1` → `4.7.0` | `5.1.4` | Updated to latest vite-7-compatible release |
| `eslint` | `^9.39.2` → `9.39.4` | `9.39.4` | No change; see ESLint 10 constraint below |
| `@eslint/js` | `^10.0.1` → `10.0.1` | `9.39.4` | Downgraded to align with eslint version |
| `@typescript-eslint/*` | `^8.55.0` | `8.57.1` | Minor update |
| `typescript` | `^5.2.2` → `5.9.3` | `5.9.3` | No change |
| `autoprefixer` | `^10.4.16` → `10.4.27` | `10.4.27` | No change |
| `postcss` | `^8.4.32` → `8.5.8` | `8.5.8` | No change |
| `vitest` | `^1.2.1` → `1.2.1` | `4.1.0` | ⚠️ **Major version** — see vitest migration notes |
| `globals` | `^17.3.0` → `17.4.0` | `17.4.0` | No change |
| `playwright` / `@playwright/test` | `^1.58.2` → `1.58.2` | `1.58.2` | No change |
| `ts-node` | `^10.9.2` | `10.9.2` | No change |

### Pin strategy change

All `^` semver ranges replaced with exact versions. The `pnpm-lock.yaml` continues to be the source of truth, but exact pins in `package.json` make intentional upgrades explicit and prevent accidental drift during `pnpm install --no-frozen-lockfile`.

### Tailwind 4 migration (applied)

Three files were updated to accommodate Tailwind 4's new integration model:

**`vite.config.ts`** — Added `@tailwindcss/vite` plugin:
```ts
import tailwindcss from '@tailwindcss/vite'
plugins: [react(), tailwindcss()]
```

**`postcss.config.js`** — Removed `tailwindcss: {}` (now handled by Vite plugin):
```js
plugins: { autoprefixer: {} }  // tailwindcss removed
```

**`src/index.css`** — Replaced three `@tailwind` directives with single `@import`:
```css
/* Before (v3) */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* After (v4) */
@import "tailwindcss";
@config "../tailwind.config.js";
```

The existing `tailwind.config.js` (theme colors, fonts, etc.) is unchanged — Tailwind 4 still supports JS config via `@config`.

**Tailwind 4 breaking changes to verify during testing:**
- Custom color utility classes (e.g., `bg-tactical-bg`, `text-hud-green`) — verify these still resolve correctly
- `@apply` directives in CSS — syntax unchanged but may behave differently
- `backdrop-blur-md`, `shadow-[...]` arbitrary values — verify supported

---

## Version Constraint Issues Discovered

### 🔴 Vite 8 blocked by `@tailwindcss/vite`

`vite@8.0.0` is the latest major, but `@tailwindcss/vite@4.2.1` (the latest Tailwind Vite plugin) declares peer dependency `vite@"^5.2.0 || ^6 || ^7"`. Simultaneously, `@vitejs/plugin-react@6.0.1` requires `vite@"^8.0.0"`.

These two packages **cannot coexist on any single Vite version**. Resolution chosen: stay on `vite@7.3.1` + `@vitejs/plugin-react@5.1.4` until `@tailwindcss/vite` publishes support for Vite 8.

**Action required:** Monitor https://github.com/tailwindlabs/tailwindcss for Vite 8 peer dep support. Once available, upgrade:
```bash
pnpm add -D vite@8 @vitejs/plugin-react@6 @tailwindcss/vite@latest
```

### 🟡 ESLint 10 blocked by plugins

`eslint@10.0.3` is the latest, but `eslint-plugin-react@7.37.5` and `eslint-plugin-react-hooks@7.0.1` declare peer support only up to `eslint@^9`. Pinned to `eslint@9.39.4` and `@eslint/js@9.39.4`.

**Action required:** Monitor these plugins for ESLint 10 declarations and upgrade when available.

---

## Major Version Breaking Change Notes

### Redis Python client 5.x → 7.x

Redis client went through two major versions. Key breaking changes:
- The `asyncio` extras specifier (`redis[asyncio]`) was **removed** — async support is built-in
- `ConnectionPool` and `StrictRedis` class hierarchy changes in 6.x
- Some deprecated commands removed in 7.x

**Test checklist:** all Redis connection code, pub/sub patterns, and pipeline usage.

### NumPy 1.x → 2.x

NumPy 2.0 is a significant release with intentional breaking changes:
- Some rarely-used C API symbols removed
- `np.bool`, `np.int`, `np.float`, `np.complex` aliases removed (use `bool`, `int`, `float`, `complex`)
- `np.string_` removed (use `np.bytes_`)

**Test checklist:** all code in `orbital_pulse` and `backend/api` that uses numpy.

### websockets 12.x → 16.x

websockets v13 introduced a new connection API. Key changes:
- `websockets.connect()` is now an async context manager only
- `websockets.serve()` API updated
- Exception hierarchy changed

**Test checklist:** all WebSocket connection code in `maritime_poller`, `backend/api`, and `js8call`.

### React 18 → 19

React 19 changes to verify:
- `ReactDOM.createRoot` still works (used in `main.tsx`) ✅
- `ref` as a prop: React 19 passes `ref` as a regular prop (no `forwardRef` needed)
- `use()` hook is new — existing code unaffected
- Some `act()` changes in test utilities

**Test checklist:** component rendering, all hooks usage, any third-party components.

### protobufjs 7.x → 8.x

protobufjs 8.0 is a major rewrite with breaking API changes:
- `protobuf.load` callback-based API changed
- Message encoding/decoding methods updated
- TypeScript types reorganized

**Test checklist:** all protobuf message parsing in the frontend.

### Tailwind CSS 3.x → 4.x (configuration applied above)

Changes already applied. Additional test checklist:
- All `@apply` directives in `index.css`
- Custom color tokens (`tactical-bg`, `hud-green`, etc.)
- Arbitrary value syntax (e.g., `shadow-[inset_0_1px_...]`)
- Keyframe animations in `@layer utilities`

### tenacity 8.x → 9.x (aviation_poller)

tenacity 9.0 changes:
- `retry` decorator `stop` parameter behavior updated for `stop_after_attempt`
- `RetryError` exception carries more context

**Test checklist:** retry-decorated functions in aviation poller.

### pytest-asyncio 0.x → 1.x

pytest-asyncio 1.0 changes:
- `asyncio_mode = "auto"` is the new recommended default in `pytest.ini`
- `@pytest.mark.asyncio` still works but mode setting may affect test discovery

**Test checklist:** all async test functions. May require adding `asyncio_mode = "auto"` to `pyproject.toml`:
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

### lxml 5.x → 6.x (rf_pulse)

Generally backward-compatible. Verify XPath and CSS selector usage.

### vitest 1.x → 4.x

Three major versions. Key changes:
- `vi.fn()` and `vi.spyOn()` API stable across versions
- Configuration file format changes in v2+
- Pool configuration updated

**Test checklist:** run `pnpm test` and address any configuration warnings.

---

## pnpm Build Script Warning

During `pnpm install`, pnpm 10's security model blocked build scripts for two packages:

```
Ignored build scripts: esbuild@0.27.3, protobufjs@8.0.0
```

- **esbuild:** its postinstall script downloads the platform-specific native binary. If Vite build fails with an esbuild error, run `pnpm approve-builds` and approve esbuild.
- **protobufjs:** its script compiles native bindings. If protobuf parsing fails, run `pnpm approve-builds` and approve protobufjs.

---

## Files Changed

### New files (created)
```
backend/api/pyproject.toml
backend/api/uv.lock
backend/ingestion/aviation_poller/pyproject.toml
backend/ingestion/aviation_poller/uv.lock
backend/ingestion/infra_poller/pyproject.toml
backend/ingestion/infra_poller/uv.lock
backend/ingestion/maritime_poller/pyproject.toml
backend/ingestion/maritime_poller/uv.lock
backend/ingestion/orbital_pulse/pyproject.toml
backend/ingestion/orbital_pulse/uv.lock
backend/ingestion/rf_pulse/pyproject.toml
backend/ingestion/rf_pulse/uv.lock
js8call/pyproject.toml
js8call/uv.lock
DEPENDENCY_CHANGES.md
```

### Modified files
```
backend/api/Dockerfile                     (pip → uv, python 3.11 → 3.12)
backend/ingestion/aviation_poller/Dockerfile
backend/ingestion/infra_poller/Dockerfile
backend/ingestion/maritime_poller/Dockerfile
backend/ingestion/orbital_pulse/Dockerfile
backend/ingestion/rf_pulse/Dockerfile
js8call/Dockerfile                         (inline pip3 install → uv sync)
frontend/package.json                      (all versions updated, ^ ranges removed)
frontend/pnpm-lock.yaml                    (regenerated)
frontend/vite.config.ts                    (added @tailwindcss/vite plugin)
frontend/postcss.config.js                 (removed tailwindcss, Tailwind now via Vite)
frontend/src/index.css                     (@tailwind directives → @import "tailwindcss")
```

### Superseded (safe to delete after testing)
```
backend/api/requirements.txt
backend/ingestion/aviation_poller/requirements.txt
backend/ingestion/infra_poller/requirements.txt
backend/ingestion/maritime_poller/requirements.txt
backend/ingestion/orbital_pulse/requirements.txt
backend/ingestion/rf_pulse/requirements.txt
js8call/requirements.txt
```

---

## Testing Checklist

Before merging, verify these areas most likely to be affected by major version bumps:

- [ ] `pnpm run build` — frontend builds without errors
- [ ] `pnpm run test` — frontend tests pass (vitest 4.x)
- [ ] `pnpm run lint` — ESLint 9.x passes
- [ ] Tailwind custom colors render in browser (`tactical-bg`, `hud-green`, `sea-accent`)
- [ ] `@apply` directives in `index.css` resolve correctly
- [ ] Protobuf message decoding works (protobufjs 8.x API change)
- [ ] `docker compose build backend-api` — uv install succeeds
- [ ] `docker compose build aviation-poller`
- [ ] `docker compose build maritime-poller`
- [ ] `docker compose build orbital-pulse`
- [ ] `docker compose build rf-pulse`
- [ ] `docker compose build infra-poller`
- [ ] Redis connection code works (redis 7.x API)
- [ ] WebSocket connections work (websockets 16.x API)
- [ ] NumPy code in orbital_pulse works (numpy 2.x)
- [ ] React 19 — all components render, no `forwardRef` regressions
- [ ] `pyjs8call==0.2.3` API — verify bridge server still works (was never installable at >=0.9.0)

# Release - v0.64.0 - Infrastructure Hardening

This release focuses on hardening the **Sovereign Watch** deployment stack, resolving critical asset delivery issues and ensuring high-availability container health.

## High-Level Summary
The main objective of `v0.64.0` was to standardize the infrastructure configuration across both development and production environments. We addressed a series of "silent failures" where frontend assets would fail to load (rendering a blank white screen) and backend containers were incorrectly reporting healthy status despite missing connectivity tools.

## Key Infrastructure Improvements

- **Nginx Standardization**: Rewrote `nginx.conf` and `nginx-dev.conf` with production-grade MIME type support and Gzip compression. This ensures that browsers correctly identify and cache assets, resolving loading failures.
- **Backend Health Restoration**: Integrated standard diagnostic tools (`curl`) into the minimal backend image. The FastAPI container now accurately reports its health to the Docker engine via live REST/WS probes at `/health`.
- **Build System Parity**: Hardened the `Makefile` build targets. The CLI now enforces the `--build` flag on all operations, ensuring that Vite-specific development targets and Nginx-specific production targets never overlap or cause 502 Bad Gateway errors.
- **Idempotent Migration Pipeline**: Documented and stabilized the integrated database migration runner. The system now automatically stamps a `V001` baseline on existing deployments before applying new, numbered SQL migrations.
- **WebSocket Stability**: Optimized the development proxy to include `Upgrade` and `Connection` headers for the root location, ensuring reliable Vite HMR (Hot Module Replacement) during active development.

## Documentation & Task Summary
This release cycle also aggregates several high-fidelity feature additions from early April:
- **Unified AI Architecture (v1.5)**: Consolidation of reasoning into a single `AIService`.
- **H3 Composite Risk Scoring**: Real-time multi-INT risk fusion rendering.
- **Tactical NWS Alerts**: Polygon overlay support for active weather events in the map UI.

---

## Upgrade Instructions

To upgrade to `v0.64.0`, pull the latest changes and use the hardened `Makefile` to rebuild the stack:

```bash
# 1. Pull latest changes
git pull origin main

# 2. Stop existing containers and prune volumes if needed
make down

# 3. Clean rebuild and start (enforces --build flag safety)
make prod
```

Verification of success can be checked via `docker compose ps` to ensure all containers report a `healthy` status.

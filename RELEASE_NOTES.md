# Release candidate - v1.2.0 - Mobile Workspaces & Operational Efficiency

**Draft: not released.** Release preparation is on `release/mobile-performance-v1.2.0`, based on v1.1.3. Local verification passes; GitHub CI and final merge/release review remain pending. See the [readiness report](agent_docs/tasks/2026-10-07-release-readiness-v1-2-0.md).

Sovereign Watch gains usable phone and tablet workspaces while retaining its desktop interface. Maps resize more reliably, menus provide readable touch controls, and selecting an object opens its details immediately. The stack also gains bounded logs and replay budgets, more efficient orbital streaming, and tools to measure disk writes and query costs.

## Key features

- Tactical, Orbital, Intel, Dashboard and Radio mobile layouts with iOS safe areas and consistent black/green frosted-glass styling.
- Full-width entity details, a dedicated Tools drawer, expanded Feeds/Layers filtering, compact overviews and on-map mission NWS alerts.
- Lower rendering and message-conversion overhead, background metrics sampling and batched live snapshots.
- Bounded Docker logs, Kafka replay budgets, persistent orbital cache and disk-write monitoring.
- Batched satellite search, precise orbital timestamps and independent, atomic per-user configuration/watchlist write limits.

## Technical details

- Migration **V007** enables `pg_stat_statements`. PostgreSQL must start with the updated preload configuration before the backend applies the migration. No bootstrap schema files were edited.
- Update the backend and space-pulse producer together: new orbital position records use TAK Protocol V1 Protobuf; retained legacy records remain readable.
- `ORBITAL_PROPAGATE_INTERVAL_S` defaults to 15 seconds. `DOCKER_LOG_MAX_SIZE` and `DOCKER_LOG_MAX_FILES` default to `10m` and `3`.
- Kafka byte budgets are per partition and segment deletion is asynchronous. Limits can shorten replay windows under heavy ingestion; monitor consumer lag. Log rotation applies when containers are recreated.
- Redpanda is pinned to v25.3.17 for this deployment's retained cluster version. Operators on a newer cluster must review compatibility before adopting that pin.
- The new space cache volume is approximately catalog-sized; existing database, Redis and Kafka volumes are retained.
- Disk-write estimates describe host block writes, not physical NAND wear. A VMware guest cannot determine the hypervisor SSD's remaining endurance budget; use [the storage guide](tools/storage/README.md).
- Browser evidence uses API fixtures and blank basemaps. It verifies layout and interactions, not physical-device performance. No unmeasured speedup or drive-life guarantee is claimed.
- Frontend package version remains v1.1.3 until a release version is explicitly finalized. No new dependency upgrade is required for the mobile layouts.

## Upgrade instructions

Run after the v1.2.0 tag has been published, from a clean checkout with your existing `.env` and volumes:

```bash
git fetch origin --tags
git checkout v1.2.0
docker compose build sovereign-frontend sovereign-backend sovereign-space-pulse
docker compose up -d sovereign-timescaledb sovereign-redpanda sovereign-redis
docker compose up -d --force-recreate sovereign-redpanda-init
docker compose up -d --build
```

Check backend startup for migration V007, service health, Kafka lag and retention settings. Use `bash tools/storage/live-audit.sh` for a read-only audit. Preserve volume backups and keep volumes when reverting application images; this release does not require deleting data.

## Verification and remaining work

See the [release-readiness report](agent_docs/tasks/2026-10-07-release-readiness-v1-2-0.md) for exact test evidence, open PR recommendations and remaining GitHub CI and publication steps. PR #342/#343 changes and a hardened implementation of #345 are included locally; GitHub PRs remain unchanged.

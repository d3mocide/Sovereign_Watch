# Release - v1.2.0 - Mobile Workspaces, Performance & Radio Recovery

Release gates passed for the mobile/performance foundation and radio recovery.
See the [final gate report](agent_docs/tasks/2026-10-07-release-gates-v1-2-0.md).

Sovereign Watch gains usable phone and tablet workspaces while retaining its desktop interface. Maps resize more reliably, menus provide readable touch controls, and selecting an object opens its details immediately. The stack also gains bounded logs and replay budgets, more efficient orbital streaming, and tools to measure disk writes and query costs.

## Key features

- Working KiwiSDR audio, JS8Call decoding and responsive waterfalls, verified with a known recording and live on-air traffic.
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
- The radio image now uses Ubuntu 24.04 for JS8Call 3.0.3 runtime compatibility,
  with a Qt-visible PulseAudio capture source. Rebuild `sovereign-js8call` during
  upgrade; a bridge connection alone no longer implies decoder readiness.
- Radio reception depends on public receiver availability, input overload and
  propagation. This integration is receive-only; browser audio volume does not
  resolve remote ADC overload. See the [repeatable radio test](tools/radio/README.md).
- Frontend package metadata is updated to v1.2.0. Mobile layouts require no new
  frontend dependency upgrade.

## Upgrade instructions

Run after the v1.2.0 tag has been published, from a clean checkout with your existing `.env` and volumes:

```bash
git fetch origin --tags
git checkout v1.2.0
docker compose build sovereign-frontend sovereign-backend sovereign-space-pulse sovereign-js8call
docker compose up -d sovereign-timescaledb sovereign-redpanda sovereign-redis
docker compose up -d --force-recreate sovereign-redpanda-init
docker compose up -d --build
```

Check backend startup for migration V007, service health, Kafka lag and retention settings. Use `bash tools/storage/live-audit.sh` for a read-only audit. Preserve volume backups and keep volumes when reverting application images; this release does not require deleting data.

## Verification

All frontend and nine Python-service CI jobs passed for the radio patch. Targeted
local gates passed frontend lint/typecheck and 318 tests, radio Ruff and 40 tests,
and Docker image builds. The real-decoder test recovered all four messages from
a pinned upstream WAV; live KiwiSDR reception also produced real JS8 traffic.
Desktop and phone browsers painted actual incoming waterfall rows without
horizontal overflow.

The running stack has 14 services, healthy radio/database/cache/broker services,
applied V007, successful latest retention/compression runs, bounded logs and
stable Kafka consumers. Historical policy failure counters remain cumulative.
Earlier mobile/performance evidence and its limits are recorded in the
[foundation readiness report](agent_docs/tasks/2026-10-07-release-readiness-v1-2-0.md);
radio verification is in the [radio recovery report](agent_docs/tasks/2026-10-07-radio-recovery.md).

PR #347 delivered the foundation. Redundant PRs #342–#346 were closed after their
selected improvements were incorporated. This release adds the radio recovery
and finalizes the release documentation and version metadata.

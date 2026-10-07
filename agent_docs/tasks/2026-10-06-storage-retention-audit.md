# Storage and Retention Audit

## Issue

Resume the interrupted storage/retention audit. Scope was reconstructed from
previously approved audit commands; no previous session transcript was available.

## Solution

Inspect host capacity, Docker storage inventory, Compose wiring, topic setup,
database policies, and build exclusions without deleting retained data or
starting services against existing volumes.

## Changes

Added this audit report. Application code and runtime configuration were not changed.

## Findings

1. **Retained volumes dominate disk use.** The host filesystem reports 63 GB
   used, 26 GB available, and 71% utilization. Docker reports 74 volumes using
   60.35 GB, zero images, zero containers, and zero build cache in the default
   context. The current Compose project has no containers.
2. **Two named persistence sets exist.** Current Compose references
   `sovereign_watch_sovereign-vol-postgres` (26.28 GB),
   `sovereign_watch_sovereign-vol-redpanda` (19.43 GB), and
   `sovereign_watch_sovereign-vol-redis` (26.78 MB). A second set contains
   `sovereign_watch_postgres-data` (1.283 GB),
   `sovereign_watch_redpanda-data` (11.85 GB), and
   `sovereign_watch_redis-data` (15.43 MB). Ownership, age, and backup status
   of the second set have not been established. Docker's 100% reclaimable
   label indicates no container references, not that the contents are disposable.
3. **Crash dump enters the frontend build context.** `frontend/core.18` is an
   untracked ELF core dump, 4,022,910,976 logical bytes and approximately
   2.7 GiB allocated. Neither `frontend/.dockerignore` nor the repository
   `.dockerignore` excludes it; `.gitignore` does not exclude core dumps either.
   Excluding `core` and `core.*` would prevent future build-context transfer
   and accidental commits. Removing the existing dump requires a decision
   about whether crash analysis is still needed.
4. **Container logging has no Compose rotation policy.** No `logging`,
   `max-size`, or `max-file` configuration exists in the base Compose file.
   Effective daemon logging defaults were not inspected, so unbounded runtime
   log growth is a configuration gap rather than a confirmed current consumer.
5. **Kafka retention coverage is incomplete in source.** Topic initialization
   explicitly sets `orbital_raw` to one hour and
   `clausal_chains_state_changes` to three days. Other historian input topics,
   including `adsb_raw`, `ais_raw`, `rf_raw`, SatNOGS topics, and `gdelt_raw`,
   have no explicit retention settings found in repository configuration.
   No byte ceilings were found. Effective broker defaults and topic overrides
   require a running broker to verify; time retention alone does not establish
   a predictable disk budget at changing ingestion rates.
6. **Database retention is present but not verified live.** Bootstrap SQL
   configures tracks for seven-day retention and four-hour compression lag;
   other domain tables have policies ranging from one day to ninety days.
   V006 adjusts ISS chunking/compression. These source definitions do not prove
   that retained databases have the policies installed or jobs succeeding.
   Any correction on an existing database must use a new migration.
7. **Redis has persistence without a configured memory ceiling.** Compose
   enables AOF but sets no `maxmemory` or eviction policy. This is not a
   major current disk consumer based on the volume inventory. Any future cap
   must account for persistent watchlist/state semantics before selecting
   eviction behavior.

## Verification

- Ran `df -h`, workspace disk inventory, `stat`, `file`, and allocated-size
  inspection of the crash dump.
- Ran `docker system df`, `docker system df -v`, `docker volume ls`,
  `docker context show`, Docker root inspection, and `docker compose ps`.
- Reviewed Compose, topic initialization, schema/migration policy declarations,
  historian input topics, and ignore files.
- Documentation-only change: code verification suites are not applicable.
- Live table/chunk sizes, retention/compression job success, Kafka topic sizes
  and settings, Redis memory/AOF behavior, and service health remain unverified
  because the inspected Docker daemon has no containers or images.

## Benefits

Identifies the dominant storage consumers and growth-control gaps while
preserving retained databases. Establishes a concrete baseline for later
cleanup and runtime policy checks.

## Recommended follow-up

Confirm ownership and backups before removing either persistence set. Avoid
blanket volume pruning. Decide whether to retain the core dump, add build and
Git exclusions, configure bounded container logging, and define Kafka budgets
based on required replay windows. When the intended stack is running, inspect
actual database jobs and topic overrides before changing retention.

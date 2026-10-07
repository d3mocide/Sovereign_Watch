# Storage Growth Controls and Write Monitoring

## Issue

The resumed audit found large retained volumes, missing Compose log rotation,
incomplete Kafka replay budgets, and an unexcluded frontend crash dump. The user
requested fixes and long-term write/endurance tracking.

## Solution

Bound logs and topic storage, exclude crash dumps from build contexts, and run a
small host write collector. Preserve all existing volumes and the crash dump.

## Changes

- `docker-compose.yml`: shared json-file logging settings on all 15 services,
  default 10 MiB × 3 files per container. Overrides use `DOCKER_LOG_MAX_SIZE` and
  `DOCKER_LOG_MAX_FILES`. Applies on container creation/recreation.
- `backend/redpanda/init-topics.sh`: fail on errors; configure all eight known
  topics with delete cleanup, time and per-partition byte limits, 128 MiB
  segments, and hourly segment rolling. Orbital replay remains one hour; other
  topics retain up to three days. Total budget is 6.25 GiB for one partition
  each, before active segments and overhead. Size limits can shorten replay;
  consumer lag must be monitored. Policies apply when the init service reruns.
- `.gitignore`, `.dockerignore`, `frontend/.dockerignore`: exclude core dumps.
- `tools/storage/disk-writes.py`: whole-device write deltas and session-average
  daily/annual projections, optional rated-TBW estimate, daily JSONL files with
  30-day retention. No third-party packages required.
- `tools/storage/sovereign-disk-writes.service`: user systemd unit; installed and
  enabled for zbrain, sampling sda every minute into
  `/var/tmp/sovereign-disk-writes`. Lingering was denied by the host, so collection
  after logout is not guaranteed until an administrator enables it.
- `tools/storage/live-audit.sh`: read-only volume-reference, database policy/job/
  chunk, Kafka configuration, and container restart/logging inspection.
- `tools/storage/README.md`: operation and physical SSD endurance limitations.

## Verification

- Production and development Compose configuration validation passed; all 15
  rendered services include logging settings.
- Shell syntax checks passed for topic setup and runtime audit scripts.
- Collector smoke test produced valid records; projection checks verified unit
  conversion, rated-TBW arithmetic, and zero-write behavior. User service active.
- Parsed ELF notes in the existing dump: process was Node running Vite,
  signal SIGABRT (6). This does not identify the underlying cause or establish
  repeated/current crashes. Dump timestamp is April 24, 2026.
- Runtime audit reports 0 of 74 volumes referenced at inspection. Docker images
  and build cache are increasing during startup, but no containers yet exist.
  Thus live DB policy success and Kafka configuration cannot yet be verified;
  the prepared audit script can run when startup finishes. No build/restart
  was launched concurrently with the user's ongoing build.
- No frontend/backend/poller Python source changed; their suites do not apply.

## Benefits

Prevents crash dump build transfer and bounds future log/replay accumulation.
Establishes ongoing VM write measurements without adding a container or metrics
write-heavy database. Physical wear remains dependent on hypervisor drive
telemetry; the guest exposes only a VMware virtual disk.

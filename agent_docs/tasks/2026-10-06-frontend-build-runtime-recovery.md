# Frontend Build and Persistence Runtime Recovery

## Issue

Frontend Docker build failed at frozen dependency installation. Live audit also
found Redpanda crash looping on its retained data and Timescale worker shortages
blocking policy execution after startup.

## Solution

Pin the frontend toolchain to the repository's CI-compatible pnpm generation;
pin Redpanda to the retained cluster's release generation; allocate PostgreSQL
worker slots for both Timescale and parallel work. Start the intended production
stack and inspect real policy execution.

## Changes

- `frontend/Dockerfile`: Node 22 (matching CI), exact pnpm 9.15.9 instead of
  an unbounded latest install. Frozen lockfile checking remains enabled.
- `frontend/package.json`: explicit packageManager pnpm 9.15.9.
- `.github/workflows/ci.yml`: exact matching pnpm version.
- `docker-compose.yml`: broker and init image pinned to v25.3.17. The prior
  latest v26.2.3 rejected cluster logical version 17 → 19. The 25.3 broker
  started successfully on the retained data; no data reset or compatibility
  bypass was used.
- `docker-compose.yml`: tmpfs for the CLI-only init data path prevents empty
  anonymous volume accumulation on future recreations.
- `docker-compose.yml`: max_worker_processes=16, max_parallel_workers=4 alongside
  timescaledb.max_background_workers=8. Previous settings were 8/8/8 and produced
  repeated out-of-background-workers failures.

## Verification

- Reproduced ERR_PNPM_LOCKFILE_CONFIG_MISMATCH: latest pnpm ignored the package's
  pnpm.overrides, while the lockfile retained those overrides.
- Frozen install passed with pnpm 9.15.9; production frontend image built and
  served HTTP successfully at 127.0.0.1 inside its container.
- Redpanda cluster healthy; init service exited 0 and all eight topics have one
  partition with the new retention/segment settings. Broker logs show removal
  of expired segments.
- Existing Timescale retention jobs resumed. Re-ran interrupted tracks and
  clausal retention, then compression policies using run_job (existing policy
  configuration, no ad-hoc drop_chunks or volume pruning).
- Host disk utilization fell from 85% during build recovery to 48% as existing
  policies removed expired data. This is a point-in-time measurement, not a
  prediction of steady storage use.
- Three named production persistence volumes are mounted. The init image's
  anonymous data volume was replaced with tmpfs; retained unreferenced volumes
  were preserved.
- Lint and typecheck passed in the Node 22/pnpm 9.15.9 build image (host toolchain
  absent). Unit tests: 289 passed, 1 failed. The unchanged TerminatorLayer test
  uses the current date; October 6 produces a 6.0005-degree latitude edge against
  its 5-degree threshold. This is a separate geometry/test issue; no map code or
  test threshold was changed to hide it.
- All 15 retention jobs show successful runs on October 6. Existing policies
  cleared expired tracks and other short-window telemetry. Clausal compression
  reduced that hypertable from approximately 16 GB to 2809 MB. Historical job
  failures remain in job history; interrupted compression jobs were rerun and
  rescheduled, with future automatic success to be observed.
- Production and development Compose configuration and git diff checks passed.

## Final runtime results

- `docker compose up -d --build` completed. All 14 long-running services are up;
  configured health checks for API, radio, Redis, Postgres, and Redpanda pass.
  Topic init exited 0. Web ingress and API health return HTTP 200.
- Final Docker inventory: 75 volumes, 3 in use, 21.02 GB total volume storage,
  14.61 GB unreferenced. No volume pruning was performed. Host filesystem is
  approximately 45% used after builds and retention catch-up.
- Init was recreated with `--renew-anon-volumes` to avoid reusing its previous
  anonymous volume under the new tmpfs mount. Inspect confirms only its script
  bind mount remains, with the data path configured as tmpfs.
- The live read-only audit ran successfully; output captured in
  `/tmp/sovereign-live-audit-final.txt` (temporary runtime snapshot).
- Existing upstream aviation issues remain: OpenSky OAuth credentials rejected,
  OpenAIP bounding box exceeds the provider's maximum area, and airplanes.live
  returns HTTP 403. These are separate from build/storage recovery; no
  credentials or feed behavior were changed.
- Write collection remains active. Startup builds and catch-up compression
  contaminate short-window averages; use steady-state samples for endurance
  estimates. Physical drive information is still needed from the hypervisor.

## Benefits

Restores reproducible frontend builds, preserves dependency overrides, avoids
unplanned broker feature upgrades, and allows database growth-control jobs to
run without exhausting the shared worker pool.

## References

- [pnpm configuration changes](https://pnpm.io/blog/releases/11.0)
- [Redpanda supported upgrade sequence](https://docs.redpanda.com/streaming/current/upgrade/rolling-upgrade/)
- [Timescale worker sizing](https://docs.tigerdata.com/self-hosted/latest/configuration/about-configuration/)

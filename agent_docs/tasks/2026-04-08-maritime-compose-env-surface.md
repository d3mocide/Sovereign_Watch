# Maritime Compose Env Surface

## Issue

The maritime poller gained AISHub failover support, but the new runtime environment
variables were not exposed through the base Docker Compose service definition or the
checked-in `.env.example` file. That left the feature unavailable in normal compose-based
deployments and undocumented for operators.

## Solution

Added the new maritime failover settings to `docker-compose.yml` and documented them in
`.env.example`, preserving the default AISStream-first behavior.

## Changes

- Updated `docker-compose.yml` to pass `AISHUB_USERNAME` and `AIS_PRIMARY_SOURCE` into
  `sovereign-ais-poller`
- Updated `.env.example` with the new optional fallback username and primary-source
  selector, including brief usage notes

## Verification

Checked the modified files in the editor diagnostics; no errors were reported for
`docker-compose.yml`, `.env.example`, or this task note. Docker CLI was not available in
the host shell, so `docker compose config` could not be run in this environment.

## Benefits

- Compose deployments can now enable AISHub fallback without manual YAML edits
- Operators can discover the new maritime failover knobs directly from `.env.example`
- Default behavior remains unchanged because `AIS_PRIMARY_SOURCE` still defaults to
  `aisstream`
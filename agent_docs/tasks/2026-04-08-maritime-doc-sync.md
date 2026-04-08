# Maritime Documentation Sync

## Issue

The new maritime AISHub failover feature had been added to runtime code and compose wiring,
but the user-facing documentation still described the AIS poller as AISStream-only. That left
setup, deployment, and operational guidance out of sync with the actual behavior.

## Solution

Updated the main operator-facing docs to describe the optional AISHub fallback,
the `AISHUB_USERNAME` toggle, and the `AIS_PRIMARY_SOURCE` selector.

## Changes

- Updated `README.md` minimum `.env` example with the new maritime variables
- Updated `Documentation/Development.md` setup guidance to mention optional failover
- Expanded `Documentation/Configuration.md` maritime section and example env block
- Updated `Documentation/Deployment.md` install and troubleshooting guidance
- Updated `Documentation/pollers/AIS.md` to describe multi-source behavior, failover,
  reconnection thresholds, and troubleshooting

## Verification

Checked editor diagnostics for the modified Markdown files; no errors were reported.

## Benefits

- Operators can discover maritime failover from the main setup docs instead of task notes
- Quick-start, configuration, and poller-specific guidance now describe the same behavior
- The risk of AIS runtime features shipping without deployment guidance is reduced
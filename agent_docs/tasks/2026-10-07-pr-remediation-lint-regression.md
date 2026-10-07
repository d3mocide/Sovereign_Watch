# PR remediation, lint reproducibility and performance regression audit

## Issue

Address the open PR recommendations, fix Python lint gates and verify compatibility with current dev.

## Solution

Apply #342 and #343 locally with regression tests. Implement #345's rate-limiting intent using authenticated identity and atomic Redis expiry. Make the established pre-0.16 Ruff correctness rules explicit, pin CI to Ruff 0.16.10, and enable dev/main checks.

## Changes

- `ruff.toml`: E4/E7/E9/F correctness gate, Python 3.12 minimum and exact tool version. These preserve the established Ruff 0.15 defaults; no blanket ignore list was added. Expanded-rule adoption is a separate reviewed migration.
- CI: pin Ruff; include dev/main pushes and PRs, policy changes in path filters, frozen Python installs and the previously missing TAK clausalizer job.
- RF Pulse: repair the lockfile to include its declared pytest development group; existing production package versions are unchanged.
- Satellite search: normal batch conversion plus row-isolated fallback for malformed data; ordering/null-location compatibility preserved.
- Orbital routes: retain precise propagation epoch while optimizing timestamp serialization; convert NumPy indices to native integers for timedelta.
- Configuration/watchlist writes: atomic fixed-window limits per authenticated user/operation, missing-TTL repair, Retry-After, role checks and logged fail-open policy.
- Regression tests: timestamps/day boundaries, precise epochs, bad satellite rows, limit boundaries, independent proxy users and authorization.

## Verification

- All nine application Python services passed on isolated Python 3.12.15 environments using frozen dependency installs: API 263; aviation 166; maritime 123; space 65 (one skip); RF 15 (one skip); infrastructure 88; GDELT 22; TAK clausalizer 51; radio 26. Total: **819 passed, two skipped**. External-provider/manual-radio integration is not covered by this total.
- `uv tool run --from ruff==0.16.10 ruff check backend js8call tools`: passed with explicit repository policy. Vendored agent scripts and root manual RBAC tests are outside these application gates.
- API and space suites also passed on host Python 3.13.5. Existing passlib deprecation and unknown integration-marker warnings remain non-fatal.
- Real Redis Docker-network check: boundary/Retry-After, independent users, expiry, missing-TTL repair and concurrent requests passed. Temporary audit keys were cleaned up; no mission/configuration writes were performed.
- Backend image rebuilt after PR changes; RF image rebuilt after lock repair. RF production import/service-construction smoke excludes pytest; it is not a full provider-ingestion deployment.
- Local coordinate-only benchmark preserved results within absolute tolerance 1e-10: batches of 10 and 100 positions were 8.8x and 56.2x faster respectively (median of seven samples). This is not an endpoint or sustained-load speedup claim.
- Frontend source checksum matches the previously verified tree: lint/typecheck, 316 tests and production Chromium/WebKit layout checks remain applicable. No frontend code changed in this remediation.
- Candidate HEAD and freshly fetched origin/dev match at d26e34b (0/0 divergence). Running checkout remains at 9c0c851 with its uncommitted changes preserved.
- CI YAML consistency, staged whitespace and local documentation links checked before handoff. No GitHub check run has yet executed for these local edits.

## Benefits

Stable lint policy, tested PR optimizations and configuration limits that do not couple unrelated users behind nginx.

## Reference

[Ruff 0.16 release notes](https://github.com/astral-sh/ruff/releases/tag/0.16.0) document the expansion from 59 to 413 default rules. The earlier reported backlog primarily reflects this tool-policy change rather than regressions introduced by the performance work.

# Pre-release readiness: proposed v1.2.0

- Scope: storage, streaming, performance, mobile and PR remediation on `release/mobile-performance-v1.2.0`, based on current remote dev/main d26e34b (v1.1.3).
- Risk Level: medium.
- Local verification: PASS. Application Python lint; 819 Python tests with two skips; 316 frontend tests and lint/typecheck; candidate image builds and targeted Docker parity checks.
- Decision: GO for candidate commit/PR review. GitHub CI, final merge review and release authorization remain pending.
- Changelog and migration checks: pass. Keep package metadata at v1.1.3 until version finalization.

## Issue

Prepare accumulated work and the selected PR improvements for release review, fix Python quality gates and check compatibility with current dev without losing the running deployment's working tree.

## Solution

Prepare an isolated worktree from current remote dev, preserve the accumulated implementation and its task logs, integrate selected PR changes with regression coverage, and make lint/CI checks reproducible. Draft operator-facing release notes without publishing a release.

## Branches and identity

- Running checkout: `/opt/Sovereign_Watch`, branch dev at 9c0c851, three commits behind remote dev. Its uncommitted work is preserved.
- Prepared checkout: `/tmp/sovereign-watch-release`, branch `release/mobile-performance-v1.2.0`, HEAD d26e34b. Final fetch confirms HEAD...origin/dev divergence 0/0; origin/main also matches this base.
- Three-way application retained upstream frontend version v1.1.3 and local pnpm 9.15.9 metadata. The prepared candidate therefore includes the newer dev changes as well as the accumulated work.
- Author and committer: `d3mocide <info@d3mo.us>`. Active GitHub CLI account: d3mocide. Credentials are not stored here.
- No commit, push, remote PR comment/review/merge, release tag or publication occurred. Candidate changes are staged for review.

## Open PR disposition

| PR | Local candidate action | Evidence |
| --- | --- | --- |
| [#342](https://github.com/d3mocide/Sovereign_Watch/pull/342) | Included and hardened | Batch satellite coordinate conversion, preserve row order/null positions and retry individually if a batch fails. Tests cover empty/all-invalid sets, mixed TLE/propagation failures and conversion isolation. |
| [#343](https://github.com/d3mocide/Sovereign_Watch/pull/343) | Included | Separate serialization epoch preserves subsecond propagation precision. Exact timestamp tests cover fractional seconds, leap day and UTC year boundaries. |
| [#344](https://github.com/d3mocide/Sovereign_Watch/pull/344) | Excluded duplicate | Rounds the propagation epoch; #343 preserves existing precision. Remote closure remains an owner action. |
| [#346](https://github.com/d3mocide/Sovereign_Watch/pull/346) | Excluded duplicate | Same overlapping alternative as #344. |
| [#345](https://github.com/d3mocide/Sovereign_Watch/pull/345) | Intent implemented with corrections | Authenticated user/operation keys replace shared proxy-IP buckets. Atomic Redis expiry repairs persistent counters; authorization, limits, concurrency, expiry and failure policy are verified. |

Remote PRs remain unchanged. Previously these dev PRs had no check runs because CI only targeted main. The candidate enables dev/main checks; remote CI must still execute after a push. Recheck final source/SHA before any future merge.

## Changes

- Accumulated implementation, targeted tests, tools and task logs are included, with only selected documentation-linked screenshots/gallery assets.
- Changelog and proposed release notes describe mobile workspaces, rendering/streaming improvements, storage controls, migration/upgrade order and PR remediation.
- Root Ruff policy preserves pre-0.16 E4/E7/E9/F correctness checks and pins 0.16.10. The earlier apparent backlog came primarily from an unpinned release expanding default rules; explicit policy resolves the tooling drift without a blanket ignore list. See [Ruff's release notes](https://github.com/astral-sh/ruff/releases/tag/0.16.0).
- CI uses frozen Python installs, covers dev/main and adds TAK clausalizer. RF Pulse's declared development dependencies are now locked; existing production dependency versions are unchanged.
- Pre-existing NumPy groundtrack timedelta failure is fixed by converting indices to native integers.
- Migration V007 and PostgreSQL preload settings are present. No bootstrap schema files were edited; no secret/environment files are included.

## Verification

| Python component | Passed | Skipped |
| --- | ---: | ---: |
| API | 263 | 0 |
| Aviation | 166 | 0 |
| Maritime | 123 | 0 |
| Space | 65 | 1 |
| RF | 15 | 1 |
| Infrastructure | 88 | 0 |
| GDELT | 22 | 0 |
| TAK clausalizer | 51 | 0 |
| Radio | 26 | 0 |
| Total | 819 | 2 |

- Python suites used isolated Python 3.12.15 environments with frozen installs, matching CI's language version. API/space also passed on Python 3.13.5. Existing non-fatal passlib and integration-marker warnings remain.
- `uv tool run --from ruff==0.16.10 ruff check backend js8call tools` passed. These are application gates, not a claim about vendored `.agent` scripts/root manual tests.
- Frontend source matches the previously verified snapshot: lint/typecheck and 316 tests/35 files passed. Production layout/interactions passed Chromium at 390×844, 320×740, 844×390, 1024×768 and 1440×900, plus WebKit at 390×844. Task logs record a transient tablet measurement and successful follow-ups.
- Candidate frontend/backend/space/RF Docker images built under separate project image names. Backend's final rebuild contains PR remediation. RF production imports/service construction passed with development dependencies excluded. No replacement ingestion deployment was started.
- Real Redis on the Compose backend network passed independent-user, boundary, expiry, missing-TTL repair and concurrent-request checks; audit keys were cleaned up.
- Coordinate-only microbenchmark retained numeric parity (absolute tolerance 1e-10) and reduced conversion time for 10/100-item batches. It does not establish endpoint or sustained-load speedups.
- Compose config, CI YAML structure/filter coverage, whitespace and local documentation links validated. Earlier running-deployment audit observed 14 persistent services running and ingress health HTTP 200.

No regression was found in this tested scope. Full external-provider ingestion, physical-device performance and sustained production-load benchmarks remain unverified. The prepared candidate has not replaced the running stack.

## Remaining release steps

Review the staged candidate and commit/push it when authorized; obtain GitHub CI, review the final PR, then finalize version metadata and publish v1.2.0 only with explicit authorization. The repository [release workflow](../../.agent/workflows/release.md) places Git Finalization under “To be executed by the user or agent with explicit permission.”

## Benefits

Current dev changes are preserved, selected performance PRs have regression coverage, proxy users no longer share write limits, and Python quality gates are deterministic. Local release blockers are resolved and the remaining remote review/publication steps are visible.

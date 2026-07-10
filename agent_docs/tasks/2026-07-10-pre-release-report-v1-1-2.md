# Pre-Release Report — v1.1.2

- **Scope**: 9 commits since `v1.1.1`. Changes span `backend/api/`, `frontend/`, and `js8call/`.
- **Risk Level**: Medium (includes multiple performance optimizations like vectorized SGP4 calculations, ECEF-to-LLA conversion batched via NumPy, binary attribute uploads for deck.gl overlays, and a medium security fix regarding API exception details sanitization).
- **Verification**:
  - **Frontend**: `pnpm run lint` (passed), `pnpm run typecheck` (passed), `pnpm run test` (289/289 tests passed).
  - **Backend API**: `ruff check` (passed), `pytest` (185/185 tests passed).
  - **Radio Service (JS8Call)**: `ruff check` (passed), `pytest` (26/26 tests pass).
- **Changelog**: Complete (added detailed `[Unreleased]` changes documenting all security, performance, changed, and fixed categories).
- **Migration Check**: Not applicable (no database schema migrations or changes were introduced).
- **Decision**: GO
- **Recommendation**: Release now (v1.1.2)

---

## Verdict Rationale
- **Security Vulnerability Remediated**: Information disclosure regarding connection details and stack trace leakage in the RSS feed reader and article content extraction endpoint has been fully mitigated.
- **Operational Data & Hardware Integrity**: Aligned KiwiSDR/JS8 UDP bridge implementation with reference standards, fixing radio integration and WebSocket connection dropping/surges on dense sweeps.
- **Improved Cold-Start UX**: Replaced the 15-minute dashboard block with dynamic WebSocket caching, stale-while-revalidate feed caching, and module preloading, reducing initial load painting times from ~30s to immediate.
- **All Quality Gates Clear**: Linting, typechecking, and the full test suite run successfully on the host environment across all affected services.

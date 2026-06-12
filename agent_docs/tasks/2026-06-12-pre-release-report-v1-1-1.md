# Pre-Release Report — v1.1.1

- **Scope**: 23 commits since `v1.1.0`. Major updates span `backend/api/`, `frontend/`, and `backend/ingestion/space_pulse/`.
- **Risk Level**: Medium (includes a security-sensitive SSRF/DNS Rebinding mitigation using a custom httpx transport, and significant frontend rendering modifications including LayerCache and vendor code-splitting).
- **Verification**:
  - **Frontend API**: `pnpm run lint` (passed), `pnpm run typecheck` (passed), `pnpm run test` (278/278 tests passed).
  - **Backend API**: `ruff check` (passed), `pytest` (158/158 tests passed).
  - **Space Pulse Ingestion**: `ruff check` (passed), `pytest` (63/63 tests passed).
- **Changelog**: Complete (added detailed `[1.1.1]` release section mapping out security, performance, bugs, and accessibility changes).
- **Migration Check**: Not applicable (no database schema changes or migrations in this release).
- **Decision**: GO
- **Recommendation**: Release now (v1.1.1)

---

## Verdict Rationale
- **Security Mitigation**: The SSRF/DNS Rebinding TOCTOU vulnerability in `/api/news/article` is high-priority and has been fully mitigated.
- **Data Correctness & Integrity**: The satellite position jump/catch-up surge bug is resolved by moving to epoch-anchored dead reckoning.
- **Verification Green**: All unit, integration, and linting checks across frontend, backend, and pollers pass on the host environment.

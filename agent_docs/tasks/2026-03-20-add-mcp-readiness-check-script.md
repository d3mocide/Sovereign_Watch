# 2026-03-20 - Add MCP Readiness Check Script

## Issue
MCP setup failures (bash resolution, missing local bridge binary, missing host LSP packages) were discoverable only after wrapper startup errors, which slowed contributor onboarding and troubleshooting.

## Solution
Added a single health-check script that validates MCP prerequisites and prints direct remediation commands. Documented usage in developer setup and Claude session guidance.

## Changes
- Added `tools/mcp-language-server/check.sh`:
  - Validates `bash`, `node`, `npm`, `typescript-language-server`, `pyright-langserver`.
  - Verifies pinned bridge binary exists at `tools/bin/mcp-language-server`.
  - Detects Graph-it-live MCP entrypoint in common extension paths.
  - Emits PASS/FAIL summary and clear fix commands.
- Updated `Documentation/Development.md`:
  - Added optional quick validation command for MCP readiness.
- Updated `CLAUDE.md`:
  - Added quick local MCP readiness check reference.

## Verification
- Script syntax checked with `bash -n`.
- Script executed to confirm PASS/FAIL summary format and remediation output.

## Benefits
- Faster contributor self-service for MCP setup issues.
- Fewer trial-and-error startup failures in code sessions.
- Standardized troubleshooting entrypoint across Windows/Linux/macOS hosts.

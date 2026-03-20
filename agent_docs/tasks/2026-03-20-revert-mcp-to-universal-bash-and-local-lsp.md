# 2026-03-20 - Revert MCP to Universal Bash and Local LSP Wrappers

## Issue
Hardcoding Git Bash in `.mcp.json` improved one Windows setup but reduced portability for environments that already provide a native `bash` (WSL/Linux/macOS) and increased cross-host maintenance overhead. MCP LSP wrappers also included Docker branching that added complexity in flexible local development environments.

## Solution
Reverted MCP commands to universal `bash` invocation, introduced a portable Graph-it-Live wrapper script for path resolution, and simplified LSP wrappers to local pinned binary execution only. Updated documentation with explicit PATH guidance so users can choose WSL or Git Bash while keeping `bash` universal.

## Changes
- Updated `.mcp.json`:
  - Replaced hardcoded Git Bash executable with `command: "bash"` for all MCP servers.
  - Switched Graph-it-Live to wrapper invocation: `./tools/mcp-language-server/run-graph-it-live.sh`.
- Added `tools/mcp-language-server/run-graph-it-live.sh`:
  - Resolves Graph-it-Live extension entrypoint across common host patterns (`$HOME`, `.vscode-server`, Git Bash `/c/Users/...`, cygpath-converted `%USERPROFILE%`).
- Updated `tools/mcp-language-server/run-pyright.sh`:
  - Removed Docker branch; always uses local `tools/bin/mcp-language-server`.
  - Added explicit missing-binary error with build command hint.
- Updated `tools/mcp-language-server/run-tsserver.sh`:
  - Removed Docker branch; always uses local `tools/bin/mcp-language-server`.
  - Added explicit missing-binary error with build command hint.
- Updated `CLAUDE.md`:
  - Replaced Docker/local auto-select narrative with universal `bash` path flow.
  - Added Windows PATH guidance for WSL-vs-Git-Bash precedence.
- Updated `Documentation/Development.md`:
  - Rewrote LSP setup section to universal `bash` + local binary model.
  - Added user guidance for setting PATH so `bash` is portable across hosts.

## Verification
- Parsed `.mcp.json` successfully with Node JSON parse check.
- Shell scripts passed static syntax checks with `bash -n`.
- Wrapper behavior validated to fail fast with clear message when local MCP binary is missing.

## Benefits
- Restores cross-platform portability for MCP setup by using universal `bash`.
- Reduces maintenance complexity by removing Docker branch logic from MCP wrappers.
- Gives users explicit, actionable guidance to configure local PATH correctly on Windows.

# 2026-03-20 - Fix MCP Bash Routing on Windows Host

## Issue
MCP servers configured with `command: "bash"` were resolving to the WindowsApps WSL shim (`bash.exe`) instead of Git Bash on this host. WSL has no distro installed, so MCP startup failed immediately. Wrapper scripts also relied on current working directory, which could fail when invoked outside repo root.

## Solution
Pinned MCP server commands to Git Bash executable and made LSP wrapper scripts repo-root aware so they work regardless of invocation cwd.

## Changes
- Updated `.mcp.json`:
  - `graph-it-live`, `pyright`, `tsserver` now use `C:\\Program Files\\Git\\bin\\bash.exe` explicitly.
  - Simplified `graph-it-live` script path expression for Windows host (`/c/Users/$USERNAME/...`).
- Updated `tools/mcp-language-server/run-pyright.sh`:
  - Added script-dir/repo-root resolution and `cd` into repo root before Docker/local fallback execution.
- Updated `tools/mcp-language-server/run-tsserver.sh`:
  - Added script-dir/repo-root resolution and `cd` into repo root before Docker/local fallback execution.

## Verification
- Confirmed Git Bash command path exists and is callable.
- Confirmed graph-it-live MCP server entrypoint file exists under VS Code extensions.
- Confirmed wrappers now resolve repo-root paths from any current directory.
- Confirmed `.mcp.json` parses successfully.

## Benefits
- Removes Windows WSL-shim false-positive for `bash` and routes MCP startup through Git Bash reliably.
- Reduces cross-directory startup failures for LSP MCP wrappers.
- Improves MCP startup determinism and lowers tooling-related search/navigation latency once remaining runtime prerequisites are satisfied.

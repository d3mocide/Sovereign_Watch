# 2026-03-20 - Sync VS Code MCP Config With Root Wrappers

## Issue
The workspace-local MCP config in `.vscode/mcp.json` referenced wrapper scripts under `./Sovereign_Watch/tools/...`, which does not resolve correctly when VS Code launches the MCP commands from the repository root. The root `.mcp.json` already used the correct repo-relative wrapper paths, so the two configs diverged.

## Solution
Updated `.vscode/mcp.json` to use the same repo-relative wrapper script paths as `.mcp.json`, leaving the root config unchanged.

## Changes
- Updated `.vscode/mcp.json`:
  - `graph-it-live` now launches `./tools/mcp-language-server/run-graph-it-live.sh`
  - `pyright` now launches `./tools/mcp-language-server/run-pyright.sh`
  - `tsserver` now launches `./tools/mcp-language-server/run-tsserver.sh`

## Verification
- Confirmed `bash` resolves to Git Bash on this Windows host.
- Ran `bash ./tools/mcp-language-server/check.sh` successfully.
- Validated the workspace-local MCP JSON has no editor-reported errors.

## Benefits
- Keeps the VS Code-local MCP config aligned with the working root MCP config.
- Removes broken wrapper paths that prevented workspace-local MCP startup.
- Reduces future drift between editor-local and repo-root MCP setup.
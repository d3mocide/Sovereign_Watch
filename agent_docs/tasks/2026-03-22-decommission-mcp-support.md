# 2026-03-22-decommission-mcp-support.md

## Issue
The built-in MCP (Model Context Protocol) server support was not working correctly and was becoming a burden to maintain within the project repository. The user requested to "strip out" this support.

## Solution
Removed all MCP-related core components, scripts, and documentation. Updated the project's agent rules and development guides to exclude MCP setup and usage instructions.

## Changes
- **Deleted**:
  - `tools/mcp-language-server/` (MCP-LSP bridge source and build scripts)
  - `tools/check-mcp-context.sh` (MCP readiness check)
  - `agent_docs/mcp-agent-playbook.md` (MCP tool usage strategies)
  - `.mcp.json` (MCP server configuration)
  - `tools/bin/mcp-language-server` (Compiled bridge binary)
  - `CLAUDE.md` (Claude-specific MCP overrides)
- **Modified**:
  - `AGENTS.md`: Removed MCP Workflow Reference, added a comprehensive Docker Compose Mappings table, and synchronized the **Directory Structure Map** to reflect all 5 core ingestion pollers and auxiliary services (`js8call`, `nginx`, `tools`).
  - `.cursorrules`: Removed reference to `CLAUDE.md`.
  - `Documentation/Development.md`: Removed sections for LSP/MCP installation, tool setup, and cross-references.

## Verification
- Ran `grep -ir mcp .` to ensure no functional references remain (ignoring historical logs in `CHANGELOG.md` and archived tasks).
- Verified file deletions using `ls`.

## Benefits
- Reduced repository complexity and "token bloat" for AI agents.
- Eliminated confusing/broken setup paths for human contributors.
- Standardized rule-set in `AGENTS.md` by consolidating useful non-MCP rules.

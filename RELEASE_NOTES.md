# Release - v0.40.1 - MCP Stabilization and FCC Tower UI Patch

## Summary

This patch release hardens developer MCP workflows and corrects FCC tower interaction semantics in the frontend. It improves cross-platform MCP startup reliability, adds a deterministic agent playbook for token-efficient tool usage, and fixes tower tooltip/sidebar rendering so tower metadata is shown consistently instead of generic infrastructure fields.

## Key Updates

- **MCP Startup and Readiness Improvements**:
	- Added `tools/mcp-language-server/check.sh` for prerequisite validation and actionable remediation output.
	- Standardized `.mcp.json` to wrapper-driven startup for Graph-it-Live, Pyright, and tsserver.
	- Added robust Graph-it-Live wrapper resolution across common host environments.
- **Agent Workflow Efficiency**:
	- Added `agent_docs/mcp-agent-playbook.md` with strict first-choice MCP tool ordering to reduce duplicate search passes and token usage.
	- Added guidance pointers in `AGENTS.md` and `CLAUDE.md` so sessions discover the playbook quickly.
- **FCC Tower UI Fixes**:
	- Corrected tower pick normalization and entity typing so towers remain `tower` end-to-end.
	- Added dedicated tower branches in tooltip and sidebar components with FCC-specific details and orange visual treatment.

## Technical Details

- **MCP Wrappers**:
	- `run-pyright.sh` and `run-tsserver.sh` now use deterministic repo-root resolution with explicit missing bridge binary guidance.
	- `run-graph-it-live.sh` resolves extension entrypoints across local and remote VS Code host patterns.
- **Frontend Mapping Path**:
	- Tower pick events are normalized to point geometry and tower metadata payloads.
	- Tactical map hover/selection logic preserves tower type and clears tower hovers correctly.

## Upgrade Instructions

Pull latest `dev` and rebuild/restart services as needed:

```bash
git pull origin dev
docker compose up -d --build frontend infra-poller
```

For MCP contributors, run:

```bash
./tools/mcp-language-server/check.sh
```

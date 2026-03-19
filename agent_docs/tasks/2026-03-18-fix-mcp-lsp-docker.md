# 2026-03-18-fix-mcp-lsp-docker.md

## Issue

The `mcp-lsp` tool (responsible for semantic code navigation via LSP) was failing to start when run via Docker.
1. **Fatal Error**: The container exited with `[FATAL][core] LSP command is required`. This occurred because the `docker-compose-tools.yml` defined a `command` that only included workspace metadata but lacked the actual LSP server invocation.
2. **Missing Frontend Support**: The previous configuration only attempted to support one language server at a time, making it difficult to navigate the 30+ TypeScript components in the frontend.

## Solution

1. **Service Specialization**: Split the `mcp-lsp` service in `docker-compose-tools.yml` into two distinct services: `mcp-lsp` (defaulting to Pyright for the backend) and `mcp-tsserver` (for the frontend).
2. **Command Fix**: Updated the service commands to use the correct flags for the `isaacphi/mcp-language-server` binary:
   - `-workspace /workspace` for project root.
   - `-lsp <cmd>` for the underlying LSP server.
   - `-- <args>` for the server arguments (e.g. `--stdio`).
3. **Multi-Protocol Registration**: Enhanced `.mcp.json` to register both `pyright` and `tsserver` MCP servers, allowing the AI Analyst to navigate the full stack semantically.
4. **Dockerfile Cleanliness**: Reverted trial ENTRYPOINT changes to keep the image generic while allowing the compose file to define its specific runtime behavior.

## Changes

| File | Action | Description |
|------|--------|-------------|
| `docker-compose-tools.yml` | Modified | Split into `mcp-lsp` and `mcp-tsserver` with corrected `-workspace` and `-lsp` flags. |
| `.mcp.json` | Modified | Registered both `pyright` and `tsserver` as separate MCP servers using `docker compose run`. |
| `tools/mcp-language-server/Dockerfile` | Modified | Restored the original ENTRYPOINT to ensure compatibility with compose `command` overrides. |

## Verification

```bash
# Test Pyright (Python/Backend)
docker compose -f docker-compose-tools.yml run --rm mcp-lsp

# Output:
# [INFO][lsp] Received diagnostics ...
# [No fatal errors]

# Test tsserver (TypeScript/Frontend)
docker compose -f docker-compose-tools.yml run --rm mcp-tsserver

# Output:
# [INFO][lsp] Initializing TypeScript server...
# [No fatal errors]
```

## Benefits

- **Semantic Navigation**: The AI analyst can now follow function calls from FastAPI routers to services/models and between Deck.gl components project-wide.
- **Zero Host Dependencies**: Developers no longer need to build the Go binary locally or install npm LSPs (pyright/tsserver) on the host-machine.
- **Isolation**: Both Python and TypeScript LSPs are now isolated and pre-configured at pinned versions.

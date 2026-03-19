# 2026-03-19 — MCP LSP Configuration

## Issue

`.mcp.json` was added to the repo but the MCP language servers were not operational:

- The `pyright` and `tsserver` entries used `docker compose run`, which requires the `sovereign-mcp-lsp` Docker image to exist and the Docker daemon to be reachable.
- No Docker images were present in the environment; the Docker daemon socket (`/var/run/docker.sock`) was unavailable.
- `CLAUDE.md` already described the local binary as the intended approach, but `.mcp.json` had not been updated to match.
- No developer documentation explained how to enable the LSP setup on any platform.

## Solution

Introduced wrapper scripts that auto-detect whether Docker is reachable and route to the appropriate backend. Both paths coexist — no manual config is needed when switching between environments.

```
Docker daemon reachable? ──yes──▶ docker compose run  (pinned LSP versions)
                         ──no───▶ ./tools/bin/mcp-language-server  (local binary)
```

Built `tools/bin/mcp-language-server` from the pinned source (`isaacphi/mcp-language-server v0.1.1`, commit `46e2950`) using Go 1.24 on the host. Installed `typescript-language-server` globally via npm (pyright was already present).

## Changes

| File | Change |
| :--- | :--- |
| `tools/mcp-language-server/run-pyright.sh` | New — wrapper script; Docker → local binary fallback for Pyright LSP |
| `tools/mcp-language-server/run-tsserver.sh` | New — wrapper script; Docker → local binary fallback for tsserver LSP |
| `.mcp.json` | Updated `pyright` and `tsserver` entries to invoke wrapper scripts via `bash`; fixed hardcoded absolute path to use `.` |
| `CLAUDE.md` | Updated LSP setup section to document the two-path approach and per-platform instructions |
| `Documentation/Development.md` | Updated LSP setup section with per-platform instructions (Windows/Docker, Linux without Docker, Linux with Docker); updated Claude Code blurb |

### Wrapper script logic (`run-pyright.sh`, `run-tsserver.sh`)

```bash
if docker info >/dev/null 2>&1; then
    exec docker compose -f docker-compose-tools.yml run --rm -i mcp-lsp   # or mcp-tsserver
else
    exec ./tools/bin/mcp-language-server -workspace . -lsp pyright-langserver -- --stdio
fi
```

## Verification

- Binary built and verified against pinned commit hash.
- `tools/bin/` remains in `.gitignore` (architecture-specific; built locally).
- `run-*.sh` committed as executable (`chmod +x`); `.gitattributes` already enforces `eol=lf` for `*.sh`.
- `docker info` correctly returns non-zero in this environment, triggering the local binary path.

## Benefits

- **Windows + Docker Desktop**: Docker path used automatically — no Go install required.
- **Linux/macOS without Docker**: Local binary fallback works after one-time `build.sh` run.
- **Linux with Docker**: Docker path used; local binary available if daemon is stopped.
- **Portability**: `.mcp.json` no longer contains hardcoded absolute paths.
- **No agent impact**: Jules and Gemini do not read `.mcp.json`; this change is Claude Code-only.

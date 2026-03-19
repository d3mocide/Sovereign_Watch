#!/usr/bin/env bash
# run-tsserver.sh — starts the TypeScript LSP MCP server.
#
# Prefers Docker (reproducible, pinned LSP versions) when the daemon is
# reachable. Falls back to the locally built binary when Docker is
# unavailable (e.g. CI, Jetson Nano, Linux without Docker daemon).
#
# Invoked by .mcp.json; working directory is always the repo root.

set -euo pipefail

if docker info >/dev/null 2>&1; then
    exec docker compose -f docker-compose-tools.yml run --rm -i mcp-tsserver
else
    exec ./tools/bin/mcp-language-server \
        -workspace . \
        -lsp typescript-language-server \
        -- --stdio
fi

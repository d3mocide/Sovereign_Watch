#!/usr/bin/env bash
# run-pyright.sh — starts the Pyright LSP MCP server.
#
# Uses the locally built pinned MCP bridge binary.
#
# Invoked by .mcp.json; working directory is always the repo root.

set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
if [[ "${SCRIPT_PATH}" == */* ]]; then
    SCRIPT_DIR="${SCRIPT_PATH%/*}"
else
    SCRIPT_DIR='.'
fi
SCRIPT_DIR="$(cd "${SCRIPT_DIR}" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

if [ ! -x ./tools/bin/mcp-language-server ]; then
    echo "ERROR: tools/bin/mcp-language-server not found." >&2
    echo "Run: ./tools/mcp-language-server/build.sh" >&2
    exit 1
fi

exec ./tools/bin/mcp-language-server \
    -workspace . \
    -lsp pyright-langserver \
    -- --stdio

#!/usr/bin/env bash
# run-graph-it-live.sh — starts the Graph It Live MCP server.
#
# Uses whichever "bash" is first on PATH. Supports common extension locations
# for Linux/macOS, VS Code Remote, Git Bash on Windows, and WSL.

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

# Prefer explicit user profile location on Windows when available.
USERPROFILE_UNIX=""
if [ -n "${USERPROFILE:-}" ] && command -v cygpath >/dev/null 2>&1; then
  USERPROFILE_UNIX="$(cygpath "${USERPROFILE}")"
fi

for candidate in \
  "$HOME"/.vscode/extensions/magic5644.graph-it-live-*/dist/mcpServer.mjs \
  "$HOME"/.vscode-server/extensions/magic5644.graph-it-live-*/dist/mcpServer.mjs \
  /c/Users/"${USERNAME:-}"/.vscode/extensions/magic5644.graph-it-live-*/dist/mcpServer.mjs \
  "${USERPROFILE_UNIX}"/.vscode/extensions/magic5644.graph-it-live-*/dist/mcpServer.mjs
  do
  if [ -f "$candidate" ]; then
    exec node "$candidate"
  fi
done

echo "ERROR: graph-it-live MCP entrypoint not found." >&2
echo "Install the VS Code extension 'magic5644.graph-it-live' for your current user." >&2
exit 1

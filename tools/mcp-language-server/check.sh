#!/usr/bin/env bash
# check.sh — MCP/LSP readiness check for local development.
#
# Verifies the host can run project MCP servers and prints actionable fixes.

set -u -o pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
if [[ "${SCRIPT_PATH}" == */* ]]; then
  SCRIPT_DIR="${SCRIPT_PATH%/*}"
else
  SCRIPT_DIR='.'
fi
SCRIPT_DIR="$(cd "${SCRIPT_DIR}" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

failures=0
warnings=0

ok() {
  echo "[OK]   $*"
}

warn() {
  warnings=$((warnings + 1))
  echo "[WARN] $*"
}

fail() {
  failures=$((failures + 1))
  echo "[FAIL] $*"
}

check_cmd() {
  local cmd="$1"
  local label="$2"
  local fix="$3"

  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$label: $(command -v "$cmd")"
  else
    fail "$label not found on PATH."
    echo "       Fix: $fix"
  fi
}

echo "MCP readiness check"
echo "repo: ${REPO_ROOT}"
echo

if command -v bash >/dev/null 2>&1; then
  ok "bash: $(command -v bash)"
elif [ -n "${BASH_VERSION:-}" ]; then
  ok "bash: current shell is bash (${BASH_VERSION})"
  warn "bash command is not discoverable via PATH in this shell."
  echo "       Fix (Windows Git Bash): add C:/Program Files/Git/bin to PATH"
  echo "       Fix (WSL): install distro (wsl --install -d Ubuntu)"
else
  fail "bash not found on PATH."
  echo "       Fix (Windows Git Bash): add C:/Program Files/Git/bin to PATH"
  echo "       Fix (WSL): install distro (wsl --install -d Ubuntu)"
fi

check_cmd node "Node.js" "Install Node.js 20+ and reopen terminal"
check_cmd npm "npm" "Install npm with Node.js and reopen terminal"

if [ -x ./tools/bin/mcp-language-server ]; then
  ok "Pinned MCP bridge binary: ./tools/bin/mcp-language-server"
else
  fail "Pinned MCP bridge binary missing: ./tools/bin/mcp-language-server"
  echo "       Fix: ./tools/mcp-language-server/build.sh"
fi

check_cmd typescript-language-server "TypeScript LSP" "npm install -g typescript typescript-language-server"
check_cmd pyright-langserver "Pyright LSP" "npm install -g pyright"

if command -v go >/dev/null 2>&1; then
  ok "Go: $(go version 2>/dev/null || true)"
else
  warn "Go not found on PATH."
  echo "       Needed only for local MCP bridge build: ./tools/mcp-language-server/build.sh"
fi

graph_found=0
for candidate in \
  "$HOME"/.vscode/extensions/magic5644.graph-it-live-*/dist/mcpServer.mjs \
  "$HOME"/.vscode-server/extensions/magic5644.graph-it-live-*/dist/mcpServer.mjs \
  /c/Users/"${USERNAME:-}"/.vscode/extensions/magic5644.graph-it-live-*/dist/mcpServer.mjs
  do
  if compgen -G "$candidate" >/dev/null 2>&1; then
    graph_found=1
    ok "Graph-it-live entrypoint found ($candidate)"
    break
  fi
done

if [ "$graph_found" -eq 0 ]; then
  warn "Graph-it-live extension entrypoint not found."
  echo "       Install VS Code extension: magic5644.graph-it-live"
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "MCP readiness: PASS (warnings: $warnings)"
  exit 0
fi

echo "MCP readiness: FAIL (errors: $failures, warnings: $warnings)"
exit 1

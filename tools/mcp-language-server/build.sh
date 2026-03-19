#!/usr/bin/env bash
# build.sh — builds mcp-language-server from pinned source and places the
#             binary at tools/bin/mcp-language-server.
#
# Run from the repository root OR from this directory:
#   ./tools/mcp-language-server/build.sh
#
# Requirements: git, go 1.24+
#
# Why build locally instead of `go install ...@latest`?
#   - Pins to a known commit. No silent upstream update can change what runs.
#   - You can inspect the source before building.
#   - The resulting binary is architecture-specific; cross-compile below if
#     you need a different target (e.g. arm64 for Jetson Nano).
#
# Cross-compile examples:
#   GOOS=linux GOARCH=arm64 ./tools/mcp-language-server/build.sh   # Jetson Nano
#   GOOS=darwin GOARCH=arm64 ./tools/mcp-language-server/build.sh  # Apple Silicon

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUT="${REPO_ROOT}/tools/bin/mcp-language-server"

# Read pinned version from VERSION file
source <(grep -v '^#' "${SCRIPT_DIR}/VERSION" | grep -v '^$')

TMPDIR="$(mktemp -d)"
trap 'rm -rf "${TMPDIR}"' EXIT

echo "==> Cloning ${UPSTREAM_REPO} at tag ${TAG} (commit ${COMMIT})"
git clone --branch "${TAG}" --depth 1 "${UPSTREAM_REPO}" "${TMPDIR}/src"

# Verify we got the exact commit we expect
ACTUAL_COMMIT="$(git -C "${TMPDIR}/src" rev-parse HEAD)"
if [ "${ACTUAL_COMMIT}" != "${COMMIT}" ]; then
  echo "ERROR: commit mismatch"
  echo "  expected: ${COMMIT}"
  echo "  got:      ${ACTUAL_COMMIT}"
  echo "The tag may have been moved. Update VERSION after manual review."
  exit 1
fi
echo "==> Commit verified: ${ACTUAL_COMMIT}"

mkdir -p "${REPO_ROOT}/tools/bin"
echo "==> Building ${GOOS:-$(go env GOOS)}/${GOARCH:-$(go env GOARCH)} binary"
cd "${TMPDIR}/src"
go build -trimpath -ldflags="-s -w" -o "${OUT}" .

echo "==> Binary written to ${OUT}"
echo "    SHA-256: $(sha256sum "${OUT}" | awk '{print $1}')"
echo ""
echo "    Update tools/mcp-language-server/VERSION with the expected hash"
echo "    if you rebuilt after changing GOOS/GOARCH."

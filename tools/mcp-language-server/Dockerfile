# Dockerfile — builds and runs mcp-language-server in a container.
#
# Use this if you cannot or do not want to install Go on the host.
# The container needs access to your LSP servers (typescript-language-server,
# pyright) and to your workspace, so it runs with bind mounts.
#
# Build:
#   docker build -t sovereign-mcp-lsp ./tools/mcp-language-server
#
# Run (example — Claude Code calls this via .mcp.json "command"):
#   docker run --rm -i \
#     -v /path/to/Sovereign_Watch:/workspace \
#     sovereign-mcp-lsp \
#     --workspace /workspace
#
# To wire this into .mcp.json instead of the local binary, change "command"
# and "args" to:
#   "command": "docker",
#   "args": ["run", "--rm", "-i",
#            "-v", "<absolute-path-to-repo>:/workspace",
#            "sovereign-mcp-lsp",
#            "--workspace", "/workspace"]
#
# Note: LSP servers (typescript-language-server, pyright) must also be
# available inside the container. This image installs them from npm at
# the pinned versions listed in COPY commands below.

ARG GO_VERSION=1.24
ARG NODE_VERSION=20

# ── Stage 1: build the Go binary ─────────────────────────────────────────────
FROM golang:${GO_VERSION}-alpine AS builder

# Pinned source coordinates — keep in sync with VERSION
ARG UPSTREAM_REPO=https://github.com/isaacphi/mcp-language-server
ARG TAG=v0.1.1
ARG COMMIT=46e2950b7969334780675e7797e13f140d2d42ac

RUN apk add --no-cache git

RUN git clone --branch "${TAG}" --depth 1 "${UPSTREAM_REPO}" /src && \
    actual="$(git -C /src rev-parse HEAD)" && \
    [ "${actual}" = "${COMMIT}" ] || \
      (echo "commit mismatch: expected ${COMMIT}, got ${actual}" && exit 1)

WORKDIR /src
RUN go build -trimpath -ldflags="-s -w" -o /mcp-language-server .

# ── Stage 2: runtime image with Node LSP servers ─────────────────────────────
FROM node:${NODE_VERSION}-alpine

COPY --from=builder /mcp-language-server /usr/local/bin/mcp-language-server

# Install LSP servers at pinned versions
RUN npm install -g \
      typescript@5.8.3 \
      typescript-language-server@4.3.4 \
      pyright@1.1.398 \
    && npm cache clean --force

ENTRYPOINT ["/usr/local/bin/mcp-language-server"]

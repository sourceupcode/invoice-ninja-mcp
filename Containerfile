# SourceUp build of Fuciuss/invoice-ninja-mcp.
#
# Two changes over upstream, both required for in-cluster use:
#   * streamable-HTTP transport instead of stdio (stdio opens no port, so it
#     cannot back a Kubernetes Service),
#   * a write guard in src/helpers/guard.ts, because a v5 API token cannot be
#     scoped — see that file for the middleware evidence.
#
# ---------------------------------------------------------------------------
# Base choice
# ---------------------------------------------------------------------------
# RUNTIME is distroless: cgr.dev/chainguard/node, which is Node 26.13.0 with no
# package manager (no apk/apt), runs as uid 65532 by default, and is rebuilt by
# Chainguard daily so CVE fixes arrive without us patching a distro.
#
#   - It is 181 MB versus 257 MB for an alpine:3.24 + Node runtime, and the
#     saving is the package manager and shell tooling we never run.
#   - Google's gcr.io/distroless/nodejs cannot be used: its highest Node major
#     is 18. Chainguard tracks current Node.
#   - The tag is not digest-pinned on purpose. Chainguard republishes the same
#     tag with patched bases; pinning a digest would freeze known CVEs into the
#     image. The digest resolved at time of writing is
#     sha256:4ad7301975908b87d321af8b9ed41630dc69015976269965ee459c27541df252
#     (index, multi-arch) — recorded here for audit, not pinned.
#
# BUILD stage is alpine:3.24 (current stable) plus the checksum-verified musl
# Node tarball. It is thrown away, so its shell and apk never reach the shipped
# image. busybox was tried first and CANNOT run Node at all: the official Node
# builds need libdl.so.2, libstdc++.so.6 and libgcc_s.so.1 plus a loader, and
# busybox:latest ships only glibc's ld.so/libc/libm/libpthread/libnss/libresolv.
# Alpine carries a musl loader, so it needs only libstdc++ and libatomic added —
# Node 26 links libatomic.so.1, which Node 22 did not; without it the build dies
# with "Error loading shared library libatomic.so.1".
#
# Copying the musl-built node_modules onto the glibc runtime is safe here
# because the production dependency tree is pure JavaScript: 0 native .node
# binaries (only @modelcontextprotocol/sdk and zod, both JS).
#
# pnpm is NOT packaged in Alpine repos, and it cannot come from corepack either:
# Node 25+ stopped shipping corepack (verified against this tarball — bin/ holds
# node, npm and npx only). So pnpm is installed with the npm Node ships, into
# the throwaway build stage, pinned rather than resolved from `@latest`.
#
# Two-stage on purpose: the runtime stage has no package manager at all, and
# deps install with --prod so devDependencies (typescript, shx, @types/node)
# never reach the shipped image.
#
# NOTE: this builds dist/ from the checkout, so dist/ must already be compiled
# (`pnpm run build`) before podman build runs. The publish workflow does exactly
# that as its first step.

ARG PNPM_VERSION=9.15.9

# ---------- build ----------
FROM alpine:3.24 AS deps

ARG NODE_VERSION=26.13.0
ARG NODE_SHA256=1cae5273e14d36ddb0e605bbcde602bbad9f72301c66afbc94fa764220d9d9f5
ARG PNPM_VERSION
RUN apk upgrade --no-cache && \
    apk add --no-cache libstdc++ libatomic && \
    wget -qO /tmp/node.tar.xz \
      "https://nodejs.org/dist/latest-v26.x/node-v${NODE_VERSION}-linux-x64-musl.tar.xz" && \
    echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c - && \
    tar -xJf /tmp/node.tar.xz -C /opt && \
    mv /opt/node-v"${NODE_VERSION}"-linux-x64-musl /opt/node && \
    ln -s /opt/node/bin/node /usr/local/bin/node && \
    ln -s /opt/node/bin/npm  /usr/local/bin/npm && \
    ln -s /opt/node/bin/npx  /usr/local/bin/npx && \
    rm /tmp/node.tar.xz

WORKDIR /opt/mcp
# Manifests only, so editing src/ reuses this cached layer.
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts is required: package.json declares a `prepare` lifecycle
# script (npm run build). Under --prod pnpm still runs it, which would drag the
# TypeScript toolchain into this stage.
RUN npm install -g --prefix /usr/local "pnpm@${PNPM_VERSION}" && \
    pnpm install --frozen-lockfile --prod --ignore-scripts

# ---------- runtime (distroless) ----------
FROM cgr.dev/chainguard/node:latest

WORKDIR /app
COPY --from=deps /opt/mcp/node_modules /app/node_modules
COPY dist /app/dist
COPY package.json /app/package.json

ENV NODE_ENV=production \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=8000 \
    MCP_PATH=/mcp

EXPOSE 8000
# Already 65532 in this base; stated explicitly so the guarantee is local.
USER 65532:65532

# The base sets ENTRYPOINT ["/usr/bin/node"], which would ignore the script, so
# the entrypoint is replaced rather than appended to.
ENTRYPOINT ["/usr/bin/node", "/app/dist/index.js"]

# SourceUp build of Fuciuss/invoice-ninja-mcp.
#
# Two changes over upstream, both required for in-cluster use:
#   * streamable-HTTP transport instead of stdio (stdio opens no port, so it
#     cannot back a Kubernetes Service),
#   * a write guard in src/helpers/guard.ts, because a v5 API token cannot be
#     scoped — see that file for the middleware evidence.
#
# Base choice and why:
#   busybox was tried first and CANNOT run Node. The official Node builds need
#   libdl.so.2, libstdc++.so.6 and libgcc_s.so.1 plus their dynamic loader, and
#   busybox:latest ships only glibc's ld.so/libc/libm/libpthread/libnss/libresolv
#   (no libdl, no libstdc++, no libgcc_s). Alpine already carries a musl loader,
#   so it takes the musl Node build and only needs libstdc++ added.
#
# Node is fetched as the pinned, checksum-verified musl tarball rather than
# FROM node:alpine, so the base carries no toolchain nobody uses at runtime.
# pnpm comes from the corepack bundled in that tarball — pnpm is NOT packaged in
# Alpine 3.21 repos — and is pinned explicitly rather than resolved from
# `pnpm@latest`.
#
# Two-stage on purpose: the runtime stage has no package manager at all, and
# deps install with --prod so devDependencies (typescript, shx, @types/node)
# never reach the shipped image.
#
# NOTE: this builds dist/ from the checkout, so dist/ must already be compiled
# (`pnpm run build`) before podman build runs. The publish workflow does exactly
# that as its first step.

ARG PNPM_VERSION=9.15.9

# ---------- deps ----------
FROM alpine:3.21 AS deps

ARG NODE_VERSION=22.23.4
ARG NODE_SHA256=38355b952f0392b91703d38a0d9af84eb0ff77d69828ca4bc8cc3bc3af80a720
ARG PNPM_VERSION
RUN apk add --no-cache libstdc++ && \
    wget -qO /tmp/node.tar.xz \
      "https://nodejs.org/dist/latest-v22.x/node-v${NODE_VERSION}-linux-x64-musl.tar.xz" && \
    echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c - && \
    tar -xJf /tmp/node.tar.xz -C /opt && \
    mv /opt/node-v"${NODE_VERSION}"-linux-x64-musl /opt/node && \
    ln -s /opt/node/bin/node     /usr/local/bin/node && \
    ln -s /opt/node/bin/corepack /usr/local/bin/corepack && \
    rm /tmp/node.tar.xz

# COREPACK_HOME is pinned: corepack caches under $HOME, which is unset/different
# under the build user and would silently break `prepare`.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/opt/corepack
WORKDIR /opt/mcp
# Manifests only, so editing src/ reuses this cached layer.
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts is required: package.json declares a `prepare` lifecycle
# script (npm run build). Under --prod pnpm still runs it, which would drag the
# TypeScript toolchain into a stage that has none — and dist/ is already built
# outside this image by CI's `pnpm run build` step.
RUN corepack enable pnpm && \
    corepack prepare "pnpm@${PNPM_VERSION}" --activate && \
    pnpm install --frozen-lockfile --prod --ignore-scripts

# ---------- runtime ----------
FROM alpine:3.21

ARG NODE_VERSION=22.23.4
ARG NODE_SHA256=38355b952f0392b91703d38a0d9af84eb0ff77d69828ca4bc8cc3bc3af80a720
RUN apk add --no-cache libstdc++ && \
    wget -qO /tmp/node.tar.xz \
      "https://nodejs.org/dist/latest-v22.x/node-v${NODE_VERSION}-linux-x64-musl.tar.xz" && \
    echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c - && \
    tar -xJf /tmp/node.tar.xz -C /opt && \
    mv /opt/node-v"${NODE_VERSION}"-linux-x64-musl /opt/node && \
    ln -s /opt/node/bin/node /usr/local/bin/node && \
    rm /tmp/node.tar.xz

COPY --from=deps /opt/mcp/node_modules /opt/mcp/node_modules
COPY dist /opt/mcp/dist
COPY package.json /opt/mcp/package.json

ENV NODE_ENV=production \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=8000 \
    MCP_PATH=/mcp

WORKDIR /opt/mcp
EXPOSE 8000
USER 65532:65532

ENTRYPOINT ["node", "/opt/mcp/dist/index.js"]

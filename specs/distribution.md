# Distribution & Installation

## Motivation

When I want to use this MCP server with Claude, I want a simple one-liner install that doesn't require cloning repos or building from source.

## Success Criteria

- Installable via `npx invoice-ninja-mcp-server` one-liner in MCP config
- Works with Claude Desktop, Claude Code, and Cursor
- API credentials passed via environment variables in MCP config (not hardcoded)
- README includes copy-pasteable config for all three clients
- No runtime dependencies beyond Node.js >= 18

## Core Concepts

### npx Distribution
The package is published to npm with a `bin` field pointing to `dist/index.js`. The shebang (`#!/usr/bin/env node`) makes it directly executable. Users configure it as:

```json
{
  "mcpServers": {
    "invoice-ninja": {
      "command": "npx",
      "args": ["-y", "invoice-ninja-mcp-server"],
      "env": {
        "INVOICE_NINJA_URL": "https://your-instance.invoicing.co",
        "INVOICE_NINJA_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

### Environment Variables
| Variable | Required | Description |
|---|---|---|
| `INVOICE_NINJA_URL` | Yes | Base URL (e.g., `https://invoicing.co` or self-hosted) |
| `INVOICE_NINJA_API_TOKEN` | Yes | API token from Settings > Account Management > API Tokens |

### Client Config Locations
- **Claude Desktop (macOS)**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop (Windows)**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Claude Code**: `claude mcp add` CLI command
- **Cursor**: `.cursor/mcp.json` in project root or `~/.cursor/mcp.json` global

## Image distribution (this fork)

Upstream ships npm only. This fork is deployed as a container image over streamable-HTTP, because an in-cluster
Kubernetes Service needs a port and stdio opens none. So the artifacts are:

| Artifact | Source | Notes |
|---|---|---|
| `ghcr.io/sourceupcode/invoice-ninja-mcp:<version>` and the bare number | Release workflow, on the release event | Built from the tag's own source, so an image always corresponds to the commit that version shipped |
| `:latest` | Release workflow | Points at the highest release tag, not whatever built last |
| `:main` and `:sha-<short>` | Build & Publish workflow, on push | Never used by a Deployment; a Deployment pins a version |

**Invariant: every `v*` git tag has a matching image.** `release.yml` verifies exactly that and fails if one is missing.
When a tag cannot satisfy it, the tag is deleted rather than the image fabricated: on 2026-11-24 `v0.6.0` pinned
`NODE_VERSION=26.13.0` but fetched it from `latest-v26.x/`, which keeps only the newest patch, so 26.13.0 had vanished
from that directory and the build could not be reproduced from its own source. Publishing newer source under the
`v0.6.0` label would have produced an image that lied about what it contained. Builds fetch from the immutable
`/dist/v<version>/` path now, which is also what makes a `sha256` pin mean anything.

Tests run before an image is built, in both publish paths. Older tags are reproduced without tests, since several predate
the test script; only the newest release's image is gated.

## Current State

- Published to npm as `invoice-ninja-mcp-server`
- `package.json` has `bin` field pointing to `dist/index.js`
- `#!/usr/bin/env node` shebang in `src/index.ts`
- Build produces executable `dist/index.js`
- README uses `npx -y invoice-ninja-mcp-server` with configs for Claude Desktop, Claude Code, and Cursor
- Local development instructions in separate section
- npm publication is upstream's path; this fork deploys the GHCR image described above


## Out of Scope

- npm publishing from this fork (upstream's channel; the fork deploys the GHCR image)
- Auto-update mechanism

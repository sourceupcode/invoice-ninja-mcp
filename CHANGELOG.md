# Changelog

## [0.5.1](https://github.com/sourceupcode/invoice-ninja-mcp/compare/v0.5.0...v0.5.1) (2026-11-11)


### Bug Fixes

* **tasks:** always send the existing time_log when updating a task ([3139cb5](https://github.com/sourceupcode/invoice-ninja-mcp/commit/3139cb517374c897d6654ed11f209ba8560c3a84))
* **tasks:** carry the task description into time_log entry notes ([#11](https://github.com/sourceupcode/invoice-ninja-mcp/issues/11)) ([459a355](https://github.com/sourceupcode/invoice-ninja-mcp/commit/459a355969590c5bac0fb6a40b1896ed38e88c8d))

## [0.5.0](https://github.com/sourceupcode/invoice-ninja-mcp/compare/v0.4.1...v0.5.0) (2026-11-05)


### Features

* **invoices:** add update-invoice-item for safe single-line edits ([a5feae3](https://github.com/sourceupcode/invoice-ninja-mcp/commit/a5feae383b4affa9a32ea229bed7f1673889210b))

## [0.4.1](https://github.com/sourceupcode/invoice-ninja-mcp/compare/v0.4.0...v0.4.1) (2026-11-05)


### Bug Fixes

* **guard:** make INVOICE_NINJA_ALLOWED_TOOLS additive, not a replacement list ([e7790a0](https://github.com/sourceupcode/invoice-ninja-mcp/commit/e7790a0230c1359614c0974dee45ed5e781b31bf))
* **tasks:** write the per-entry note into the time_log note slot ([64af881](https://github.com/sourceupcode/invoice-ninja-mcp/commit/64af881af5f016a035b52820c11c62bb13f6e6a2))

## [0.4.0](https://github.com/sourceupcode/invoice-ninja-mcp/compare/v0.3.0...v0.4.0) (2026-11-05)


### Features

* **tasks:** show the invoice's itemized line items, and fix four display defects ([ed51b97](https://github.com/sourceupcode/invoice-ninja-mcp/commit/ed51b97dd4c3949d5d9a0bc31065f54cdd81ed7f))

## [0.3.0](https://github.com/sourceupcode/invoice-ninja-mcp/compare/v0.2.0...v0.3.0) (2026-11-05)


### Features

* **tasks:** register time entries as individual tasks, keeping their notes ([7a91193](https://github.com/sourceupcode/invoice-ninja-mcp/commit/7a911930a26e6b5a9249ba4069c286955c76b641))

## [0.2.0](https://github.com/sourceupcode/invoice-ninja-mcp/compare/v0.1.2...v0.2.0) (2026-11-05)


### Features

* **tasks:** add task tools, including tasks-for-an-invoice ([9dcc510](https://github.com/sourceupcode/invoice-ninja-mcp/commit/9dcc510b58cd6b424a38f2c4cc2c6c274d0e12ed))

## [0.1.2](https://github.com/sourceupcode/invoice-ninja-mcp/compare/v0.1.1...v0.1.2) (2026-11-04)


### Bug Fixes

* **ci:** detect the release tag from the merge push, not the release event ([d74fece](https://github.com/sourceupcode/invoice-ninja-mcp/commit/d74fece4ff72cbf1ab92d4738930b3e3a5d457b3))
* **ci:** prevent release-PR approval runs at the trigger, not the job ([d71393a](https://github.com/sourceupcode/invoice-ninja-mcp/commit/d71393a7a180855a4e96e41d0fe65f048be943d4))
* **ci:** publish release images in the release run, reconciling every tag ([1a7e146](https://github.com/sourceupcode/invoice-ninja-mcp/commit/1a7e146fb8a0258c98d0546a3a682a3dcf5945c0))
* **ci:** stop release-PR runs piling up as action_required ([1092a39](https://github.com/sourceupcode/invoice-ninja-mcp/commit/1092a391a3c678f3d50545dd3a02f058ae9affc2))
* **deps:** upgrade every dependency to its current release ([692eedb](https://github.com/sourceupcode/invoice-ninja-mcp/commit/692eedb568c51b3c7424d9c0b7bfe066cd2b3ecb))

## [0.1.1](https://github.com/sourceupcode/invoice-ninja-mcp/compare/v0.1.0...v0.1.1) (2026-11-04)


### Bug Fixes

* **ci:** publish semver image tags from the release event, not the tag push ([dbd38b3](https://github.com/sourceupcode/invoice-ninja-mcp/commit/dbd38b36bfb9cf9e1a25003cfeac5332b989c2aa))

## [0.1.0](https://github.com/sourceupcode/invoice-ninja-mcp/compare/v0.0.0...v0.1.0) (2026-11-04)


### ⚠ BREAKING CHANGES

* the server no longer speaks stdio. The entrypoint now listens on MCP_PORT (default 8000) at MCP_PATH (default /mcp) and speaks MCP streamable-HTTP, so launching it as a stdio subprocess — how upstream is meant to be used from a local MCP client config — no longer works. Use the HTTP endpoint instead.

### Features

* serve MCP over streamable-HTTP and block mutating tools by default ([e8c3e24](https://github.com/sourceupcode/invoice-ninja-mcp/commit/e8c3e24a3431d2bd0727a9c8bc2772ee0659c571))

## Changelog

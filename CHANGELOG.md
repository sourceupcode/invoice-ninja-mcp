# Changelog

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

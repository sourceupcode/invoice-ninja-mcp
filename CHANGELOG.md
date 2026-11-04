# Changelog

## 1.0.0 (2026-11-04)


### ⚠ BREAKING CHANGES

* the server no longer speaks stdio. The entrypoint now listens on MCP_PORT (default 8000) at MCP_PATH (default /mcp) and speaks MCP streamable-HTTP, so launching it as a stdio subprocess — how upstream is meant to be used from a local MCP client config — no longer works. Use the HTTP endpoint instead.

### Features

* serve MCP over streamable-HTTP and block mutating tools by default ([e8c3e24](https://github.com/sourceupcode/invoice-ninja-mcp/commit/e8c3e24a3431d2bd0727a9c8bc2772ee0659c571))

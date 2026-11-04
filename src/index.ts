#!/usr/bin/env node

// SourceUp fork of Fuciuss/invoice-ninja-mcp.
//
// Two deliberate changes from upstream:
//   1. The transport is streamable-HTTP, not stdio. Upstream is stdio-only,
//      which is a local-process protocol: it opens no port and cannot be
//      reached as a Kubernetes Service. In-cluster use requires the HTTP form.
//   2. Every tool call passes through the write guard (helpers/guard.js).
//
// McpServer is constructed with the per-session singleton option so a single
// long-lived server instance is correct for stateless HTTP requests; without
// it, the SDK expects one McpServer per session.

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerAllTools } from "./tools/tool-factory.js";

const HOST = process.env.MCP_HOST || "0.0.0.0";
const PORT = Number(process.env.MCP_PORT || 8000);
// Mount path behind the Gateway path rewrite. Keep in sync with the
// HTTPRoute rule in manifests/apps/invoiceninja/.
const PATH = process.env.MCP_PATH || "/mcp";

// One McpServer per session: this SDK version's McpServerOptions carries only
// maxToolInputElements, so there is no shared-instance mode to opt into.
function newServer(): McpServer {
  const server = new McpServer({ name: "invoice-ninja", version: "1.0.0" });
  registerAllTools(server);
  return server;
}

const transports: Record<string, StreamableHTTPServerTransport> = {};

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // Plain probes for Kubernetes liveness/readiness — must not require auth.
  if (url.pathname === "/healthz" || url.pathname === "/readyz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (!url.pathname.startsWith(PATH)) {
    res.writeHead(404).end();
    return;
  }

  if (req.method === "GET") {
    // No GET stream: advertise that plainly instead of hanging a probe.
    res.writeHead(405, { allow: "POST", "content-type": "application/json" });
    res.end(JSON.stringify({ error: "streamable-http POST only" }));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" }).end();
    return;
  }

  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    res.writeHead(400).end();
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports[sessionId]) {
    await transports[sessionId].handleRequest(req, res, body);
    return;
  }

  if (!sessionId && isInitializeRequest(body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid: string) => {
        transports[sid] = transport;
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };

    const mcp = newServer();
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }

  res.writeHead(400, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "missing or unknown mcp-session-id" }));
});

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 4_194_304) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

server.listen(PORT, HOST, () => {
  console.error(`invoice-ninja-mcp listening on ${HOST}:${PORT}${PATH}`);
});

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}

import { readFileSync } from "node:fs";
import { createTool } from "../../helpers/create-tool.js";
import { checkTool } from "../../helpers/guard.js";
import { toolFactories } from "../tool-factory.js";

function version(): string {
  try {
    // dist/tools/system/server-status.tool.js -> ../../../package.json
    const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
    return String(pkg.version ?? "unknown");
  } catch {
    return "unknown";
  }
}

function hostOf(url: string | undefined): string {
  if (!url) return "not set";
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable)";
  }
}

const ServerStatusTool = createTool(
  "server-status",
  "Report which build of this MCP server is running and which tools its write guard permits. Read-only, no Invoice Ninja call. Use it before reasoning about tool behaviour: a rule learned from another version's source, or from a local clone that trails the deployed image, describes a build that is not running.",
  {},
  async () => {
    const tools = toolFactories().map((factory) => factory());
    const blocked = tools.filter((t) => !checkTool(t.name).allowed).map((t) => t.name);
    const allowedByEnv = (process.env.INVOICE_NINJA_ALLOWED_TOOLS || "").trim() || "(unset)";
    const deniedByEnv = (process.env.INVOICE_NINJA_DENIED_TOOLS || "").trim() || "(unset)";

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Build: invoice-ninja-mcp ${version()} (node ${process.version})`,
            `Instance host: ${hostOf(process.env.INVOICE_NINJA_URL)} (API token not shown)`,
            `Guard: default-deny for mutations; INVOICE_NINJA_ALLOW_WRITES=${
              ["1", "true", "yes", "on"].includes((process.env.INVOICE_NINJA_ALLOW_WRITES || "").toLowerCase())
                ? "on — every mutation permitted"
                : "off"
            }`,
            `INVOICE_NINJA_ALLOWED_TOOLS: ${allowedByEnv}`,
            `INVOICE_NINJA_DENIED_TOOLS: ${deniedByEnv}`,
            `Tools in this build: ${tools.length}`,
            `Refused by the guard in this build (${blocked.length}): ${blocked.join(", ") || "(none)"}`,
          ].join("\n"),
        },
      ],
    };
  },
);

export default ServerStatusTool;

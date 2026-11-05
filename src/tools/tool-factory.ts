import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolDefinition } from "../helpers/types.js";

import { SystemTools } from "./system/index.js";
import { InvoiceTools } from "./invoices/index.js";
import { ClientTools } from "./clients/index.js";
import { ProductTools } from "./products/index.js";
import { PaymentTools } from "./payments/index.js";
import { QuoteTools } from "./quotes/index.js";
import { ExpenseTools } from "./expenses/index.js";
import { TaskTools } from "./tasks/index.js";

function registerGroup(server: McpServer, tools: Array<() => ToolDefinition>) {
  tools
    .map((factory) => factory())
    .forEach((tool) => server.tool(tool.name, tool.description, tool.schema, tool.handler));
}

export function registerAllTools(server: McpServer) {
  registerGroup(server, SystemTools);
  registerGroup(server, InvoiceTools);
  registerGroup(server, ClientTools);
  registerGroup(server, ProductTools);
  registerGroup(server, PaymentTools);
  registerGroup(server, QuoteTools);
  registerGroup(server, ExpenseTools);
  registerGroup(server, TaskTools);
}

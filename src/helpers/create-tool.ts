import { ZodRawShape } from "zod";
import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolDefinition } from "./types.js";
import { checkTool } from "./guard.js";

// Wraps every upstream handler so the write guard runs before any HTTP call
// to Invoice Ninja. A blocked tool returns an isError result the model can
// read, rather than throwing and surfacing an opaque transport failure.
export const createTool =
  <Args extends ZodRawShape>(
    name: string,
    description: string,
    schema: Args,
    handler: ToolCallback<Args>,
  ): (() => ToolDefinition<Args>) =>
  () => {
    const guarded = (async (args: unknown, extra: unknown) => {
      const verdict = checkTool(name);
      if (!verdict.allowed) {
        return {
          content: [{ type: "text" as const, text: `Blocked: ${verdict.reason}` }],
          isError: true,
        };
      }
      return (handler as unknown as (a: unknown, e: unknown) => Promise<never>)(args, extra);
    }) as unknown as ToolCallback<Args>;

    return { name, description, schema, handler: guarded };
  };

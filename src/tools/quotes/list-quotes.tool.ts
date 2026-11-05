import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";
import { formatPagination } from "../../helpers/pagination.js";

const ListQuotesTool = createTool(
  "list-quotes",
  "List quotes in Invoice Ninja. Supports filtering by client and search term.",
  {
    page: z.number().optional().describe("Page number (default: 1)"),
    per_page: z.number().optional().describe("Results per page (default: 20)"),
    client_id: z.string().optional().describe("Filter by client hashed ID"),
    search: z.string().optional().describe("Search quotes"),
  },
  async ({ page, per_page, client_id, search }) => {
    const params: Record<string, string> = {
      per_page: String(per_page ?? 20),
      page: String(page ?? 1),
      include: "client",
    };
    if (client_id) params.client_id = client_id;
    if (search) params.filter = search;

    const response = await apiGet<{ data: Array<Record<string, unknown>>; meta: Record<string, unknown> }>(
      "/quotes",
      params,
    );

    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error listing quotes: ${response.error}` }],
        isError: true,
      };
    }

    const quotes = response.result.data;
    if (quotes.length === 0) {
      return { content: [{ type: "text" as const, text: "No quotes found." }] };
    }

    const lines = quotes.map((q) => {
      const client = q.client as Record<string, unknown> | undefined;
      return [
        `ID: ${q.id}`,
        `Number: ${q.number || "N/A"}`,
        `Client: ${client?.display_name || q.client_id || "N/A"}`,
        `Amount: ${q.amount}`,
        `Status ID: ${q.status_id}`,
        `Date: ${q.date}`,
        `Valid Until: ${q.due_date || "N/A"}`,
      ].join(" | ");
    });

    const header = formatPagination(response.result.meta, quotes.length, "quotes");

    return {
      content: [{ type: "text" as const, text: `${header}\n\n${lines.join("\n")}` }],
    };
  },
);

export default ListQuotesTool;

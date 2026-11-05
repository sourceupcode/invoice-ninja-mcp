import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";
import { formatPagination } from "../../helpers/pagination.js";

const ListExpensesTool = createTool(
  "list-expenses",
  "List expenses in Invoice Ninja. Supports filtering by client and vendor.",
  {
    page: z.number().optional().describe("Page number (default: 1)"),
    per_page: z.number().optional().describe("Results per page (default: 20)"),
    client_id: z.string().optional().describe("Filter by client hashed ID"),
    vendor_id: z.string().optional().describe("Filter by vendor hashed ID"),
    search: z.string().optional().describe("Search expenses"),
  },
  async ({ page, per_page, client_id, vendor_id, search }) => {
    const params: Record<string, string> = {
      per_page: String(per_page ?? 20),
      page: String(page ?? 1),
    };
    if (client_id) params.client_id = client_id;
    if (vendor_id) params.vendor_id = vendor_id;
    if (search) params.filter = search;

    const response = await apiGet<{ data: Array<Record<string, unknown>>; meta: Record<string, unknown> }>(
      "/expenses",
      params,
    );

    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error listing expenses: ${response.error}` }],
        isError: true,
      };
    }

    const expenses = response.result.data;
    if (expenses.length === 0) {
      return { content: [{ type: "text" as const, text: "No expenses found." }] };
    }

    const lines = expenses.map((e) =>
      [
        `ID: ${e.id}`,
        `Amount: ${e.amount}`,
        `Date: ${e.date || "N/A"}`,
        `Category: ${e.category_id || "N/A"}`,
        `Vendor: ${e.vendor_id || "N/A"}`,
        `Public Notes: ${e.public_notes || "N/A"}`,
      ].join(" | "),
    );

    const header = formatPagination(response.result.meta, expenses.length, "expenses");

    return {
      content: [{ type: "text" as const, text: `${header}\n\n${lines.join("\n")}` }],
    };
  },
);

export default ListExpensesTool;

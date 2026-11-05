import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";
import { formatPagination } from "../../helpers/pagination.js";

const ListInvoicesTool = createTool(
  "list-invoices",
  "List invoices in Invoice Ninja. Supports filtering by status, client, and search term. Returns paginated results.",
  {
    page: z.number().optional().describe("Page number (default: 1)"),
    per_page: z.number().optional().describe("Results per page (default: 20)"),
    client_id: z.string().optional().describe("Filter by client hashed ID"),
    status: z
      .enum(["active", "draft", "sent", "paid", "unpaid", "overdue", "archived"])
      .optional()
      .describe("Filter by invoice status"),
    search: z.string().optional().describe("Search invoices by number, PO number, etc."),
  },
  async ({ page, per_page, client_id, status, search }) => {
    const params: Record<string, string> = {
      per_page: String(per_page ?? 20),
      page: String(page ?? 1),
      include: "client",
    };
    if (client_id) params.client_id = client_id;
    if (status) params.client_status = status;
    if (search) params.filter = search;

    const response = await apiGet<{ data: Array<Record<string, unknown>>; meta: Record<string, unknown> }>(
      "/invoices",
      params,
    );

    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error listing invoices: ${response.error}` }],
        isError: true,
      };
    }

    const invoices = response.result.data;
    if (invoices.length === 0) {
      return { content: [{ type: "text" as const, text: "No invoices found." }] };
    }

    const lines = invoices.map((inv) => {
      const client = inv.client as Record<string, unknown> | undefined;
      return [
        `ID: ${inv.id}`,
        `Number: ${inv.number || "N/A"}`,
        `Client: ${client?.display_name || inv.client_id || "N/A"}`,
        `Amount: ${inv.amount}`,
        `Balance: ${inv.balance}`,
        `Status ID: ${inv.status_id}`,
        `Date: ${inv.date}`,
        `Due Date: ${inv.due_date || "N/A"}`,
      ].join(" | ");
    });

    const header = formatPagination(response.result.meta, invoices.length, "invoices");

    return {
      content: [{ type: "text" as const, text: `${header}\n\n${lines.join("\n")}` }],
    };
  },
);

export default ListInvoicesTool;

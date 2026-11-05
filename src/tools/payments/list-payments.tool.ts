import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";
import { formatPagination } from "../../helpers/pagination.js";

const ListPaymentsTool = createTool(
  "list-payments",
  "List payments in Invoice Ninja. Shows payment records including which invoices they are applied to.",
  {
    page: z.number().optional().describe("Page number (default: 1)"),
    per_page: z.number().optional().describe("Results per page (default: 20)"),
    client_id: z.string().optional().describe("Filter by client hashed ID"),
    search: z.string().optional().describe("Search payments"),
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
      "/payments",
      params,
    );

    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error listing payments: ${response.error}` }],
        isError: true,
      };
    }

    const payments = response.result.data;
    if (payments.length === 0) {
      return { content: [{ type: "text" as const, text: "No payments found." }] };
    }

    const lines = payments.map((p) => {
      const client = p.client as Record<string, unknown> | undefined;
      return [
        `ID: ${p.id}`,
        `Amount: ${p.amount}`,
        `Date: ${p.date}`,
        `Client: ${client?.display_name || p.client_id || "N/A"}`,
        `Type ID: ${p.type_id || "N/A"}`,
        `Ref: ${p.transaction_reference || "N/A"}`,
        `Status ID: ${p.status_id}`,
      ].join(" | ");
    });

    const header = formatPagination(response.result.meta, payments.length, "payments");

    return {
      content: [{ type: "text" as const, text: `${header}\n\n${lines.join("\n")}` }],
    };
  },
);

export default ListPaymentsTool;

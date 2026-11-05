import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";
import { formatPagination } from "../../helpers/pagination.js";

const ListClientsTool = createTool(
  "list-clients",
  "List clients in Invoice Ninja. Use the search parameter to find a client by name or email. Clients are needed to create invoices -- use the returned client ID.",
  {
    page: z.number().optional().describe("Page number (default: 1)"),
    per_page: z.number().optional().describe("Results per page (default: 20)"),
    search: z.string().optional().describe("Search by name, email, or id_number"),
    is_deleted: z.boolean().optional().describe("Include deleted clients"),
  },
  async ({ page, per_page, search, is_deleted }) => {
    const params: Record<string, string> = {
      per_page: String(per_page ?? 20),
      page: String(page ?? 1),
    };
    if (search) params.filter = search;
    if (is_deleted !== undefined) params.is_deleted = String(is_deleted);

    const response = await apiGet<{ data: Array<Record<string, unknown>>; meta: Record<string, unknown> }>(
      "/clients",
      params,
    );

    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error listing clients: ${response.error}` }],
        isError: true,
      };
    }

    const clients = response.result.data;
    if (clients.length === 0) {
      return { content: [{ type: "text" as const, text: "No clients found." }] };
    }

    const lines = clients.map((c) => {
      const contacts = c.contacts as Array<Record<string, unknown>> | undefined;
      const primaryEmail = contacts?.[0]?.email || "N/A";
      return [
        `ID: ${c.id}`,
        `Name: ${c.display_name || c.name || "N/A"}`,
        `Email: ${primaryEmail}`,
        `Balance: ${c.balance}`,
        `Phone: ${c.phone || "N/A"}`,
      ].join(" | ");
    });

    const header = formatPagination(response.result.meta, clients.length, "clients");

    return {
      content: [{ type: "text" as const, text: `${header}\n\n${lines.join("\n")}` }],
    };
  },
);

export default ListClientsTool;

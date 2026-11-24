import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";
import { formatPagination } from "../../helpers/pagination.js";

const ListUsersTool = createTool(
  "list-users",
  "List users of this Invoice Ninja instance. Use it to get a user's hashed ID before setting assigned_user_id on a task or expense; IDs are not printed by the other read tools.",
  {
    page: z.number().optional().describe("Page number (default: 1)"),
    per_page: z.number().optional().describe("Results per page (default: 20)"),
    search: z.string().optional().describe("Search by name or email"),
    is_deleted: z.boolean().optional().describe("Include deleted users"),
  },
  async ({ page, per_page, search, is_deleted }) => {
    const params: Record<string, string> = {
      per_page: String(per_page ?? 20),
      page: String(page ?? 1),
    };
    if (search) params.filter = search;
    if (is_deleted !== undefined) params.is_deleted = String(is_deleted);

    const response = await apiGet<{
      data: Array<Record<string, unknown>>;
      meta: Record<string, unknown>;
    }>("/users", params);

    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error listing users: ${response.error}` }],
        isError: true,
      };
    }

    const users = response.result.data ?? [];
    if (users.length === 0) {
      return { content: [{ type: "text" as const, text: "No users found." }] };
    }

    const lines = users.map((u) => {
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "(no name)";
      return [
        `ID: ${u.id}`,
        `Name: ${name}`,
        `Email: ${u.email || "N/A"}`,
        `Admin: ${u.is_admin ? "yes" : "no"}`,
        `Deleted: ${u.is_deleted ? "yes" : "no"}`,
      ].join(" | ");
    });

    const header = formatPagination(response.result.meta, users.length, "users");
    return { content: [{ type: "text" as const, text: `${header}\n\n${lines.join("\n")}` }] };
  },
);

export default ListUsersTool;

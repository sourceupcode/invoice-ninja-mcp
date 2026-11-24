import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";
import { formatPagination } from "../../helpers/pagination.js";

const ListProjectsTool = createTool(
  "list-projects",
  "List projects in Invoice Ninja. Use this to get a project's hashed ID before setting project_id on a task — the API accepts a project name without complaint and stores nothing, which leaves the task reading Project: N/A.",
  {
    page: z.number().optional().describe("Page number (default: 1)"),
    per_page: z.number().optional().describe("Results per page (default: 20)"),
    search: z.string().optional().describe("Search by project name"),
    client_id: z.string().optional().describe("Filter to one client's projects"),
    is_deleted: z.boolean().optional().describe("Include deleted projects"),
  },
  async ({ page, per_page, search, client_id, is_deleted }) => {
    const params: Record<string, string> = {
      per_page: String(per_page ?? 20),
      page: String(page ?? 1),
      include: "client",
    };
    if (search) params.filter = search;
    if (client_id) params.client_id = client_id;
    if (is_deleted !== undefined) params.is_deleted = String(is_deleted);

    const response = await apiGet<{
      data: Array<Record<string, unknown>>;
      meta: Record<string, unknown>;
    }>("/projects", params);

    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error listing projects: ${response.error}` }],
        isError: true,
      };
    }

    const projects = response.result.data ?? [];
    if (projects.length === 0) {
      return { content: [{ type: "text" as const, text: "No projects found." }] };
    }

    const lines = projects.map((p) => {
      const client = p.client as Record<string, unknown> | undefined;
      return [
        `ID: ${p.id}`,
        `Name: ${p.name || "N/A"}`,
        `Number: ${p.number || "(none)"}`,
        `Client: ${client?.display_name || p.client_id || "N/A"}`,
        `Deleted: ${p.is_deleted ? "yes" : "no"}`,
      ].join(" | ");
    });

    const header = formatPagination(response.result.meta, projects.length, "projects");
    return { content: [{ type: "text" as const, text: `${header}\n\n${lines.join("\n")}` }] };
  },
);

export default ListProjectsTool;

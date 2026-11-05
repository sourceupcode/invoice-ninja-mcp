import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";
import { formatPagination } from "../../helpers/pagination.js";
import { formatDuration, totalSeconds } from "../../helpers/task-time.js";

// Task-specific note on filters, verified against the live API rather than
// assumed: TaskFilters has no `invoice_id` scope, and QueryFilters skips any
// filter name it has no method for (`if (! method_exists($this, $name))
// continue;`). So `?invoice_id=` is silently IGNORED — the request returns the
// unfiltered page. Use `list-invoice-tasks` to get the tasks for one invoice;
// this tool does not pretend the server can filter by it.

const ListTasksTool = createTool(
  "list-tasks",
  "List tasks in Invoice Ninja. Filter by client, project, invoice status (invoiced/uninvoiced/running/overdue) or search text. Returns paginated results.",
  {
    page: z.number().optional().describe("Page number (default: 1)"),
    per_page: z.number().optional().describe("Results per page (default: 20, max 100)"),
    client_id: z.string().optional().describe("Filter by client hashed ID"),
    project_id: z.string().optional().describe("Filter by project hashed ID"),
    client_status: z
      .enum(["all", "invoiced", "uninvoiced", "is_running", "overdue"])
      .optional()
      .describe(
        "Filter by task state: invoiced (linked to an invoice), uninvoiced, is_running (timer running), overdue",
      ),
    search: z.string().optional().describe("Search tasks by description or number"),
  },
  async ({ page, per_page, client_id, project_id, client_status, search }) => {
    const params: Record<string, string> = {
      per_page: String(per_page ?? 20),
      page: String(page ?? 1),
      include: "client,project",
    };
    if (client_id) params.client_id = client_id;
    if (project_id) params.project_id = project_id;
    // 'all' is the API's own no-op value; omit it rather than sending it.
    if (client_status && client_status !== "all") params.client_status = client_status;
    if (search) params.filter = search;

    const response = await apiGet<{
      data: Array<Record<string, unknown>>;
      meta: Record<string, unknown>;
    }>("/tasks", params);

    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error listing tasks: ${response.error}` }],
        isError: true,
      };
    }

    const tasks = response.result.data ?? [];
    if (tasks.length === 0) {
      return { content: [{ type: "text" as const, text: "No tasks found." }] };
    }

    const lines = tasks.map((t) => {
      const client = t.client as Record<string, unknown> | undefined;
      const project = t.project as Record<string, unknown> | undefined;
      return [
        `ID: ${t.id}`,
        `Number: ${t.number || "(none)"}`,
        `Description: ${String(t.description || "").split("\n")[0].slice(0, 60)}`,
        `Client: ${client?.display_name || t.client_id || "N/A"}`,
        `Project: ${project?.name || t.project_id || "N/A"}`,
        `Invoice: ${t.invoice_id || "(not invoiced)"}`,
        `Status: ${t.status_id}`,
        `Logged: ${formatDuration(totalSeconds(t.time_log))}`,
        `Rate: ${t.rate ?? "N/A"}`,
        `Running: ${t.is_running ? "yes" : "no"}`,
      ].join(" | ");
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `${formatPagination(response.result.meta, tasks.length, "tasks")}\n\n${lines.join("\n")}`,
        },
      ],
    };
  },
);

export default ListTasksTool;

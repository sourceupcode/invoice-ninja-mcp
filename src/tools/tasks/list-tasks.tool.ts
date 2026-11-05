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
      // Without is_deleted=0 the API returns soft-deleted tasks too (measured:
      // total 5 vs 4), so deleted work would silently reappear in listings.
      is_deleted: "0",
      // Names for status and assignee come from the API; without these includes
      // the payload only carries hashes and the tool has to show raw ids.
      include: "client,project,status,assigned_user",
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
      const status = t.status as Record<string, unknown> | undefined;
      const user = t.assigned_user as Record<string, unknown> | undefined;
      const who = user
        ? [user.first_name, user.last_name].filter(Boolean).join(" ") || String(user.email ?? "")
        : "";
      const rows = [
        [
          `ID: ${t.id}`,
          `Number: ${String(t.number || "(none)").trim()}`,
          `Description: ${String(t.description || "").split("\n")[0].slice(0, 60)}`,
          `Client: ${client?.display_name || t.client_id || "N/A"}`,
          `Project: ${project?.name || t.project_id || "N/A"}`,
          `Invoice: ${t.invoice_id || "(not invoiced)"}`,
          // Status name rather than only the hash, now that it is included.
          `Status: ${status ? status.name : t.status_id}`,
          `Logged: ${formatDuration(totalSeconds(t.time_log))}`,
          `Rate: ${t.rate ?? "N/A"}`,
          `Running: ${t.is_running ? "yes" : "no"}`,
        ].join(" | "),
      ];
      // estimated_duration is seconds; printing it raw reads as a huge number
      // (e.g. 7257600 looked like "2016h"), so format it and mark the ones that
      // cannot plausibly be an estimate.
      if (t.estimated_duration) {
        const secs = Number(t.estimated_duration);
        const hrs = secs / 3600;
        const logged = totalSeconds(t.time_log);
        const flag = hrs > 1000 && hrs > (logged / 3600) * 4 ? " (implausible — check the task)" : "";
        rows.push(`        Estimated: ${formatDuration(secs)}${flag}`);
      }
      if (who) rows.push(`        Assigned: ${who}`);
      return rows.join("\n");
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

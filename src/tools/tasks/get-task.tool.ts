import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";
import { describeTimeLog, formatDuration, totalSeconds } from "../../helpers/task-time.js";


const GetTaskTool = createTool(
  "get-task",
  "Get a single task by ID from Invoice Ninja. Returns full details including time log, project, client and linked invoice.",
  {
    id: z.string().describe("The hashed task ID"),
  },
  async ({ id }) => {
    const response = await apiGet<{ data: Record<string, unknown> }>(`/tasks/${id}`, {
      include: "client,project",
    });

    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error getting task: ${response.error}` }],
        isError: true,
      };
    }

    const t = response.result.data;
    const client = t.client as Record<string, unknown> | undefined;
    const project = t.project as Record<string, unknown> | undefined;
    const duration = totalSeconds(t.time_log);
    const rate = Number(t.rate ?? 0);

    const body = [
      `ID: ${t.id}`,
      `Number: ${t.number || "(none)"}`,
      `Description: ${t.description || "(none)"}`,
      `Client: ${client?.display_name || t.client_id || "N/A"}`,
      `Project: ${project?.name || t.project_id || "N/A"}`,
      `Invoice: ${t.invoice_id || "(not invoiced)"}`,
      `Status: ${t.status_id}`,
      `Assigned user: ${t.assigned_user_id || "N/A"}`,
      `Rate: ${rate || "N/A"}`,
      `Logged: ${formatDuration(duration)} (${duration}s)`,
      `Amount: ${rate ? ((duration / 3600) * rate).toFixed(2) : "N/A"}`,
      `Running: ${t.is_running ? "yes" : "no"}`,
      `Due: ${t.due_date || "N/A"}`,
      `Estimated: ${t.estimated_duration || "N/A"}`,
      `Time log:\n  ${describeTimeLog(t.time_log)}`,
    ].join("\n");

    return { content: [{ type: "text" as const, text: body }] };
  },
);

export default GetTaskTool;

import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiPut } from "../../client/api-client.js";
import { formatDuration, totalSeconds } from "../../helpers/task-time.js";

const UpdateTaskTool = createTool(
  "update-task",
  "Update a task in Invoice Ninja. Only provide the fields to change. Use invoice_id to attach the task to an invoice (or an empty string to detach it), and is_running/time_log for time tracking.",
  {
    id: z.string().describe("The hashed task ID"),
    description: z.string().optional().describe("New description"),
    client_id: z.string().optional().describe("New client hashed ID"),
    invoice_id: z
      .string()
      .optional()
      .describe("Hashed invoice ID to associate; send \"\" to detach from any invoice"),
    project_id: z.string().optional().describe("New project hashed ID"),
    status_id: z.string().optional().describe("New status hashed ID; see list-task-statuses"),
    rate: z.number().optional().describe("New hourly rate"),
    number: z.string().optional().describe("New task number"),
    time_log: z
      .string()
      .optional()
      .describe('JSON array of [start,end] unix-second pairs; a running timer uses "" as end'),
    is_running: z.boolean().optional().describe("Start (true) or stop (false) the timer"),
    due_date: z.string().optional().describe("Due date YYYY-MM-DD"),
    estimated_duration: z.number().optional().describe("Estimated duration in seconds"),
    assigned_user_id: z.string().optional().describe("Assigned user hashed ID"),
  },
  async (args) => {
    const { id, ...rest } = args;
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) body[k] = v;
    }

    if (Object.keys(body).length === 0) {
      return {
        content: [{ type: "text" as const, text: "No fields to update were provided." }],
        isError: true,
      };
    }

    const response = await apiPut<{ data: Record<string, unknown> }>(`/tasks/${id}`, body);
    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error updating task: ${response.error}` }],
        isError: true,
      };
    }

    const t = response.result.data;
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Task updated.\nID: ${t.id}\nInvoice: ${t.invoice_id || "(not invoiced)"}` +
            `\nStatus: ${t.status_id}\nRunning: ${t.is_running ? "yes" : "no"}` +
            `\nLogged: ${formatDuration(totalSeconds(t.time_log))}`,
        },
      ],
    };
  },
);

export default UpdateTaskTool;

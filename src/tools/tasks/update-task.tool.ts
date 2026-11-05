import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet, apiPut } from "../../client/api-client.js";
import { formatDuration, totalSeconds } from "../../helpers/task-time.js";

const UpdateTaskTool = createTool(
  "update-task",
  "Update a task in Invoice Ninja. Only provide the fields to change (the existing time log is preserved automatically). Use invoice_id to attach the task to an invoice (or an empty string to detach it), and is_running/time_log for time tracking.",
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

    // CRITICAL: this API does not treat an omitted time_log as "leave it alone".
    // PUT /tasks/{id} with any payload that omits time_log writes an EMPTY log,
    // destroying every logged hour on the task. Verified directly: create a task
    // with one entry, PUT {"number":"x"}, and the response returns time_log "[]".
    // So the current log is read first and always sent back unless the caller is
    // explicitly replacing it.
    if (body.time_log === undefined) {
      const current = await apiGet<{ data: Record<string, unknown> }>(`/tasks/${id}`);
      if (current.isError) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Refusing to update: could not read the existing task to preserve its time log (${current.error}).`,
            },
          ],
          isError: true,
        };
      }
      const existing = current.result.data;
      body.time_log = existing.time_log ?? "";
      // The repository resets a non-numeric rate to 0 when none is supplied, so
      // echo the current rate back to avoid silently repricing the task.
      if (body.rate === undefined && existing.rate !== undefined && existing.rate !== null) {
        body.rate = existing.rate;
      }
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

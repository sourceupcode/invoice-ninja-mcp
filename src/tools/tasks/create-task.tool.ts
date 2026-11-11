import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiPost } from "../../client/api-client.js";
import { timeLogWithNotes } from "../../helpers/task-time.js";

const CreateTaskTool = createTool(
  "create-task",
  "Create a task in Invoice Ninja. Link it to an invoice with invoice_id to make it billable on that invoice, or leave it uninvoiced.",
  {
    description: z.string().describe("Task description"),
    client_id: z.string().describe("Client hashed ID (required by Invoice Ninja)"),
    invoice_id: z
      .string()
      .optional()
      .describe("Hashed invoice ID to associate this task with — makes it invoiced"),
    project_id: z.string().optional().describe("Project hashed ID"),
    status_id: z
      .string()
      .optional()
      .describe("Task status hashed ID; see list-task-statuses"),
    rate: z.number().optional().describe("Hourly rate"),
    number: z.string().optional().describe("Task number (auto-generated if omitted)"),
    time_log: z
      .string()
      .optional()
      .describe('JSON array of [start,end] unix-second pairs, e.g. "[[1793613600,1793628000]]"'),
    due_date: z.string().optional().describe("Due date YYYY-MM-DD"),
    estimated_duration: z.number().optional().describe("Estimated duration in seconds"),
    assigned_user_id: z.string().optional().describe("Assigned user hashed ID"),
  },
  async (args) => {
    const body: Record<string, unknown> = { description: args.description, client_id: args.client_id };
    for (const key of [
      "invoice_id",
      "project_id",
      "status_id",
      "rate",
      "number",
      "time_log",
      "due_date",
      "estimated_duration",
      "assigned_user_id",
    ] as const) {
      if (args[key] !== undefined) body[key] = args[key];
    }

    // Weekly/monthly views read the per-entry note (time_log slot [2]), not
    // task.description — bare [start,end] pairs show a blank Description.
    if (body.time_log !== undefined) {
      body.time_log = timeLogWithNotes(body.time_log, String(args.description ?? ""));
    }

    const response = await apiPost<{ data: Record<string, unknown> }>("/tasks", body);
    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error creating task: ${response.error}` }],
        isError: true,
      };
    }

    const t = response.result.data;
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Task created.\nID: ${t.id}\nNumber: ${t.number || "(none)"}` +
            `\nInvoice: ${t.invoice_id || "(not invoiced)"}\nStatus: ${t.status_id}`,
        },
      ],
    };
  },
);

export default CreateTaskTool;

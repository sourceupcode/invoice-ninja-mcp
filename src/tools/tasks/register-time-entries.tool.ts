import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiPost } from "../../client/api-client.js";

// Register time entries as tasks, one task per entry.
//
// WHY ONE TASK PER ENTRY
// An Invoice Ninja task has exactly one `description`, and its `time_log` is a
// list of [start, end] pairs with nowhere to put per-entry text. So a task that
// aggregates a month of work can carry only one note for the whole month — that
// is precisely how a 22-entry Harvest month collapsed into two invoice lines
// with no detail.
//
// One task per entry keeps the note attached to the time it belongs to, and
// because invoice line items reference a task through `task_id` (the invoice
// service writes tasks.invoice_id from the line items), each task can become its
// own invoice line with its note as the line description.
//
// Links: notes are passed through verbatim, so URLs survive intact. Whether they
// render as clickable anchors depends on Invoice Ninja's rendering (PDF/portal)
// and is not something this tool can control — no text is escaped or rewritten
// here, so that remains possible later.

const EntrySchema = z.object({
  date: z.string().describe("Date of the work, YYYY-MM-DD"),
  hours: z.number().positive().describe("Hours worked on this entry, e.g. 2.5"),
  notes: z.string().describe("What was done. This becomes the task description."),
  start: z
    .string()
    .optional()
    .describe(
      "Optional ISO start timestamp for this entry. Default: the date at 12:00 UTC, which keeps the calendar date stable across timezones.",
    ),
});

const RegisterTimeEntriesTool = createTool(
  "register-time-entries",
  "Register time entries as individual tasks, keeping each entry's note with its time. Use this to record a day-by-day time report so notes survive into the task (and later into invoice line items).",
  {
    client_id: z.string().describe("Client hashed ID for every task"),
    entries: z.array(EntrySchema).min(1).describe("Time entries to register, one task each"),
    project_id: z.string().optional().describe("Project hashed ID applied to every task"),
    invoice_id: z
      .string()
      .optional()
      .describe("Hashed invoice ID; marks every created task as invoiced on that invoice"),
    rate: z.number().optional().describe("Hourly rate applied to every task"),
    status_id: z
      .string()
      .optional()
      .describe("Task status hashed ID; see list-task-statuses"),
  },
  async ({ client_id, entries, project_id, invoice_id, rate, status_id }) => {
    const created: Array<{ date: string; hours: number; id: string }> = [];
    const failed: Array<{ date: string; hours: number; error: string }> = [];

    for (const entry of entries) {
      // Noon UTC by default: a 09:00 local-time assumption shifts the calendar
      // date for some timezones, and the date is the part that matters here.
      const start = entry.start
        ? Math.floor(new Date(entry.start).getTime() / 1000)
        : Math.floor(new Date(`${entry.date}T12:00:00Z`).getTime() / 1000);

      if (!Number.isFinite(start)) {
        failed.push({ date: entry.date, hours: entry.hours, error: "invalid date or start" });
        continue;
      }

      const end = start + Math.round(entry.hours * 3600);

      const body: Record<string, unknown> = {
        client_id,
        description: entry.notes,
        time_log: JSON.stringify([[start, end]]),
      };
      if (project_id) body.project_id = project_id;
      if (invoice_id) body.invoice_id = invoice_id;
      if (rate !== undefined) body.rate = rate;
      if (status_id) body.status_id = status_id;

      const response = await apiPost<{ data: Record<string, unknown> }>("/tasks", body);
      if (response.isError) {
        failed.push({ date: entry.date, hours: entry.hours, error: response.error });
      } else {
        created.push({
          date: entry.date,
          hours: entry.hours,
          id: String(response.result.data.id),
        });
      }
    }

    const totalHours = created.reduce((s, c) => s + c.hours, 0);
    const lines = [
      `Registered ${created.length} of ${entries.length} entr(ies), ${totalHours}h total.`,
    ];
    if (created.length) {
      lines.push("", ...created.map((c) => `  ${c.date}  ${c.hours}h  task ${c.id}`));
    }
    if (failed.length) {
      lines.push(
        "",
        `Failed ${failed.length}:`,
        ...failed.map((f) => `  ${f.date}  ${f.hours}h  ${f.error}`),
      );
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
      isError: failed.length > 0 && created.length === 0 ? true : undefined,
    };
  },
);

export default RegisterTimeEntriesTool;

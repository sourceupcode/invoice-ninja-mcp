import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet, apiPut } from "../../client/api-client.js";
import { formatDuration, parseTimeLog, timeLogWithNotes, totalSeconds } from "../../helpers/task-time.js";

/**
 * Build the PUT body from the caller's fields plus whatever has to be carried
 * over from the task as it stands. Pure so the carrying-over rules are testable
 * without an instance.
 *
 * Returns the body and a list of things the caller should know were done for
 * them — printed in the tool response, because every one of these rules exists
 * after a real write went wrong.
 */
export function buildUpdateTaskBody(
  existing: Record<string, unknown>,
  supplied: Record<string, unknown>,
): { body: Record<string, unknown>; carried: string[] } {
  const body: Record<string, unknown> = { ...supplied };
  const carried: string[] = [];

  // CRITICAL: this API does not treat omitted fields as "leave them alone".
  // PUT /tasks/{id} with a payload that omits time_log writes an EMPTY log,
  // destroying every logged hour; omitting number regenerates it (FD-1295
  // became 0023). Verified directly against a live instance. So the current
  // task is read first and time_log/number/rate are always sent back unless
  // the caller is explicitly replacing them.
  const callerSuppliedLog = body.time_log !== undefined;
  if (!callerSuppliedLog) {
    body.time_log = existing.time_log ?? "";
    carried.push(`time_log carried over from the task (${parseTimeLog(body.time_log).length} entries)`);
  }
  if (body.number === undefined && existing.number) body.number = existing.number;
  // The repository resets a non-numeric rate to 0 when none is supplied, so
  // echo the current rate back to avoid silently repricing the task.
  if (body.rate === undefined && existing.rate !== undefined && existing.rate !== null) {
    body.rate = existing.rate;
  }
  // The API rejects invoice_id with "The selected invoice id is invalid" when
  // the request carries no client_id, even though the task already has one.
  // Send the task's own client_id rather than surfacing that 422 as a mystery.
  if (body.invoice_id !== undefined && body.client_id === undefined && existing.client_id) {
    body.client_id = existing.client_id;
    carried.push(`client_id taken from the task (${existing.client_id}) because invoice_id was sent`);
  }

  // Weekly/monthly views read the per-entry note (time_log slot [2]), not
  // task.description — fill empty notes so the Description popover shows the
  // task's description. This applies only to a log carried over from the task.
  // A log the caller supplied is theirs: normalising it stamped one task's
  // description across 21 entry notes on a live record, and the entry text is
  // not recoverable afterwards.
  if (typeof body.time_log === "string") {
    if (callerSuppliedLog) {
      const blank = parseTimeLog(body.time_log).filter((e) => e.note === "").length;
      if (blank) {
        carried.push(
          `${blank} entr(ies) left with an empty note; entry notes are not rewritten on a supplied time_log`,
        );
      }
    } else {
      const noteFallback =
        body.description !== undefined
          ? String(body.description)
          : String(existing.description ?? "");
      const before = parseTimeLog(body.time_log).filter((e) => e.note === "").length;
      body.time_log = timeLogWithNotes(body.time_log, noteFallback);
      if (before) {
        carried.push(`${before} empty entr(ies) filled with the task description for the weekly view`);
      }
    }
  }

  return { body, carried };
}

const UpdateTaskTool = createTool(
  "update-task",
  "Update a task in Invoice Ninja. Omitted fields are carried over from the task, EXCEPT time_log: if you send time_log you are replacing the whole log, so send every existing entry plus the new ones. Not sending time_log leaves the log alone. Use invoice_id to attach the task to an invoice (\"\" detaches it); client_id is supplied for you if you omit it.",
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
      .describe(
        'JSON array of entries, each [start, end, note, billable] — start/end are unix seconds, ' +
          'end is "" for a running timer, note is free text for that one entry, billable defaults to true. ' +
          'Sends a REPLACEMENT for the whole log: include the entries already on the task.',
      ),
    is_running: z.boolean().optional().describe("Start (true) or stop (false) the timer"),
    due_date: z.string().optional().describe("Due date YYYY-MM-DD"),
    estimated_duration: z.number().optional().describe("Estimated duration in seconds"),
    assigned_user_id: z.string().optional().describe("Assigned user hashed ID"),
  },
  async (args) => {
    const { id, ...rest } = args;
    const supplied: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) supplied[k] = v;
    }

    if (Object.keys(supplied).length === 0) {
      return {
        content: [{ type: "text" as const, text: "No fields to update were provided." }],
        isError: true,
      };
    }

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

    const { body, carried } = buildUpdateTaskBody(current.result.data, supplied);

    const response = await apiPut<{ data: Record<string, unknown> }>(`/tasks/${id}`, body);
    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error updating task: ${response.error}` }],
        isError: true,
      };
    }

    const t = response.result.data;
    const lines = [
      `Task updated.\nID: ${t.id}\nInvoice: ${t.invoice_id || "(not invoiced)"}` +
        `\nStatus: ${t.status_id}\nRunning: ${t.is_running ? "yes" : "no"}` +
        `\nLogged: ${formatDuration(totalSeconds(t.time_log))}`,
    ];
    if (carried.length) lines.push("", "Done for you:", ...carried.map((c) => `  - ${c}`));
    if (body.time_log !== undefined) {
      lines.push(`\nTime log sent: ${parseTimeLog(t.time_log).length} entr(ies).`);
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

export default UpdateTaskTool;

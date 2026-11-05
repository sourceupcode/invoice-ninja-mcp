import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";
import { formatDuration, totalSeconds } from "../../helpers/task-time.js";
import { formatLineItems, lineItemsTotal, reconcile } from "../../helpers/invoice-items.js";

// Everything associated with one invoice: the tasks behind it AND the itemized
// line items the client is billed for.
//
// Why both: tasks and line items are different objects, and an invoice can be
// fully itemized while its tasks are aggregated (or vice versa). Reporting only
// tasks made a complete itemization look missing.
//
// Why the invoice is resolved by client-side matching: the v5 API cannot answer
// "which tasks belong to invoice X". TaskFilters has no invoice_id scope and
// QueryFilters silently drops unknown filter names, so ?invoice_id= returns the
// unfiltered page (measured). InvoiceTransformer has no `tasks` include either.
// Tasks do carry invoice_id, so this narrows server-side by client and matches
// exactly in memory, over a bounded scan that reports truncation.

const MAX_PAGES = 20;
const PER_PAGE = 100;

const ListInvoiceTasksTool = createTool(
  "list-invoice-tasks",
  "Show everything associated with an invoice: the tasks behind it (with logged time) and the invoice's itemized line items.",
  {
    invoice_id: z.string().describe("The hashed invoice ID"),
    include_uninvoiced: z
      .boolean()
      .optional()
      .describe(
        "Also list the client's other uninvoiced tasks, reported separately and excluded from the invoice totals (default: false).",
      ),
    include_time_log: z
      .boolean()
      .optional()
      .describe("Include the per-entry time log for each task (default: false)"),
  },
  async ({ invoice_id, include_uninvoiced, include_time_log }) => {
    const invoiceResponse = await apiGet<{ data: Record<string, unknown> }>(
      `/invoices/${invoice_id}`,
      { include: "client" },
    );

    const invoice = invoiceResponse.isError ? undefined : invoiceResponse.result.data;
    const client = invoice?.client as Record<string, unknown> | undefined;
    const clientId = (invoice?.client_id as string | undefined) || undefined;

    const out: string[] = [];
    if (invoice) {
      out.push(
        `Invoice ${invoice.number || invoice_id} — ${client?.display_name || clientId || "unknown client"}` +
          ` (amount ${invoice.amount}, balance ${invoice.balance}, status ${invoice.status_id})`,
      );
    } else {
      out.push(
        `Invoice ${invoice_id} could not be loaded (${invoiceResponse.error}); showing client-adjacent tasks only.`,
      );
    }

    // ---- tasks ----
    const onInvoice: Array<Record<string, unknown>> = [];
    const adjacent: Array<Record<string, unknown>> = [];
    let scanned = 0;
    let page = 1;
    let totalPages = 1;
    let truncated = false;

    while (page <= totalPages) {
      const params: Record<string, string> = {
        per_page: String(PER_PAGE),
        page: String(page),
        // is_deleted=0: the API otherwise returns soft-deleted tasks by default
        // (measured: total 5 vs 4). Status and user names come from the API so
        // the tools do not have to show raw hashes.
        is_deleted: "0",
        include: "client,project,status,assigned_user",
      };
      if (clientId) params.client_id = clientId;
      if (!include_uninvoiced) params.client_status = "invoiced";

      const response = await apiGet<{
        data: Array<Record<string, unknown>>;
        meta: Record<string, unknown>;
      }>("/tasks", params);

      if (response.isError) {
        return {
          content: [
            { type: "text" as const, text: `Error listing invoice tasks: ${response.error}` },
          ],
          isError: true,
        };
      }

      const tasks = response.result.data ?? [];
      scanned += tasks.length;

      for (const t of tasks) {
        const taskInvoice = (t.invoice_id as string | undefined) || "";
        if (taskInvoice === invoice_id) onInvoice.push(t);
        else adjacent.push(t);
      }

      const pagination = (response.result.meta?.pagination ?? {}) as { total_pages?: number };
      totalPages = typeof pagination.total_pages === "number" ? pagination.total_pages : 1;
      if (page >= MAX_PAGES && totalPages > MAX_PAGES) {
        truncated = true;
        break;
      }
      if (tasks.length === 0) break;
      page += 1;
    }

    const now = Math.floor(Date.now() / 1000);
    const secondsOf = (t: Record<string, unknown>) => totalSeconds(t.time_log, now);

    const onHours = onInvoice.reduce((s, t) => s + secondsOf(t), 0);
    const onValue = onInvoice.reduce((s, t) => s + (secondsOf(t) / 3600) * Number(t.rate ?? 0), 0);

    out.push(
      `Tasks on this invoice: ${onInvoice.length}` +
        (onInvoice.length ? ` · logged ${formatDuration(onHours)} · ${onValue.toFixed(2)} at task rates` : ""),
    );

    if (onInvoice.length) {
      out.push("", "== Tasks on this invoice ==", ...onInvoice.map((t) => taskLine(t, secondsOf(t), include_time_log)));
    }

    // ---- line items: the itemized list ----
    const items = ((invoice?.line_items as Array<Record<string, unknown>>) ?? []);
    if (invoice) {
      out.push("", `== Invoice line items (itemized) ==`, reconcile(items, invoice.amount));
      if (items.length) {
        out.push(...formatLineItems(items));
      } else {
        out.push("  (none — this invoice has no line items)");
      }
      const itemTotal = lineItemsTotal(items);
      if (onValue > 0 && items.length > 0 && Math.abs(itemTotal - onValue) > 0.01) {
        out.push(
          "",
          `Note: task-derived value ${onValue.toFixed(2)} differs from the itemized total ${itemTotal.toFixed(2)}.`,
          `That is expected when line items were hand-built or a task's rate changed after invoicing.`,
        );
      }
    }

    // ---- client-adjacent, clearly separated so it cannot be mistaken for invoice content ----
    if (include_uninvoiced && adjacent.length > 0) {
      const adjHours = adjacent.reduce((s, t) => s + secondsOf(t), 0);
      const adjValue = adjacent.reduce((s, t) => s + (secondsOf(t) / 3600) * Number(t.rate ?? 0), 0);
      out.push(
        "",
        `== NOT on this invoice — same client, uninvoiced or billed elsewhere (${adjacent.length}) ==`,
        `logged ${formatDuration(adjHours)} · ${adjValue.toFixed(2)} at task rates · excluded from the figures above`,
        ...adjacent.map((t) => taskLine(t, secondsOf(t), include_time_log)),
      );
    }

    out.push(
      "",
      `Scanned ${scanned} task(s)${truncated ? ` — TRUNCATED at ${MAX_PAGES} pages, results may be incomplete` : ""}.`,
    );

    return { content: [{ type: "text" as const, text: out.join("\n") }] };
  },
);

function taskLine(
  t: Record<string, unknown>,
  seconds: number,
  includeTimeLog: boolean | undefined,
): string {
  const status = t.status as Record<string, unknown> | undefined;
  const user = t.assigned_user as Record<string, unknown> | undefined;
  const project = t.project as Record<string, unknown> | undefined;
  const who = user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ") || String(user.email ?? "")
    : "";
  const bits = [
    `  ${String(t.id)}`,
    `"${String(t.number || "(no number)").trim()}"`,
    status ? String(status.name) : "status ?",
    `logged ${formatDuration(seconds)}`,
    `rate ${t.rate ?? "?"}`,
  ];
  if (project?.name) bits.push(`project ${String(project.name)}`);
  if (who) bits.push(`assigned ${who}`);
  if (t.due_date) bits.push(`due ${String(t.due_date)}`);
  if (t.estimated_duration) bits.push(`estimated ${formatDuration(Number(t.estimated_duration))}`);

  const rows = [bits.join(" · ")];
  if (includeTimeLog) {
    const desc = String(t.description ?? "").trim();
    if (desc) rows.push(`      description: ${desc.replace(/\n/g, " ")}`);
    rows.push(`      time log: ${describeEntries(t.time_log)}`);
  }
  return rows.join("\n");
}

function describeEntries(raw: unknown): string {
  const parsed = (() => {
    if (typeof raw !== "string" || !raw.trim()) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  })();
  if (parsed.length === 0) return "none";
  return parsed
    .map((e: unknown) => {
      if (!Array.isArray(e)) return String(e);
      const start = Number(e[0]);
      const end = e[1] === "" || e[1] === null ? null : Number(e[1]);
      const day = new Date(start * 1000).toISOString().slice(0, 10);
      const mins = end === null ? "running" : `${Math.round((end - start) / 60)}m`;
      return `${day} ${mins}`;
    })
    .join(", ");
}

export default ListInvoiceTasksTool;

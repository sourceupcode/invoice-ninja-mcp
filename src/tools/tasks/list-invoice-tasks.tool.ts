import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";
import { formatDuration, totalSeconds } from "../../helpers/task-time.js";

// "Which tasks belong to this invoice?"
//
// The v5 API cannot answer this directly, which was verified end to end and not
// assumed:
//
//   * TaskFilters has no invoice_id scope, and QueryFilters ignores any filter
//     name with no matching method, so ?invoice_id=<hash> is silently dropped —
//     measured: total stayed 4 with and without the parameter.
//   * InvoiceTransformer's availableIncludes are payments, client, activities,
//     location, project, credits, paymentables. There is no `tasks`, so
//     ?include=tasks on an invoice is filtered out (Invoice HAS a tasks()
//     relation in the model, but the API does not expose it).
//
// What does exist: every task carries invoice_id in its payload, and
// tasks?client_status=invoiced filters to tasks that have any invoice at all.
// So this tool narrows server-side by client (when the invoice resolves) and
// then matches invoice_id exactly in memory. The scan is bounded and reports
// when it truncated, rather than silently returning partial results.

const MAX_PAGES = 20;
const PER_PAGE = 100;

const ListInvoiceTasksTool = createTool(
  "list-invoice-tasks",
  "List the tasks associated with a specific invoice, with their logged time. Use this to pull the task breakdown behind an invoice before billing or reviewing it.",
  {
    invoice_id: z.string().describe("The hashed invoice ID"),
    include_uninvoiced: z
      .boolean()
      .optional()
      .describe(
        "Also match tasks with no invoice_id set (default: false). Rarely useful; off by default so the result is scoped to the invoice.",
      ),
  },
  async ({ invoice_id, include_uninvoiced }) => {
    // Fetch the invoice for context and to narrow the task scan by client.
    const invoiceResponse = await apiGet<{ data: Record<string, unknown> }>(
      `/invoices/${invoice_id}`,
      { include: "client" },
    );

    const invoice = invoiceResponse.isError ? undefined : invoiceResponse.result.data;
    const client = invoice?.client as Record<string, unknown> | undefined;
    const clientId = (invoice?.client_id as string | undefined) || undefined;

    const headerLines: string[] = [];
    if (invoice) {
      headerLines.push(
        `Invoice ${invoice.number || invoice_id} — ${client?.display_name || clientId || "unknown client"}` +
          ` (amount ${invoice.amount ?? "?"}, balance ${invoice.balance ?? "?"}, status ${invoice.status_id ?? "?"})`,
      );
    } else {
      headerLines.push(
        `Invoice ${invoice_id} could not be loaded (${invoiceResponse.error}); scanning tasks without client context.`,
      );
    }

    const matches: Array<Record<string, unknown>> = [];
    let scanned = 0;
    let page = 1;
    let totalPages = 1;
    let truncated = false;

    while (page <= totalPages) {
      const params: Record<string, string> = {
        per_page: String(PER_PAGE),
        page: String(page),
        include: "client,project",
      };
      // Narrow server-side when possible: tasks for this client only.
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
        const onThisInvoice = taskInvoice === invoice_id;
        const uninvoiced = taskInvoice === "";
        if (onThisInvoice || (include_uninvoiced && uninvoiced)) {
          matches.push(t);
        }
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

    if (matches.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              `${headerLines.join("\n")}\n\nNo tasks reference this invoice.` +
              `\nScanned ${scanned} task(s)${truncated ? " (truncated)" : ""}.` +
              `\nNote: tasks link to an invoice only when invoice_id is set; use list-tasks to see uninvoiced work.`,
          },
        ],
      };
    }

    // Computed from time_log, not from the `duration` column: that column is 0
    // for every task in a live instance even when time_log holds hours, so
    // trusting it would report zero billable time.
    const now = Math.floor(Date.now() / 1000);
    const secondsOf = (t: Record<string, unknown>) => totalSeconds(t.time_log, now);
    const totalLogged = matches.reduce((sum, t) => sum + secondsOf(t), 0);
    const totalBilled = matches.reduce(
      (sum, t) => sum + (secondsOf(t) / 3600) * Number(t.rate ?? 0),
      0,
    );

    const lines = matches.map((t) => {
      const project = t.project as Record<string, unknown> | undefined;
      const duration = secondsOf(t);
      const rate = Number(t.rate ?? 0);
      return [
        `ID: ${t.id}`,
        `Number: ${t.number || "(none)"}`,
        `Description: ${String(t.description || "").split("\n")[0].slice(0, 70)}`,
        `Project: ${project?.name || t.project_id || "N/A"}`,
        `Status: ${t.status_id}`,
        `Logged: ${formatDuration(duration)}`,
        `Rate: ${rate || "N/A"}`,
        `Amount: ${rate ? (duration / 3600) * rate : "N/A"}`,
        `Running: ${t.is_running ? "yes" : "no"}`,
      ].join(" | ");
    });

    const summary = [
      `${matches.length} task(s) on this invoice`,
      `logged total: ${formatDuration(totalLogged)}`,
      `value at task rates: ${totalBilled.toFixed(2)}`,
    ].join(" · ");

    return {
      content: [
        {
          type: "text" as const,
          text:
            `${headerLines.join("\n")}\n${summary}` +
            `\nScanned ${scanned} task(s)${truncated ? " (truncated — raise MAX_PAGES or narrow by client)" : ""}.` +
            `\n\n${lines.join("\n")}`,
        },
      ],
    };
  },
);


// Kept explicit: the days/hours formatting above is shared by the summary and
// the per-task rows, so both read the same way.

export default ListInvoiceTasksTool;

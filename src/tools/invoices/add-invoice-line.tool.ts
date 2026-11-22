import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet, apiPut } from "../../client/api-client.js";
import { appendLineItem, appendPrivateNote, addLineGuard, reconcile, NewLineItem } from "../../helpers/invoice-items.js";

// Add ONE new invoice line item, without disturbing the rest.
//
// WHY READ-MODIFY-WRITE
// The v5 API has no "append a line item" endpoint: PUT /invoices/{id} replaces
// the whole `line_items` array. `update-invoice`'s line_items schema only keeps
// product_key/notes/cost/quantity/tax/discount, so routing an append through it
// would silently strip task_id, date and unit_code off every existing line. This
// tool instead reads the invoice, works with the raw line_items array exactly as
// the API returned it, and writes the whole array back with the new row added —
// so untouched lines survive byte-for-byte.
//
// WHY DRAFT-ONLY AND CONFIRMATION
// Adding a line moves money on an invoice the client may already have been sent.
// addLineGuard refuses outright on anything but a Draft, and otherwise requires
// confirm_amount_change so the amount change is always a deliberate choice.

const AddInvoiceLineTool = createTool(
  "add-invoice-line",
  "Append a new line item to a Draft invoice's line_items without touching existing lines (task_id, date, unit_code survive untouched). Refuses on non-Draft invoices and on amount changes without confirmation.",
  {
    invoice_id: z.string().describe("The hashed invoice ID"),
    notes: z.string().describe("Description for the new line"),
    quantity: z.number().describe("Quantity (hours) for the new line"),
    cost: z.number().describe("Unit cost/rate for the new line"),
    date: z.string().optional().describe("Line date, YYYY-MM-DD"),
    unit_code: z.string().optional().describe("Unit code, e.g. HUR"),
    task_id: z.string().optional().describe("Task hashed ID to link this line to"),
    product_key: z.string().optional().describe("Product key/name"),
    after_line: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("1-based existing line position to insert after; omit to append at the end"),
    append_private_notes: z
      .string()
      .optional()
      .describe("Text to append to the invoice's private notes (joined with a newline)"),
    confirm_amount_change: z
      .boolean()
      .optional()
      .describe(
        "Required because adding a line always changes the invoice total. Without it the add is refused.",
      ),
  },
  async (args) => {
    const {
      invoice_id,
      notes,
      quantity,
      cost,
      date,
      unit_code,
      task_id,
      product_key,
      after_line,
      append_private_notes,
      confirm_amount_change,
    } = args;

    const before = await apiGet<{ data: Record<string, unknown> }>(`/invoices/${invoice_id}`);
    if (before.isError) {
      return {
        content: [{ type: "text" as const, text: `Error reading invoice: ${before.error}` }],
        isError: true,
      };
    }

    const invoice = before.result.data;
    const items = (invoice.line_items as Array<Record<string, unknown>>) ?? [];

    const amountBefore = Number(invoice.amount ?? 0);
    const amountAfter = amountBefore + quantity * cost;

    const refusal = addLineGuard(invoice.status_id, confirm_amount_change, amountBefore, amountAfter);
    if (refusal) {
      return {
        content: [{ type: "text" as const, text: refusal }],
        isError: true,
      };
    }

    const line: NewLineItem = { notes, quantity, cost, date, unit_code, task_id, product_key };

    let newItems: Array<Record<string, unknown>>;
    try {
      newItems = appendLineItem(items, line, after_line);
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Refusing to add line: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }

    const position = after_line !== undefined ? after_line + 1 : newItems.length;

    const existingNotes = invoice.private_notes as string | undefined;
    const newPrivateNotes =
      append_private_notes !== undefined ? appendPrivateNote(existingNotes, append_private_notes) : existingNotes;

    const write = await apiPut<{ data: Record<string, unknown> }>(`/invoices/${invoice_id}`, {
      line_items: newItems,
      private_notes: newPrivateNotes,
    });
    if (write.isError) {
      return {
        content: [{ type: "text" as const, text: `Error writing line items: ${write.error}` }],
        isError: true,
      };
    }

    const written = write.result.data;
    const number = written.number ?? invoice.number ?? invoice_id;

    const summary = [
      `Added line ${position} to invoice ${number}.`,
      reconcile(newItems, amountAfter),
    ];

    return {
      content: [{ type: "text" as const, text: summary.join("\n") }],
    };
  },
);

export default AddInvoiceLineTool;

import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";
import { formatLineItems, reconcile } from "../../helpers/invoice-items.js";

// The itemized list people mean when they say "the invoice": invoice.line_items.
// This is separate from tasks — a task is the time record, a line item is what
// the client is billed for, and either can exist without the other.

const ListInvoiceItemsTool = createTool(
  "list-invoice-items",
  "List an invoice's line items — the itemized list the client is billed for, with dates, quantities, rates and descriptions.",
  {
    invoice_id: z.string().describe("The hashed invoice ID"),
  },
  async ({ invoice_id }) => {
    const response = await apiGet<{ data: Record<string, unknown> }>(
      `/invoices/${invoice_id}`,
      { include: "client" },
    );

    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error getting invoice items: ${response.error}` }],
        isError: true,
      };
    }

    const invoice = response.result.data;
    const client = invoice.client as Record<string, unknown> | undefined;
    const items = (invoice.line_items as Array<Record<string, unknown>>) ?? [];

    const header =
      `Invoice ${invoice.number || invoice_id} — ${client?.display_name || invoice.client_id || "unknown client"}` +
      `\nAmount ${invoice.amount}, balance ${invoice.balance}. ${reconcile(items, invoice.amount)}`;

    if (items.length === 0) {
      return {
        content: [{ type: "text" as const, text: `${header}\n\nThis invoice has no line items.` }],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `${header}\n\n${formatLineItems(items).join("\n")}`,
        },
      ],
    };
  },
);

export default ListInvoiceItemsTool;

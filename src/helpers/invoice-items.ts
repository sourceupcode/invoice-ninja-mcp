// Formatting for invoice line items.
//
// A task and an invoice line item are different objects: the itemized detail a
// human wants to read lives in `invoice.line_items`, while tasks carry the time.
// A tool that reports only tasks will look like it is hiding the itemization even
// when the invoice is fully itemized — which is exactly what happened, so both
// surfaces are now reported together.

export interface LineItemLike {
  quantity?: unknown;
  cost?: unknown;
  notes?: unknown;
  product_key?: unknown;
  date?: unknown;
  task_id?: unknown;
  unit_code?: unknown;
  discount?: unknown;
}

export function itemQuantity(item: LineItemLike): number {
  return Number(item.quantity ?? 0);
}

export function itemAmount(item: LineItemLike): number {
  return itemQuantity(item) * Number(item.cost ?? 0);
}

export function lineItemsTotal(items: LineItemLike[]): number {
  return items.reduce((sum, i) => sum + itemAmount(i), 0);
}

function money(n: number): string {
  return n.toFixed(2);
}

/** One readable row per line item, numbered, with date / qty x cost = amount. */
export function formatLineItems(items: LineItemLike[]): string[] {
  return items.map((item, index) => {
    const parts: string[] = [];
    if (item.date) parts.push(String(item.date));
    const qty = itemQuantity(item);
    const unit = item.unit_code ? String(item.unit_code) : "";
    const cost = Number(item.cost ?? 0);
    parts.push(`${qty}${unit ? " " + unit : ""} x ${money(cost)} = ${money(itemAmount(item))}`);
    const notes = String(item.notes ?? "").trim();
    if (notes) parts.push(notes);
    if (item.task_id) parts.push(`task ${String(item.task_id)}`);
    return `  ${String(index + 1).padStart(2, " ")}. ${parts.join("  |  ")}`;
  });
}

/** Compares the itemized total against the invoice's own amount. */
export function reconcile(items: LineItemLike[], invoiceAmount: unknown): string {
  const total = lineItemsTotal(items);
  const amount = Number(invoiceAmount ?? 0);
  const delta = Math.abs(total - amount);
  const ok = delta < 0.01;
  return (
    `${items.length} line item(s) totalling ${money(total)}; invoice amount ${money(amount)} — ` +
    (ok ? "reconciled" : `MISMATCH of ${money(delta)}`)
  );
}

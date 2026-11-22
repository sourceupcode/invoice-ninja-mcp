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

export interface NewLineItem {
  notes: string;
  quantity: number;
  cost: number;
  date?: string;
  unit_code?: string;
  task_id?: string;
  product_key?: string;
}

/**
 * Returns a new array: the original row objects untouched, plus a new row
 * built from `line`. By default the new row is appended at the end; passing
 * `afterLine` (1-based, referring to a position in `items`) inserts it right
 * after that existing row instead.
 */
export function appendLineItem(
  items: Array<Record<string, unknown>>,
  line: NewLineItem,
  afterLine?: number,
): Array<Record<string, unknown>> {
  const row: Record<string, unknown> = {
    notes: line.notes,
    quantity: line.quantity,
    cost: line.cost,
  };
  if (line.date !== undefined) row.date = line.date;
  if (line.unit_code !== undefined) row.unit_code = line.unit_code;
  if (line.task_id !== undefined) row.task_id = line.task_id;
  if (line.product_key !== undefined) row.product_key = line.product_key;

  if (afterLine === undefined) {
    return [...items, row];
  }
  if (afterLine < 1 || afterLine > items.length) {
    throw new RangeError(`afterLine must be between 1 and ${items.length}, got ${afterLine}`);
  }
  const out = [...items];
  out.splice(afterLine, 0, row);
  return out;
}

/** Appends `added` to an invoice's private notes, starting fresh if there are none. */
export function appendPrivateNote(existing: string | undefined, added: string): string {
  return existing ? `${existing}\n${added}` : added;
}

/**
 * Decides whether an add-line request may proceed. Returns null to proceed,
 * or the refusal text to show the caller.
 */
export function addLineGuard(
  statusId: unknown,
  confirmed: boolean | undefined,
  before: number,
  after: number,
): string | null {
  if (String(statusId) !== "1") {
    return "This invoice is not a Draft; adding a line here is not allowed.";
  }
  if (confirmed !== true) {
    return `Adding this line changes the invoice total from ${money(before)} to ${money(after)}. Confirm to proceed.`;
  }
  return null;
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

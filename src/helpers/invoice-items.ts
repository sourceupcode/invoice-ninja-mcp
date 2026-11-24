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
  type_id?: unknown;
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

/**
 * One readable row per line item, numbered, with date / qty x cost = amount.
 *
 * A row can be backed by a task, by a product key, by both, or by neither, and the
 * client decides which it is. The v5 line item also carries a numeric `type_id` that
 * the UI uses to render the row; the two are independent, which is how an invoice
 * ends up "showing products and tasks" while every row also names a task. All three
 * are printed so the question is answerable from the read surface alone.
 */
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
    if (item.product_key) parts.push(`product ${String(item.product_key)}`);
    if (item.type_id) parts.push(`type ${String(item.type_id)}`);
    return `  ${String(index + 1).padStart(2, " ")}. ${parts.join("  |  ")}`;
  });
}

export interface EditCheck {
  /** Line-item total before the edit, computed locally from the rows just read. */
  totalBefore: number;
  /** Line-item total the edit should produce, computed locally. */
  totalExpected: number;
  /** Line-item total after re-reading the invoice from the server. */
  totalVerified: number;
  /** `invoice.amount` before and after. */
  amountBefore: number;
  amountAfter: number;
}

/**
 * Did the edit land?
 *
 * The check compares the re-read line total against the total the edit was expected
 * to produce, and checks that the gap between the line total and `invoice.amount`
 * did not move. It deliberately does NOT require the line total to equal
 * `invoice.amount`: invoice-level tax, discounts and accumulated rounding on
 * fractional hours leave a cent between them on a real invoice (invoice 0002 has
 * one), and demanding equality made every successful edit on that invoice report a
 * failure. A check that always cries wolf hides the one that is real.
 */
export function checkEdit(check: EditCheck): { problems: string[]; notes: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];

  if (Math.abs(check.totalVerified - check.totalExpected) > 0.01) {
    problems.push(
      `line total ${check.totalVerified.toFixed(2)} does not match the ${check.totalExpected.toFixed(2)} this edit should have produced`,
    );
  }

  const gapBefore = check.amountBefore - check.totalBefore;
  const gapAfter = check.amountAfter - check.totalVerified;
  if (Math.abs(gapAfter - gapBefore) > 0.009) {
    problems.push(
      `the gap between the line total and the invoice amount moved ${gapBefore.toFixed(2)} -> ${gapAfter.toFixed(2)}`,
    );
  } else if (Math.abs(gapBefore) > 0.009) {
    notes.push(
      `note: invoice amount ${check.amountBefore.toFixed(2)} is ${Math.abs(gapBefore).toFixed(2)} away from the line sum; pre-existing and unchanged by this edit`,
    );
  }

  return { problems, notes };
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
    (ok
      ? "reconciled"
      : `off by ${money(delta)}: invoice-level tax/discount or rounding on fractional-hour quantities. `
        + `The amount is what the client is billed.`)
  );
}

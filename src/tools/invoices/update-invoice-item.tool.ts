import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet, apiPut } from "../../client/api-client.js";
import { itemAmount, lineItemsTotal } from "../../helpers/invoice-items.js";

// Edit ONE invoice line item.
//
// WHY READ-MODIFY-WRITE
// The v5 API has no partial line-item update: PUT /invoices/{id} replaces the
// whole `line_items` array. Updating one note therefore means sending all of
// them back, and a blind rebuild is how a billing record gets mangled. This tool
// reads the invoice, changes exactly one element, and writes the array back —
// then re-reads to confirm what landed.
//
// WHY IDENTITY, NOT JUST AN INDEX
// An index alone is fragile: line order is not guaranteed stable and a
// hand-counted "line 15" can mean a different line than the caller saw. Selectors
// are therefore combinable (line + date + task), every supplied selector must
// agree, and anything ambiguous is refused instead of guessed.
//
// WHY AMOUNT CHANGES ARE BLOCKED
// A note edit must not re-price an invoice. Quantity or cost changes move money,
// so they require explicit confirmation and the delta is always reported.

const UpdateInvoiceItemTool = createTool(
  "update-invoice-item",
  "Edit a single invoice line item (notes, quantity, cost, product key, date, unit). Identifies one line by position and/or date, task or note text, and refuses ambiguous matches or unintended amount changes.",
  {
    invoice_id: z.string().describe("The hashed invoice ID"),
    line: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("1-based line position, as printed by list-invoice-items"),
    match_date: z.string().optional().describe("Line item date, YYYY-MM-DD"),
    match_task_id: z.string().optional().describe("Task hashed ID linked to the line"),
    match_notes_contains: z
      .string()
      .optional()
      .describe("Substring that must appear in the current notes"),

    set_notes: z.string().optional().describe("New notes/description for the line"),
    set_quantity: z.number().optional().describe("New quantity (hours)"),
    set_cost: z.number().optional().describe("New unit cost/rate"),
    set_product_key: z.string().optional().describe("New product key"),
    set_date: z.string().optional().describe("New date, YYYY-MM-DD"),
    set_unit_code: z.string().optional().describe("New unit code, e.g. HUR"),

    confirm_amount_change: z
      .boolean()
      .optional()
      .describe(
        "Required when quantity or cost changes move the invoice total. Without it the edit is refused.",
      ),
  },
  async (args) => {
    const {
      invoice_id,
      line,
      match_date,
      match_task_id,
      match_notes_contains,
      confirm_amount_change,
      ...sets
    } = args;

    const hasSelector =
      line !== undefined ||
      match_date !== undefined ||
      match_task_id !== undefined ||
      match_notes_contains !== undefined;
    const hasChange = Object.values(sets).some((v) => v !== undefined);

    if (!hasSelector) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Refusing to edit: supply at least one selector (line, match_date, match_task_id or match_notes_contains).",
          },
        ],
        isError: true,
      };
    }
    if (!hasChange) {
      return {
        content: [{ type: "text" as const, text: "Nothing to change: supply at least one set_* field." }],
        isError: true,
      };
    }

    const before = await apiGet<{ data: Record<string, unknown> }>(`/invoices/${invoice_id}`);
    if (before.isError) {
      return {
        content: [{ type: "text" as const, text: `Error reading invoice: ${before.error}` }],
        isError: true,
      };
    }

    const invoice = before.result.data;
    const items = ((invoice.line_items as Array<Record<string, unknown>>) ?? []).map((i) => ({ ...i }));
    if (items.length === 0) {
      return {
        content: [{ type: "text" as const, text: "Invoice has no line items to edit." }],
        isError: true,
      };
    }

    // Every supplied selector must agree on the same line.
    const matches: number[] = [];
    items.forEach((item, index) => {
      if (line !== undefined && index + 1 !== line) return;
      if (match_date !== undefined && String(item.date ?? "") !== match_date) return;
      if (match_task_id !== undefined && String(item.task_id ?? "") !== match_task_id) return;
      if (match_notes_contains !== undefined && !String(item.notes ?? "").includes(match_notes_contains)) return;
      matches.push(index);
    });

    if (matches.length !== 1) {
      const preview = matches.slice(0, 8).map((i) => {
        const item = items[i];
        return `  ${i + 1}. ${item.date ?? "?"} | ${item.quantity ?? "?"} x ${item.cost ?? "?"} | ${String(item.notes ?? "").slice(0, 70)}`;
      });
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Refusing to edit: selectors matched ${matches.length} line(s), expected exactly 1.` +
              (matches.length ? `\nCandidates:\n${preview.join("\n")}` : "\nNo line matched — check the selector values."),
          },
        ],
        isError: true,
      };
    }

    const index = matches[0]!;
    const target = items[index]!;
    const beforeSnapshot = {
      date: target.date,
      quantity: target.quantity,
      cost: target.cost,
      product_key: target.product_key,
      unit_code: target.unit_code,
      notes: target.notes,
    };
    const amountBefore = itemAmount(target);
    const totalBefore = lineItemsTotal(items);

    for (const [key, value] of Object.entries(sets)) {
      if (value === undefined) continue;
      target[key.replace(/^set_/, "")] = value;
    }

    const amountAfter = itemAmount(target);
    const totalAfter = lineItemsTotal(items);
    const totalDelta = totalAfter - totalBefore;

    // Note/date/product/unit edits must not move money; only quantity/cost may.
    if (Math.abs(totalDelta) > 0.009 && !confirm_amount_change) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Refusing to edit: this would change the invoice total by ${totalDelta.toFixed(2)} ` +
              `(${totalBefore.toFixed(2)} -> ${totalAfter.toFixed(2)}).` +
              `\nRe-run with confirm_amount_change: true if that is intended.` +
              `\nNo change was written.`,
          },
        ],
        isError: true,
      };
    }

    const expectedAmount = Number(invoice.amount ?? 0) + totalDelta;

    const write = await apiPut<{ data: Record<string, unknown> }>(`/invoices/${invoice_id}`, {
      line_items: items,
    });
    if (write.isError) {
      return {
        content: [{ type: "text" as const, text: `Error writing line items: ${write.error}` }],
        isError: true,
      };
    }

    // Verify by re-reading rather than trusting the write response.
    const after = await apiGet<{ data: Record<string, unknown> }>(`/invoices/${invoice_id}`);
    if (after.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Wrote the change but could not verify it: ${after.error}`,
          },
        ],
        isError: true,
      };
    }

    const verified = after.result.data;
    const verifiedItems = (verified.line_items as Array<Record<string, unknown>>) ?? [];
    const verifiedLine = verifiedItems[index];

    const problems: string[] = [];
    if (verifiedItems.length !== items.length) {
      problems.push(`line count changed ${items.length} -> ${verifiedItems.length}`);
    }
    if (!verifiedLine) {
      problems.push("target line missing after write");
    } else {
      for (const [key, value] of Object.entries(sets)) {
        if (value === undefined) continue;
        const field = key.replace(/^set_/, "");
        if (String(verifiedLine[field] ?? "") !== String(value)) {
          problems.push(`${field} did not stick (wanted ${JSON.stringify(value)}, got ${JSON.stringify(verifiedLine[field])})`);
        }
      }
    }
    const verifiedTotal = lineItemsTotal(verifiedItems);
    if (Math.abs(verifiedTotal - expectedAmount) > 0.01) {
      problems.push(`line total ${verifiedTotal.toFixed(2)} does not match expected amount ${expectedAmount.toFixed(2)}`);
    }

    const beforeLines = Object.entries(beforeSnapshot)
      .filter(([k]) => sets[`set_${k}` as keyof typeof sets] !== undefined)
      .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`);

    const summary = [
      `Edited invoice ${verified.number || invoice_id}, line ${index + 1}:`,
      "before:",
      ...(beforeLines.length ? beforeLines : ["  (no tracked field)"]),
      "after:",
      ...Object.entries(sets)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `  ${k.replace(/^set_/, "")}: ${JSON.stringify(v)}`),
      "",
      `line amount ${amountBefore.toFixed(2)} -> ${amountAfter.toFixed(2)}; invoice total ${totalBefore.toFixed(2)} -> ${verifiedTotal.toFixed(2)}`,
      problems.length
        ? `VERIFICATION FAILED: ${problems.join("; ")}`
        : `verified: ${verifiedItems.length} line items, total ${verifiedTotal.toFixed(2)}, amount ${verified.amount}`,
    ];

    return {
      content: [{ type: "text" as const, text: summary.join("\n") }],
      isError: problems.length ? true : undefined,
    };
  },
);

export default UpdateInvoiceItemTool;

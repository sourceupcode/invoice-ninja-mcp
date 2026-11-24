import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTool } from "./guard.js";

test("a refused mutation routes to the operator instead of ending the request", () => {
  const { allowed, reason } = checkTool("update-invoice");
  assert.equal(allowed, false);
  assert.match(reason!, /blocked item/i);
  assert.match(reason!, /INVOICE_NINJA_ALLOWED_TOOLS/);
  assert.match(reason!, /not the operator's decision|not yours/);
  assert.match(reason!, /Do not work around this refusal/i);
});

test("the invoice-line refusals name add_invoice_line and why append fails elsewhere", () => {
  for (const name of ["update-invoice", "update-invoice-item"]) {
    const { reason } = checkTool(name);
    assert.match(reason!, /add_invoice_line/);
    assert.match(reason!, /task_id, date and unit_code/);
    assert.match(reason!, /no id/);
  }
});

test("read-only lookups are never refused, so the pod is not needed to find an id", () => {
  for (const name of ["list-projects", "list-users", "server-status", "get-task", "list-invoice-items"]) {
    assert.equal(checkTool(name).allowed, true, `${name} must be allowed by default`);
  }
});

test("an allow-list entry unblocks exactly the tool named", () => {
  const previous = process.env.INVOICE_NINJA_ALLOWED_TOOLS;
  process.env.INVOICE_NINJA_ALLOWED_TOOLS = "add-invoice-line";
  try {
    assert.equal(checkTool("add-invoice-line").allowed, true);
    assert.equal(checkTool("update-invoice").allowed, false);
    assert.equal(checkTool("delete-invoice").allowed, false);
  } finally {
    if (previous === undefined) delete process.env.INVOICE_NINJA_ALLOWED_TOOLS;
    else process.env.INVOICE_NINJA_ALLOWED_TOOLS = previous;
  }
});

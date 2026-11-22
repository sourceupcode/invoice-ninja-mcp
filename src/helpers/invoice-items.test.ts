import test from "node:test";
import assert from "node:assert/strict";
import { appendLineItem, appendPrivateNote, addLineGuard } from "./invoice-items.ts";

test("appendLineItem leaves existing rows untouched", () => {
  const items = [{
    notes: "a",
    quantity: 1,
    cost: 175,
    task_id: "T1",
    date: "2026-11-20",
    unit_code: "HUR",
    tax_name1: "Tax A",
    custom_value1: "custom-data",
  }];
  const out = appendLineItem(items, { notes: "b", quantity: 2, cost: 175 });
  assert.equal(out[0], items[0]);
  assert.deepEqual(out[0], items[0]);
  assert.ok("tax_name1" in out[0]);
  assert.equal(out[0].tax_name1, "Tax A");
  assert.ok("custom_value1" in out[0]);
  assert.equal(out[0].custom_value1, "custom-data");
  assert.equal(out.length, 2);
});

test("appendLineItem defaults to appending at the end", () => {
  const items = [{ notes: "first", quantity: 1, cost: 10 }, { notes: "second", quantity: 1, cost: 20 }];
  const out = appendLineItem(items, { notes: "new", quantity: 1, cost: 30 });
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], items[0]);
  assert.deepEqual(out[1], items[1]);
  assert.equal(out[2].notes, "new");
});

test("appendLineItem inserts after the given 1-based position", () => {
  const items = [{ notes: "first", quantity: 1, cost: 10 }, { notes: "second", quantity: 1, cost: 20 }];
  const out = appendLineItem(items, { notes: "new", quantity: 1, cost: 30 }, 1);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], items[0]);
  assert.equal(out[1].notes, "new");
  assert.deepEqual(out[2], items[1]);
});

test("appendLineItem throws RangeError for afterLine 0 or items.length + 1", () => {
  const items = [{ notes: "first", quantity: 1, cost: 10 }, { notes: "second", quantity: 1, cost: 20 }];
  assert.throws(() => appendLineItem(items, { notes: "new", quantity: 1, cost: 30 }, 0), RangeError);
  assert.throws(() => appendLineItem(items, { notes: "new", quantity: 1, cost: 30 }, items.length + 1), RangeError);
});

test("addLineGuard allows a draft invoice that is confirmed", () => {
  assert.equal(addLineGuard("1", true, 100, 450), null);
});

test("addLineGuard refuses a non-draft invoice, naming Draft", () => {
  const message = addLineGuard("2", true, 100, 450);
  assert.notEqual(message, null);
  assert.match(message as string, /Draft/);
});

test("addLineGuard refuses an unconfirmed add, naming the amounts", () => {
  const message = addLineGuard("1", undefined, 100, 450);
  assert.notEqual(message, null);
  assert.match(message as string, /100/);
  assert.match(message as string, /450/);
});

test("appendLineItem omits keys that were not supplied", () => {
  const out = appendLineItem([], { notes: "b", quantity: 2, cost: 175 });
  const row = out[0];
  assert.ok(!("date" in row));
  assert.ok(!("unit_code" in row));
  assert.ok(!("task_id" in row));
  assert.ok(!("product_key" in row));
  assert.deepEqual(Object.values(row).includes(undefined), false);
});

test("appendPrivateNote joins or starts the note", () => {
  assert.equal(appendPrivateNote("old", "new"), "old\nnew");
  assert.equal(appendPrivateNote(undefined, "new"), "new");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUpdateTaskBody } from "./update-task.tool.js";

const EXISTING = {
  id: "task1",
  number: "INF-1174",
  rate: 175,
  client_id: "VolejRejNm",
  description: "Provision the development runtime",
  time_log: JSON.stringify([
    [1795060800, 1795064400, "sized the dev runtime", true],
    [1795070000, 1795073600, "", true],
  ]),
};

test("omitted time_log is carried over from the task, not written empty", () => {
  const { body, carried } = buildUpdateTaskBody(EXISTING, { description: "new text" });
  assert.equal(typeof body.time_log, "string");
  assert.match(String(body.time_log), /1795060800/);
  assert.ok(carried.some((c) => c.includes("time_log carried over unchanged (2 entries)")));
});

test("a carried-over log still gets its empty notes filled for the weekly view", () => {
  const { body } = buildUpdateTaskBody(EXISTING, { description: "replacement description" });
  const log = JSON.parse(String(body.time_log)) as Array<[number, number, string, boolean]>;
  assert.equal(log[0][2], "sized the dev runtime", "an existing note is kept");
  assert.equal(log[1][2], "replacement description", "the blank one takes the description in this request");
});

test("a time_log the caller supplies is sent as given: no note stamping", () => {
  const supplied = JSON.stringify([
    [1795060800, 1795064400, "", true],
    [1795200000, 1795203600, "our own note", true],
  ]);
  const { body, carried } = buildUpdateTaskBody(EXISTING, { time_log: supplied });
  assert.equal(body.time_log, supplied, "the array is byte-identical to what the caller sent");
  assert.ok(
    carried.some((c) => c.includes("1 entr(ies) left with an empty note")),
    "the caller is told a note is blank rather than having one written for them",
  );
});

test("invoice_id without client_id borrows the task's client instead of taking a 422", () => {
  const { body, carried } = buildUpdateTaskBody(EXISTING, { invoice_id: "inv1" });
  assert.equal(body.client_id, "VolejRejNm");
  assert.ok(carried.some((c) => c.includes("client_id taken from the task")));
});

test("a client_id the caller supplied wins", () => {
  const { body } = buildUpdateTaskBody(EXISTING, { invoice_id: "inv1", client_id: "other" });
  assert.equal(body.client_id, "other");
});

test("detaching an invoice still needs the client carried, so the borrow applies", () => {
  const { body } = buildUpdateTaskBody(EXISTING, { invoice_id: "" });
  assert.equal(body.invoice_id, "");
  assert.equal(body.client_id, "VolejRejNm");
});

test("number and rate are echoed back so the repository cannot reset them", () => {
  const { body } = buildUpdateTaskBody(EXISTING, { description: "x" });
  assert.equal(body.number, "INF-1174");
  assert.equal(body.rate, 175);
});

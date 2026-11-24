# Tasks

Tasks are the time ledger behind billed hours. Every rule here was established by a
write that went wrong against a live instance, not by reading the API docs.

## The API does not treat omitted fields as "leave them alone"

`PUT /tasks/{id}` with a payload that omits a field **writes its absence**:

| Omitted | Result |
|---|---|
| `time_log` | The log is emptied. Every logged hour on the task is gone. |
| `number` | The number is regenerated (FD-1295 became 0023). |
| `rate` | A non-numeric rate resets to 0, repricing the task. |
| `client_id` with `invoice_id` | 422 `The selected invoice id is invalid` — the message blames the invoice, not the missing client. |

`update-task` therefore reads the task first and carries `time_log`, `number`, `rate`
and (when `invoice_id` is sent) `client_id` into the PUT. The one field it never
substitutes is `time_log` from the caller: **if you send `time_log`, you are replacing
the whole log**, so send the existing entries plus the new ones. That exception is why
an agent that sent three new pairs dropped ten entries from INF-1174 on 2026-11-22.

## `time_log` entry shape

A JSON string holding an array of four-element entries:

```
[start, end, note, billable]
```

`start`/`end` are unix seconds; `end` is `""` for a running timer; `note` is free text
for that one entry; `billable` defaults to true and only an explicit `false` excludes
the entry from money figures. Two-element pairs are accepted and silently produce blank
notes — the shape the tool text used to claim, which is how 21 entry notes on INF-1174
came to hold a pasted block of rendered text on 2026-11-23.

## Note filling, and why it is conditional

Weekly/monthly views read the entry note (slot `[2]`), not `task.description`, so an
empty note is filled from the description — but **only for a log carried over from the
task**. A log the caller supplied is left exactly as sent: normalising one stamped one
task's whole description across every entry on a live record, and entry text is not
recoverable afterwards. `update-task` prints how many entries were left blank instead of
writing notes on the caller's behalf.

`create-task` keeps the fill: a new task's entries belong to its own description, and
the argument text now says so.

## Reading the ledger

- The `duration` column is unreliable: it reads 0 however much time is logged. Totals
  come from `time_log`, and `list-tasks`/`get-task` compute them that way.
- `get_task` prints time-log stamps in **UTC** and labels them as such. A range read in
  the operator's timezone must be converted before anything is compared; two runs of the
  same task disagreed about a collision on 2026-11-22 for exactly this reason.
- `assigned_user_id` and `project_id` need hashed IDs from `list-users` and
  `list-projects`. The API accepts a project *name* without complaining and stores
  nothing, leaving four tasks reading `Project: N/A` on 2026-11-23.

## `register-time-entries` is capture, not billing

It creates one task per entry and never raises an invoice line, so a ticket worked on
across several days becomes several tasks. Bill from `create-task`/`update-task` plus
`add-invoice-line`.

## Linking tasks to invoices

Attaching a task to an invoice creates no line item. Lines are what carry the money, and
`PUT /invoices/{id}` **rebuilds the invoice's task links from the `task_id` fields in the
lines it is given** — so a line write that drops a `task_id` silently unlinks that task
(28 tasks on 2026-11-23). Rule: write lines first, attach tasks after. See
`specs/invoices.md`.

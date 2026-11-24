# Invoices

## Motivation

When I need to bill a client, I want to create, send, and manage invoices through my AI assistant so I can handle invoicing without switching to the Invoice Ninja web UI.

This is the **primary reason** the MCP server exists.

## Success Criteria

- Can list invoices with filters (status, client, search, pagination)
- Can get full invoice details including line items, client info, and portal links
- Can create draft invoices with line items, taxes, discounts, terms, and notes
- Can update any invoice field (line items replace entirely, not merge)
- Can soft-delete invoices (recoverable from Invoice Ninja UI)
- Can email invoices to clients (marks as sent)
- Can perform bulk actions: mark_sent, mark_paid, archive, restore, delete, cancel, clone_to_quote
- Created invoices return: ID, number, amount, client portal link, admin panel link

## Core Concepts

### Draft-First Workflow
`create-invoice` always creates a **draft** invoice. To send it, use `send-invoice-email` (sends + marks as sent) or `bulk-invoice-action` with `mark_sent` (marks sent without emailing). This prevents accidental sends.

### Line Item Structure
Each line item has: `product_key` (optional name), `notes` (description), `cost` (unit price), `quantity`, and optional tax/discount fields. Tax is per-line (`tax_name1`/`tax_rate1`) or per-invoice.

### Adding a Line Without Replacing the Rest (`add-invoice-line`)
`update-invoice`'s `line_items` field replaces the whole array, and its schema keeps only `product_key`, `notes`, `cost`, `quantity`, tax and discount -- any existing line sent through it loses its `task_id`, `date` and `unit_code`. `add-invoice-line` instead reads the invoice, appends one new row to the raw `line_items` array exactly as the API returned it, and writes the whole array back, so every untouched line survives byte-for-byte.

**Draft-only.** The invoice's `status_id` must be `1` (Draft); any other status is refused. Adding a line always changes the invoice total, so `confirm_amount_change: true` is required or the add is refused with the before/after amounts shown. The new row can be appended at the end or inserted after an existing line (`after_line`, 1-based), and `append_private_notes` can add to the invoice's private notes in the same write.

### Status IDs
Invoice Ninja uses numeric status IDs:
- 1 = Draft
- 2 = Sent
- 3 = Partial (partially paid)
- 4 = Paid
- 5 = Cancelled
- 6 = Overdue (computed, not stored)

### Links
Every invoice response includes:
- **Client Portal link** -- from `invitations[0].link` (shareable URL for client)
- **Admin Panel link** -- constructed from base URL + `/invoices/{id}/edit`

## Data Model

### Create Invoice Payload
| Field | Type | Required | Description |
|---|---|---|---|
| client_id | string | Yes | Hashed client ID |
| line_items | array | Yes (min 1) | Line items with cost + quantity |
| date | string | No | YYYY-MM-DD, defaults to today |
| due_date | string | No | YYYY-MM-DD |
| number | string | No | Auto-generated if omitted |
| po_number | string | No | Purchase order number |
| discount | number | No | Overall discount |
| is_amount_discount | boolean | No | true=fixed, false=percentage |
| partial | number | No | Deposit amount |
| partial_due_date | string | No | Deposit due date |
| terms | string | No | Invoice terms |
| footer | string | No | Footer text |
| public_notes | string | No | Client-visible notes |
| private_notes | string | No | Internal notes |
| tax_name1 | string | No | Invoice-level tax name |
| tax_rate1 | number | No | Invoice-level tax rate % |

### Line Item Schema
| Field | Type | Required | Description |
|---|---|---|---|
| product_key | string | No | Product name from list-products |
| notes | string | No | Line description |
| cost | number | Yes | Unit price |
| quantity | number | Yes | Quantity |
| tax_name1 | string | No | Tax name (e.g., GST) |
| tax_rate1 | number | No | Tax rate % (e.g., 10) |
| discount | number | No | Line discount |

## Tools

| Tool | API | Description |
|---|---|---|
| `list-invoices` | GET /invoices | List with pagination, status/client/search filters |
| `get-invoice` | GET /invoices/:id?include=client | Full details with line items and links |
| `create-invoice` | POST /invoices | Create draft with line items |
| `update-invoice` | PUT /invoices/:id | Update fields (line_items replaces) |
| `add-invoice-line` | GET+PUT /invoices/:id | Append one line item without replacing existing ones; Draft only |
| `list-invoice-items` | GET /invoices/:id?include=client | Every row with date, qty, unit, rate, amount, task, product key and item type |
| `update-invoice-item` | GET+PUT /invoices/:id | Edit one row by selector, read-modify-write, verified by re-read |
| `delete-invoice` | DELETE /invoices/:id | Soft-delete |
| `send-invoice-email` | POST /emails | Email to client, marks as sent |
| `bulk-invoice-action` | POST /invoices/bulk | mark_sent, mark_paid, archive, restore, delete, cancel, clone_to_quote |

## Line item identity: task, product key, item type

A line item can be backed three ways at once, and they are independent fields:

- `task_id` — the task whose time the row bills.
- `product_key` — a key into the **Products** entity. A key that does not exist makes Invoice Ninja create a Product: this
  account has two such products (`Infrastructure` and `C62`), each holding the text of an invoice row as its notes.
- `type_id` — a numeric item type the client renders the row by. Rows added through `add-invoice-line` carry `type_id 1`,
  older hand-written rows carry `type_id 2` (observed on invoice 0002, 2026-11-24; the API does not document the meaning of
  the numbers, so the value is reported rather than interpreted).

`unit_code` is not `product_key`: `C62` in `unit_code` is the UN/CEFACT hour code. Someone put it in `product_key` and a
Product named `C62` appeared.

`list-invoice-items` prints `task <id>`, `product <key>` and `type <id>` on every row, so the "is this row a product or a
task?" question is answerable without the UI. `update-invoice-item` takes `set_product_key` (an empty string clears it) and
`set_type_id`.

## Verification after a line edit

`update-invoice-item` re-reads the invoice and checks three things: the field it set stuck; the re-read line total equals
what the edit should have produced; and the gap between the line total and `invoice.amount` did not move. It does **not**
require the line total to equal `invoice.amount`. A real invoice keeps a cent between them — 0002 totals 16009.56 across its
rows against an amount of 16009.57 — from invoice-level tax/discount and rounding on four-decimal hour quantities. An
earlier version demanded equality, so every successful edit on 0002 came back as `VERIFICATION FAILED`: a false alarm on a
money-bearing invoice, which is the worst kind, and such a gap is now reported as a note instead.

## Current State

All 9 tools above are implemented and functional. Line-item edits go through
`add-invoice-line` or `update-invoice-item`; `update-invoice` replaces the whole
array and drops `task_id`, `date` and `unit_code`, so it is not the way to change a row.

## Out of Scope

- Recurring invoices (separate API entity -- potential future spec)
- Invoice PDF download/attachment
- Custom invoice designs/templates
- Multi-currency conversion

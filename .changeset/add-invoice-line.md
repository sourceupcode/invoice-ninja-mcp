---
"invoice-ninja-mcp-server": minor
---

Add `add-invoice-line` tool: appends a new line item to a Draft invoice's raw `line_items` array via read-modify-write, so existing lines' `task_id`, `date` and `unit_code` survive untouched (unlike routing through `update-invoice`, whose schema strips those fields). Refuses on non-Draft invoices and on amount changes without `confirm_amount_change`.

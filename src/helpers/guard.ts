// Write guard for the SourceUp fork of Fuciuss/invoice-ninja-mcp.
//
// WHY THIS EXISTS
// An Invoice Ninja v5 API token cannot be scoped. TokenAuth resolves
// X-API-TOKEN to a CompanyToken and calls auth()->login($company_token->user);
// CompanyToken has no permissions column, and the api middleware group is
// ['throttle:api','token_auth','valid_json','locale'] with no authorization
// step. The token therefore acts as its owner, with full write and delete
// rights, and upstream calls apiDelete with no confirmation.
//
// Deleting an invoice is exactly what billing records must never lose, so the
// block lives here, in code, rather than relying on the caller's discipline.
//
// Default-deny: anything not explicitly allow-listed is refused. A future
// upstream tool that adds a mutation is blocked the day it is vendored,
// instead of being silently allowed.
//
// Precedence: INVOICE_NINJA_ALLOW_WRITES (everything) > INVOICE_NINJA_DENIED_TOOLS
// (named refusals) > INVOICE_NINJA_ALLOWED_TOOLS (named exceptions) > default
// denial. So an operator can enable one mutation, e.g. register-time-entries,
// without unlocking invoice writes.

const DEFAULT_DENIED = [
  "delete-invoice",
  "delete-client",
  "bulk-invoice-action",
  "bulk-quote-action",
  "create-invoice",
  "update-invoice",
  "create-client",
  "update-client",
  "create-payment",
  "create-quote",
  "update-quote",
  "create-expense",
  "send-invoice-email",
  // Task mutations are blocked for the same reason as invoices: a task can be
  // attached to an invoice, its rate and logged time feed billed amounts, and
  // stop/start rewrite the time log. Billing records are not an agent's to edit
  // without an explicit decision (INVOICE_NINJA_ALLOW_WRITES).
  "create-task",
  "update-task",
  "delete-task",
  "bulk-task-action",
  "register-time-entries",
  "update-invoice-item",
  "add-invoice-line",
];

function parseList(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function truthy(v: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((v || "").toLowerCase());
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

export function checkTool(name: string): GuardResult {
  // Escape hatch for an operator who consciously wants full writes.
  if (truthy(process.env.INVOICE_NINJA_ALLOW_WRITES)) return { allowed: true };

  const denied = parseList(process.env.INVOICE_NINJA_DENIED_TOOLS);
  if (denied.length && denied.includes(name)) {
    return { allowed: false, reason: `tool '${name}' is denied by INVOICE_NINJA_DENIED_TOOLS` };
  }

  // INVOICE_NINJA_ALLOWED_TOOLS is additive: it carves named exceptions out of
  // the default denial. It previously acted as a replacement whitelist, so
  // setting it to permit one mutation silently refused every tool that was not
  // listed -- including all the read tools. That made "allow just this one
  // thing" impossible, which is exactly what an operator wants to do here.
  const allowed = parseList(process.env.INVOICE_NINJA_ALLOWED_TOOLS);
  if (allowed.includes(name)) {
    return { allowed: true };
  }

  if (DEFAULT_DENIED.includes(name)) {
    const hints: string[] = [
      `tool '${name}' is blocked by the write guard: this deployment runs with an unscoped ` +
        `Invoice Ninja token, so mutating calls are refused in code.`,
      `Report it to the operator as a blocked item: what the write would change and the amount ` +
        `at stake. It is unblocked by naming '${name}' in INVOICE_NINJA_ALLOWED_TOOLS, which is ` +
        `the operator's decision, not yours.`,
      `Do not work around this refusal by calling the instance API directly.`,
    ];
    if (name === "update-invoice" || name === "update-invoice-item") {
      hints.push(
        `To add a line to an invoice, use add_invoice_line: it reads the invoice, inserts one ` +
          `row and writes the array back. update_invoice replaces every line and its schema drops ` +
          `task_id, date and unit_code from rows it never touched; update_invoice_item cannot ` +
          `append, because invoice lines carry no id.`,
      );
    }
    return {
      allowed: false,
      reason: hints.join(" "),
    };
  }

  return { allowed: true };
}

# Invoice Ninja MCP Server

An MCP (Model Context Protocol) server for [Invoice Ninja](https://invoiceninja.com) v5. Create invoices, manage clients, record payments, and more through Claude.

## Features

41 tools across 10 categories:

**System**
- `test-connection` - Verify API credentials and instance connectivity
- `server-status` - Which build is running, and which tools its guard permits. Read-only, no API call

**Invoices** (primary)
- `list-invoices` - List/filter/search invoices
- `get-invoice` - Get full invoice details with line items
- `list-invoice-items` - List an invoice's line items with totals
- `create-invoice` - Create draft invoices
- `update-invoice` - Update invoice fields; `line_items` replaces the whole array
- `update-invoice-item` - Edit one existing line (cannot append: lines have no id)
- `add-invoice-line` - Append one line without disturbing the others. Draft-only, requires confirmation of the amount change
- `delete-invoice` - Soft-delete invoices
- `send-invoice-email` - Email invoices to clients
- `bulk-invoice-action` - Mark sent/paid, archive, cancel, clone to quote

**Tasks**
- `list-tasks` - List/filter tasks, with logged time computed from `time_log`
- `list-invoice-tasks` - Tasks attached to one invoice
- `get-task` - Full task detail including its time log (stamps labelled UTC)
- `list-task-statuses` - Status hashed IDs for `status_id`
- `create-task` - Create a task, optionally invoiced
- `update-task` - Update a task; omitted fields are carried over, `time_log` is not
- `delete-task` - Soft-delete a task
- `bulk-task-action` - start/stop timers
- `register-time-entries` - Log time by date and hours; creates a task per entry, which is why the ledger tools above are the ones to bill from

**Projects**
- `list-projects` - Project hashed IDs (needed for `project_id`; the API accepts a name and stores nothing)

**Users**
- `list-users` - User hashed IDs (needed for `assigned_user_id`)

**Clients**
- `list-clients` - List/search clients
- `get-client` - Get client details with contacts
- `create-client` - Create clients with contacts
- `update-client` - Update client details
- `delete-client` - Soft-delete clients

**Products**
- `list-products` - List products for line item reference
- `get-product` - Get product details and pricing

**Payments**
- `list-payments` - List payment records
- `get-payment` - Get payment details
- `create-payment` - Record payments against invoices

**Quotes**
- `list-quotes` - List quotes
- `get-quote` - Get quote details
- `create-quote` - Create quotes (same structure as invoices)
- `update-quote` - Update quotes
- `bulk-quote-action` - Approve, convert to invoice, mark sent

**Expenses**
- `list-expenses` - List expenses
- `get-expense` - Get expense details
- `create-expense` - Create expense records

Every mutating tool is refused unless the deployment names it in `INVOICE_NINJA_ALLOWED_TOOLS`. `server-status` prints the current answer for the build you are talking to.

## Configuration

You need two things:

1. **Invoice Ninja URL** - Your Invoice Ninja instance URL (e.g., `https://invoicing.co` or your self-hosted URL)
2. **API Token** - Generate from Invoice Ninja: Settings > Account Management > API Tokens

## Installation

### Claude Desktop

Add to your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "invoice-ninja": {
      "command": "npx",
      "args": ["-y", "invoice-ninja-mcp-server"],
      "env": {
        "INVOICE_NINJA_URL": "https://your-instance.invoicing.co",
        "INVOICE_NINJA_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

Then restart Claude Desktop.

### Claude Code

```bash
claude mcp add invoice-ninja \
  -e INVOICE_NINJA_URL=https://your-instance.invoicing.co \
  -e INVOICE_NINJA_API_TOKEN=your_api_token_here \
  -- npx -y invoice-ninja-mcp-server
```

### Cursor

Add to `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "invoice-ninja": {
      "command": "npx",
      "args": ["-y", "invoice-ninja-mcp-server"],
      "env": {
        "INVOICE_NINJA_URL": "https://your-instance.invoicing.co",
        "INVOICE_NINJA_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

## Development

### Prerequisites

- Node.js >= 18
- pnpm

### Setup

```bash
pnpm install
pnpm run build
```

### Watch mode

```bash
pnpm run watch
```

### Testing locally

Create a `.env` file with your credentials (already in `.gitignore`):

```
INVOICE_NINJA_URL=https://your-instance.invoicing.co
INVOICE_NINJA_API_TOKEN=your_api_token_here
```

Then point your MCP config to the local build:

```json
{
  "mcpServers": {
    "invoice-ninja": {
      "command": "node",
      "args": ["/path/to/invoice-ninja-mcp/dist/index.js"],
      "env": {
        "INVOICE_NINJA_URL": "https://your-instance.invoicing.co",
        "INVOICE_NINJA_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

## Example Workflow

1. "List my clients" -> `list-clients`
2. "Create an invoice for Acme Corp with 10 hours of consulting at $150/hr" -> `list-clients` (find ID) -> `create-invoice`
3. "Send that invoice" -> `send-invoice-email`
4. "Mark it as paid" -> `bulk-invoice-action` with `mark_paid`

## License

MIT

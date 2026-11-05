import ListInvoicesTool from "./list-invoices.tool.js";
import ListInvoiceItemsTool from "./list-invoice-items.tool.js";
import GetInvoiceTool from "./get-invoice.tool.js";
import CreateInvoiceTool from "./create-invoice.tool.js";
import UpdateInvoiceTool from "./update-invoice.tool.js";
import DeleteInvoiceTool from "./delete-invoice.tool.js";
import SendInvoiceEmailTool from "./send-invoice-email.tool.js";
import BulkInvoiceActionTool from "./bulk-invoice-action.tool.js";

export const InvoiceTools = [
  ListInvoicesTool,
  ListInvoiceItemsTool,
  GetInvoiceTool,
  CreateInvoiceTool,
  UpdateInvoiceTool,
  DeleteInvoiceTool,
  SendInvoiceEmailTool,
  BulkInvoiceActionTool,
];

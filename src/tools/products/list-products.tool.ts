import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";
import { formatPagination } from "../../helpers/pagination.js";

const ListProductsTool = createTool(
  "list-products",
  "List products in Invoice Ninja. Products define reusable line items with preset prices. Use product_key values when creating invoice line items.",
  {
    page: z.number().optional().describe("Page number (default: 1)"),
    per_page: z.number().optional().describe("Results per page (default: 20)"),
    search: z.string().optional().describe("Search products by name or notes"),
  },
  async ({ page, per_page, search }) => {
    const params: Record<string, string> = {
      per_page: String(per_page ?? 20),
      page: String(page ?? 1),
    };
    if (search) params.filter = search;

    const response = await apiGet<{ data: Array<Record<string, unknown>>; meta: Record<string, unknown> }>(
      "/products",
      params,
    );

    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error listing products: ${response.error}` }],
        isError: true,
      };
    }

    const products = response.result.data;
    if (products.length === 0) {
      return { content: [{ type: "text" as const, text: "No products found." }] };
    }

    const lines = products.map((p) =>
      [
        `ID: ${p.id}`,
        `Key: ${p.product_key || "N/A"}`,
        `Notes: ${p.notes || "N/A"}`,
        `Price: ${p.price}`,
        `Quantity: ${p.quantity}`,
        `Tax: ${p.tax_name1 || "none"} ${p.tax_rate1 || ""}`,
      ].join(" | "),
    );

    const header = formatPagination(response.result.meta, products.length, "products");

    return {
      content: [{ type: "text" as const, text: `${header}\n\n${lines.join("\n")}` }],
    };
  },
);

export default ListProductsTool;

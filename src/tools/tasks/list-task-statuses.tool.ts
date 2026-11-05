import { createTool } from "../../helpers/create-tool.js";
import { apiGet } from "../../client/api-client.js";

// Status ids are per-company hashes, not fixed numbers: this instance has two
// companies with separate status sets (Backlog/Ready to do/In progress/Done
// under different ids). Tools that accept a status_id therefore need a way to
// discover the right value, which is what this tool is for.

const ListTaskStatusesTool = createTool(
  "list-task-statuses",
  "List the task statuses available to this company, with their hashed IDs. Use these IDs when setting a task's status.",
  {},
  async () => {
    const response = await apiGet<{ data: Array<Record<string, unknown>> }>("/task_statuses", {
      per_page: "100",
    });

    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error listing task statuses: ${response.error}` }],
        isError: true,
      };
    }

    const statuses = response.result.data ?? [];
    if (statuses.length === 0) {
      return { content: [{ type: "text" as const, text: "No task statuses found." }] };
    }

    const lines = statuses.map(
      (s) => `  ID: ${s.id} | Name: ${s.name} | Order: ${s.sort_order ?? "N/A"}`,
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `${statuses.length} task status(es):\n${lines.join("\n")}`,
        },
      ],
    };
  },
);

export default ListTaskStatusesTool;

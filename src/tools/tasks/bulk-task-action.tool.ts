import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiPost } from "../../client/api-client.js";

// Actions are exactly the set BulkTaskRequest validates
// (app/Http/Requests/Task/BulkTaskRequest.php:43):
//   archive, restore, delete, bulk_update, template, start, stop
// start/stop are the timer operations — there is no dedicated
// tasks/{id}/start endpoint in the v5 API, so timers are driven from here.
//
// bulk_update takes a column from Task::$bulk_update_columns
// (status_id, client_id, project_id, assigned_user_id) plus the new value.

const BulkTaskActionTool = createTool(
  "bulk-task-action",
  "Perform a bulk action on tasks: archive, restore, delete, start or stop timers, or bulk_update a column. Timer start/stop applies to all given task ids.",
  {
    ids: z.array(z.string()).min(1).describe("Array of hashed task IDs"),
    action: z
      .enum(["archive", "restore", "delete", "bulk_update", "template", "start", "stop"])
      .describe(
        "Action to perform. start/stop control time tracking; bulk_update changes one column for all ids.",
      ),
    column: z
      .enum(["status_id", "client_id", "project_id", "assigned_user_id"])
      .optional()
      .describe("Required when action=bulk_update: the column to set"),
    value: z
      .string()
      .optional()
      .describe("Required when action=bulk_update: the new hashed ID for that column"),
  },
  async ({ ids, action, column, value }) => {
    const body: Record<string, unknown> = { ids, action };

    if (action === "bulk_update") {
      if (!column || value === undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text: "action=bulk_update requires both column and value.",
            },
          ],
          isError: true,
        };
      }
      body.column = column;
      body.value = value;
    }

    const response = await apiPost<{ data: unknown }>("/tasks/bulk", body);
    if (response.isError) {
      return {
        content: [
          { type: "text" as const, text: `Error performing ${action} on tasks: ${response.error}` },
        ],
        isError: true,
      };
    }

    // v5 answers a bulk request with 200 and no per-id outcome: a request for an
    // id that does not exist still reports success (measured). So this states
    // what was requested and accepted, and points at the check, instead of
    // claiming the action was applied to each task.
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Invoice Ninja accepted "${action}" for ${ids.length} task id(s): ${ids.join(", ")}.` +
            `\nBulk actions do not report per-task results, so confirm the outcome with get-task` +
            ` (or list-tasks) — an id that does not exist will also come back successful here.`,
        },
      ],
    };
  },
);

export default BulkTaskActionTool;

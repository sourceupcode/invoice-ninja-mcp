import { z } from "zod";
import { createTool } from "../../helpers/create-tool.js";
import { apiDelete } from "../../client/api-client.js";

const DeleteTaskTool = createTool(
  "delete-task",
  "Delete a task from Invoice Ninja. This soft-deletes the task (it can be restored from the UI or with bulk-task-action restore).",
  {
    id: z.string().describe("The hashed task ID"),
  },
  async ({ id }) => {
    const response = await apiDelete<Record<string, unknown>>(`/tasks/${id}`);
    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error deleting task: ${response.error}` }],
        isError: true,
      };
    }

    return { content: [{ type: "text" as const, text: `Task ${id} deleted.` }] };
  },
);

export default DeleteTaskTool;

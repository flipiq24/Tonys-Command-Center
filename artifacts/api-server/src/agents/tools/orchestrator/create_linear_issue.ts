// create_linear_issue — orchestrator wrapper. Creates a Linear issue. Shared
// handler with create_task (per audit's CRITICAL NOTES section).

import type { ToolHandler } from "../index.js";
import { createLinearIssue } from "../../../lib/linear.js";

const handler: ToolHandler = async (input) => {
  const result = await createLinearIssue({
    title: String(input.title),
    description: String(input.description || ""),
    priority: typeof input.priority === "number" ? input.priority : 3,
    assigneeId: input.assignee_id ? String(input.assignee_id) : undefined,
  });
  if (result.ok) return `✓ Task created: ${result.identifier ?? result.id}${result.assigneeName ? ` — assigned to ${result.assigneeName}` : ""}`;
  return `✗ Task creation failed (Linear connection may not be set up yet)`;
};

export default handler;

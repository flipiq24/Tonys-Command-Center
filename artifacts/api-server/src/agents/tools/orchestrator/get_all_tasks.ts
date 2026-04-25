// get_all_tasks — orchestrator wrapper. Lists open Linear tasks/issues.

import type { ToolHandler } from "../index.js";
import { getLinearIssues } from "../../../lib/linear.js";

const handler: ToolHandler = async () => {
  try {
    const issues = await getLinearIssues();
    if (issues.length === 0) return "No open Linear tasks found.";
    return issues.map((t, i) => {
      const priority = ["", "Urgent", "High", "Medium", "Low"][t.priority] || "Unknown";
      const due = t.dueDate ? ` | Due: ${t.dueDate}` : "";
      const assignee = t.assignee?.name ? ` | Assignee: ${t.assignee.name}` : "";
      return `${i + 1}. [${t.identifier}] ${t.title}\n   Status: ${t.state?.name || "Unknown"} | Priority: ${priority}${due}${assignee}`;
    }).join("\n\n");
  } catch (err) {
    return `Failed to fetch Linear tasks: ${err instanceof Error ? err.message : String(err)}`;
  }
};

export default handler;

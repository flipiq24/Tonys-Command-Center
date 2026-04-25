// get_linear_members — orchestrator wrapper. Lists active Linear team members.

import type { ToolHandler } from "../index.js";
import { getLinearMembers } from "../../../lib/linear.js";

const handler: ToolHandler = async () => {
  try {
    const members = await getLinearMembers();
    if (members.length === 0) return "No active Linear members found. Linear may not be connected.";
    return members.map((m, i) => `${i + 1}. ${m.name} (${m.displayName})\n   ID: ${m.id}\n   Email: ${m.email}`).join("\n\n");
  } catch (err) {
    return `Failed to fetch Linear members: ${err instanceof Error ? err.message : String(err)}`;
  }
};

export default handler;

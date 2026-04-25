// list_slack_channels — orchestrator wrapper. Lists Slack channels in the workspace.

import type { ToolHandler } from "../index.js";
import { listSlackChannels } from "../../../lib/slack.js";

const handler: ToolHandler = async () => {
  const result = await listSlackChannels();
  if (!result.ok) {
    if (result.error === "slack_not_connected") return "⚠️ SLACK_TOKEN not set — Slack not connected.";
    return `✗ Slack error: ${result.error}`;
  }
  if (!result.channels?.length) return "No channels found.";
  return result.channels
    .map(c => `#${c.name}${c.is_member ? " ✓" : ""}`)
    .join(", ");
};

export default handler;

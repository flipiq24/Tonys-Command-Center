// search_slack — orchestrator wrapper. Searches Slack messages across all channels.

import type { ToolHandler } from "../index.js";
import { searchSlack } from "../../../lib/slack.js";

const handler: ToolHandler = async (input) => {
  const result = await searchSlack(String(input.query));
  if (!result.ok) {
    if (result.error === "slack_not_connected") return "⚠️ SLACK_TOKEN not set — Slack not connected.";
    if (result.error === "not_allowed_token_type") return "⚠️ Search requires a user token (xoxp-), not a bot token. Use read_slack_channel for channel messages.";
    return `✗ Slack search error: ${result.error}`;
  }
  if (!result.messages?.length) return `No Slack messages found for "${input.query}".`;
  return result.messages.map((m, i) =>
    `${i + 1}. [#${m.channel?.name || "unknown"}] ${m.text}`
  ).join("\n");
};

export default handler;

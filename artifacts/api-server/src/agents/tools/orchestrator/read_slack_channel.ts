// read_slack_channel — orchestrator wrapper. Reads recent Slack channel messages.

import type { ToolHandler } from "../index.js";
import { getSlackChannelHistory } from "../../../lib/slack.js";

const handler: ToolHandler = async (input) => {
  const result = await getSlackChannelHistory({
    channel: String(input.channel),
    limit: typeof input.limit === "number" ? Math.min(input.limit, 50) : 10,
  });
  if (!result.ok) {
    if (result.error === "slack_not_connected") return "⚠️ SLACK_TOKEN not set — Slack not connected.";
    return `✗ Slack error: ${result.error}`;
  }
  if (!result.messages?.length) return `No recent messages found in ${input.channel}.`;
  return result.messages.map((m, i) => {
    const time = new Date(parseFloat(m.ts) * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${i + 1}. [${time}] ${m.username || m.user || "user"}: ${m.text}`;
  }).join("\n");
};

export default handler;

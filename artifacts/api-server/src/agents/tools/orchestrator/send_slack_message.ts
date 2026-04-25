// send_slack_message — orchestrator wrapper. Posts a message to a Slack channel.
// Mirrors claude.ts case-block byte-for-byte (preserves "✓ Message posted to" prefix).

import type { ToolHandler } from "../index.js";
import { postSlackMessage } from "../../../lib/slack.js";

const handler: ToolHandler = async (input) => {
  const result = await postSlackMessage({
    channel: String(input.channel),
    text: String(input.message),
  });
  if (result.ok) return `✓ Message posted to ${input.channel}`;
  if (result.error === "slack_not_connected") return `⚠️ Slack not connected yet — message queued for when Slack is set up.`;
  return `✗ Slack error: ${result.error}`;
};

export default handler;

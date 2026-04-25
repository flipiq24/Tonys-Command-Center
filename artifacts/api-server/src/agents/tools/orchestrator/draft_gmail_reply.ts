// draft_gmail_reply — orchestrator wrapper. Creates a Gmail draft reply.

import type { ToolHandler } from "../index.js";
import { draftReply } from "../../../lib/gmail.js";

const handler: ToolHandler = async (input) => {
  const result = await draftReply({
    to: String(input.to),
    subject: String(input.subject),
    body: String(input.body),
    threadId: input.thread_id ? String(input.thread_id) : undefined,
  });
  if (result.ok) return `✓ Gmail draft created (id: ${result.draftId}) — Tony will see it in his Drafts folder`;
  if (result.error?.includes("not connected")) return `⚠️ Gmail not yet authorized — Tony needs to connect his Google account`;
  return `✗ Draft creation failed: ${result.error}`;
};

export default handler;

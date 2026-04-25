// list_recent_emails — orchestrator wrapper. Fetches recent unread Gmail messages.

import type { ToolHandler } from "../index.js";
import { listRecentEmails } from "../../../lib/gmail.js";

const handler: ToolHandler = async (input) => {
  const maxResults = typeof input.max_results === "number" ? input.max_results : 5;
  const emails = await listRecentEmails(Math.min(maxResults, 10));
  if (emails.length === 0) return "No recent unread emails (or Gmail not yet authorized).";
  return emails.map((e, i) =>
    `${i + 1}. From: ${e.from}\n   Subject: ${e.subject}\n   Snippet: ${e.snippet}\n   Date: ${e.date}`
  ).join("\n\n");
};

export default handler;

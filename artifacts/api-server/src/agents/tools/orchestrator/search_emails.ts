// search_emails — orchestrator wrapper. Gmail search-bar style query.

import type { ToolHandler } from "../index.js";
import { getGmail } from "../../../lib/google-auth.js";

const handler: ToolHandler = async (input) => {
  try {
    const gmail = await getGmail();
    const lim = typeof input.limit === "number" ? Math.min(input.limit, 20) : 10;
    const list = await gmail.users.messages.list({ userId: "me", q: String(input.query), maxResults: lim });
    const msgIds = list.data.messages || [];
    if (msgIds.length === 0) return `No emails found for "${input.query}".`;
    const results = await Promise.all(msgIds.slice(0, lim).map(async (m, i) => {
      try {
        const msg = await gmail.users.messages.get({ userId: "me", id: m.id!, format: "metadata", metadataHeaders: ["From", "Subject", "Date"] });
        const headers = msg.data.payload?.headers || [];
        const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name)?.value || "";
        return `${i + 1}. From: ${get("from")}\n   Subject: ${get("subject")}\n   Date: ${get("date")}\n   Snippet: ${msg.data.snippet || ""}\n   ID: ${m.id}`;
      } catch {
        return `${i + 1}. (could not fetch message ${m.id})`;
      }
    }));
    return results.join("\n\n");
  } catch (err) {
    return `Gmail search failed: ${err instanceof Error ? err.message : String(err)}`;
  }
};

export default handler;

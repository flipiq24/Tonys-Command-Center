// read_email_thread — orchestrator wrapper. Reads a Gmail thread by ID.

import type { ToolHandler } from "../index.js";
import { getGmail } from "../../../lib/google-auth.js";

const handler: ToolHandler = async (input) => {
  try {
    const gmail = await getGmail();
    const thread = await gmail.users.threads.get({ userId: "me", id: String(input.thread_id), format: "full" });
    const messages = thread.data.messages || [];
    if (messages.length === 0) return "Thread is empty or not found.";
    return messages.map((m, i) => {
      const headers = m.payload?.headers || [];
      const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name)?.value || "";
      let body = "";
      const parts = m.payload?.parts || [];
      const textPart = parts.find(p => p.mimeType === "text/plain") || m.payload;
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8").slice(0, 1000);
      }
      return `[Message ${i + 1}]\nFrom: ${get("from")}\nTo: ${get("to")}\nDate: ${get("date")}\nSubject: ${get("subject")}\n${body}`;
    }).join("\n\n---\n\n");
  } catch (err) {
    return `Failed to read email thread: ${err instanceof Error ? err.message : String(err)}`;
  }
};

export default handler;

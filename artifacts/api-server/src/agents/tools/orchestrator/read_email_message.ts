// read_email_message — orchestrator wrapper. Reads one Gmail message by ID
// and recursively extracts text/plain MIME body.

import type { ToolHandler } from "../index.js";
import { getGmail } from "../../../lib/google-auth.js";

const handler: ToolHandler = async (input) => {
  try {
    const gmail = await getGmail();
    const msg = await gmail.users.messages.get({ userId: "me", id: String(input.message_id), format: "full" });
    const headers = msg.data.payload?.headers || [];
    const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name)?.value || "";
    let body = "";
    const extractText = (payload: typeof msg.data.payload): string => {
      if (!payload) return "";
      if (payload.mimeType === "text/plain" && payload.body?.data) {
        return Buffer.from(payload.body.data, "base64").toString("utf-8");
      }
      if (payload.parts) {
        for (const part of payload.parts) {
          const t = extractText(part);
          if (t) return t;
        }
      }
      return "";
    };
    body = extractText(msg.data.payload).slice(0, 3000);
    return `From: ${get("from")}\nTo: ${get("to")}\nCc: ${get("cc")}\nDate: ${get("date")}\nSubject: ${get("subject")}\n\n${body}`;
  } catch (err) {
    return `Failed to read email message: ${err instanceof Error ? err.message : String(err)}`;
  }
};

export default handler;

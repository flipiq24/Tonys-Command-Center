// send_email — orchestrator wrapper. Sends an email via Gmail.

import type { ToolHandler } from "../index.js";
import { sendEmail } from "../../../lib/gmail.js";

const handler: ToolHandler = async (input) => {
  const result = await sendEmail({
    to: String(input.to),
    subject: String(input.subject),
    body: String(input.body),
  });
  if (result.ok) return `✓ Email sent to ${input.to} via Gmail (messageId: ${result.messageId})`;
  return `✗ Email send failed: ${result.error || "unknown error"}`;
};

export default handler;

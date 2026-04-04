import { Router, type IRouter } from "express";
import { z } from "zod";
import { getGmail } from "../../lib/google-auth";
import { db } from "@workspace/db";
import { communicationLogTable, contactsTable } from "../../lib/schema-v2";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const SendEmailBody = z.object({
  to: z.string().email(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  threadId: z.string().optional(),
  contactId: z.string().uuid().optional(),
  isHtml: z.boolean().optional().default(false),
});

router.post("/email/send", async (req, res): Promise<void> => {
  const parsed = SendEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { to, cc, bcc, subject, body, threadId, contactId, isHtml } = parsed.data;

  try {
    const gmail = getGmail();

    const contentType = isHtml ? "text/html" : "text/plain";
    const messageParts = [
      `From: Tony Diaz <tony@flipiq.com>`,
      `To: ${to}`,
      cc ? `Cc: ${cc}` : "",
      bcc ? `Bcc: ${bcc}` : "",
      `Subject: ${subject}`,
      `Content-Type: ${contentType}; charset=utf-8`,
      "",
      body,
    ].filter(Boolean).join("\r\n");

    const encoded = Buffer.from(messageParts)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encoded,
        threadId: threadId || undefined,
      },
    });

    let contactName = to;
    if (contactId) {
      const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
      if (contact) contactName = contact.name;
    }

    await db.insert(communicationLogTable).values({
      contactId: contactId || undefined,
      contactName,
      channel: "email_sent",
      direction: "outbound",
      subject,
      summary: body.substring(0, 300),
      fullContent: body,
      gmailMessageId: result.data.id || undefined,
      gmailThreadId: result.data.threadId || undefined,
    });

    res.json({
      ok: true,
      messageId: result.data.id,
      threadId: result.data.threadId,
    });
  } catch (err) {
    req.log.error({ err }, "Gmail send failed");
    res.status(500).json({ error: "Failed to send email" });
  }
});

const SuggestDraftBody = z.object({
  to: z.string(),
  subject: z.string().optional(),
  context: z.string().optional(),
  contactName: z.string().optional(),
  replyToSnippet: z.string().optional(),
});

router.post("/email/suggest-draft", async (req, res): Promise<void> => {
  const parsed = SuggestDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { to, subject, context, contactName, replyToSnippet } = parsed.data;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic();

    const prompt = replyToSnippet
      ? `Draft a reply email from Tony Diaz (FlipIQ CEO) to ${contactName || to}.
Original email subject: "${subject || "No subject"}"
Original email snippet: "${replyToSnippet}"
${context ? `Additional context: ${context}` : ""}

Write a professional but warm reply. Keep it concise (3-5 sentences max). Tony's style: direct, friendly, action-oriented. Sign off as "Tony".`
      : `Draft an email from Tony Diaz (FlipIQ CEO) to ${contactName || to}.
Subject: "${subject || "Write a good subject"}"
${context ? `Context: ${context}` : ""}

Write a professional but warm email. Keep it concise. Tony's style: direct, friendly, action-oriented. Sign off as "Tony".`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    const draft = textBlock?.type === "text" ? textBlock.text : "";

    res.json({ ok: true, draft, suggestedSubject: subject || "" });
  } catch (err) {
    req.log.error({ err }, "Email draft suggestion failed");
    res.status(500).json({ error: "Failed to generate draft" });
  }
});

export default router;

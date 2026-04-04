import { Router, type IRouter } from "express";
import { getGmail } from "../../lib/google-auth";
import { db } from "@workspace/db";
import { communicationLogTable, contactsTable } from "../../lib/schema-v2";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { updateContactComms } from "../../lib/contact-comms";

const router: IRouter = Router();

router.get("/emails/poll", async (req, res): Promise<void> => {
  try {
    const gmail = getGmail();

    const fiveMinAgo = Math.floor((Date.now() - 5 * 60 * 1000) / 1000);
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: 20,
      q: `is:unread after:${fiveMinAgo}`,
    });

    const messages = list.data.messages || [];
    const newEmails: { from: string; subject: string; snippet: string; messageId: string; threadId: string }[] = [];

    for (const msg of messages) {
      const [existing] = await db.select({ id: communicationLogTable.id })
        .from(communicationLogTable)
        .where(eq(communicationLogTable.gmailMessageId, msg.id!))
        .limit(1);

      if (existing) continue;

      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name === name)?.value || "";
      const from = getHeader("From");
      const subject = getHeader("Subject");
      const snippet = detail.data.snippet || "";

      const senderEmail = from.match(/<(.+?)>/)?.[1] || from;
      let matchedContactId: string | undefined;
      let matchedContactName: string | undefined;

      try {
        const [contact] = await db.select()
          .from(contactsTable)
          .where(sql`LOWER(${contactsTable.email}) = LOWER(${senderEmail})`)
          .limit(1);
        if (contact) {
          matchedContactId = contact.id;
          matchedContactName = contact.name;
        }
      } catch { /* no match */ }

      await db.insert(communicationLogTable).values({
        contactId: matchedContactId,
        contactName: matchedContactName || from,
        channel: "email_received",
        direction: "inbound",
        subject,
        summary: snippet.substring(0, 300),
        gmailMessageId: msg.id!,
        gmailThreadId: msg.threadId || undefined,
      });

      if (matchedContactId) {
        updateContactComms(matchedContactId, "email_received", subject).catch(() => {});
      }

      newEmails.push({
        from,
        subject,
        snippet,
        messageId: msg.id!,
        threadId: msg.threadId || "",
      });
    }

    res.json({ ok: true, newCount: newEmails.length, newEmails });
  } catch (err) {
    console.warn("[EmailPoll] failed:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Email poll failed" });
  }
});

export default router;

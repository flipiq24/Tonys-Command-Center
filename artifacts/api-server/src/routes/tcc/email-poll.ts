import { Router, type IRouter } from "express";
import { getGmail } from "../../lib/google-auth";
import { db, dailyBriefsTable } from "@workspace/db";
import { communicationLogTable, contactsTable } from "../../lib/schema-v2";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { updateContactComms } from "../../lib/contact-comms";
import { anthropic } from "@workspace/integrations-anthropic-ai";
const router: IRouter = Router();

router.get("/emails/poll", async (req, res): Promise<void> => {
  try {
    const gmail = await getGmail();

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

// ─── Reclassify only new emails and merge into cached brief ───────────────────
router.post("/emails/reclassify-new", async (req, res): Promise<void> => {
  try {
    const { newEmails } = req.body as { newEmails: { from: string; subject: string; snippet: string; messageId: string }[] };
    if (!newEmails?.length) { res.json({ ok: true, added: 0 }); return; }

    // Classify new emails via Claude Haiku
    const claudeResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: `You are Tony Diaz's email triage assistant for FlipIQ (real estate wholesaling).
Classify each email into exactly 3 categories: "important", "fyi", or "promotions".
Important: from @flipiq.com team, known contacts, or keywords: urgent, contract, payment, demo, equity, funding, deal.
FYI: medical, receipts, real-person notifications, updates relevant but need no reply.
Promotions: newsletters, marketing emails, automated notifications, social media.
Return ONLY valid JSON: { "important": [...], "fyi": [...], "promotions": [...] }
Important shape: { "from": string, "subj": string, "why": string, "time": string, "p": "high"|"med"|"low" }
FYI shape: { "from": string, "subj": string, "why": string }
Promotions shape: { "from": string, "subj": string, "why": string }`,
      messages: [{ role: "user", content: `Classify these ${newEmails.length} new emails:\n${JSON.stringify(newEmails.map(e => ({ from: e.from, subject: e.subject, snippet: e.snippet })), null, 2)}` }],
    });

    const textBlock = claudeResponse.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") { res.json({ ok: false, error: "No classification" }); return; }
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.json({ ok: false, error: "No JSON in response" }); return; }
    const classified = JSON.parse(jsonMatch[0]) as { important?: any[]; fyi?: any[]; promotions?: any[] };

    // Merge into existing cached brief
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const [dbBrief] = await db.select().from(dailyBriefsTable).where(eq(dailyBriefsTable.date, today));

    const existingImportant = (dbBrief?.emailsImportant as any[]) ?? [];
    const existingFyi = (dbBrief?.emailsFyi as any[]) ?? [];

    // Add gmailMessageId to new classified emails by matching from+subject
    const msgIdMap = new Map(newEmails.map(e => [
      e.from.replace(/<[^>]+>/, "").trim().toLowerCase().slice(0, 30) + "|" + e.subject.toLowerCase().slice(0, 40),
      e.messageId,
    ]));
    const attachId = (e: any) => {
      const key = (e.from || "").toLowerCase().slice(0, 30) + "|" + (e.subj || "").toLowerCase().slice(0, 40);
      return { ...e, gmailMessageId: msgIdMap.get(key) || undefined };
    };

    const newImportant = (classified.important || []).map((e: any, i: number) => attachId({ ...e, id: 100 + i }));
    const newFyi = (classified.fyi || []).map((e: any, i: number) => ({ ...e, id: 110 + i }));
    const newPromotions = (classified.promotions || []).map((e: any, i: number) => ({ ...e, id: 120 + i }));

    const mergedImportant = [...newImportant, ...existingImportant];
    const mergedFyi = [...newFyi, ...existingFyi];

    if (dbBrief) {
      await db.update(dailyBriefsTable).set({ emailsImportant: mergedImportant, emailsFyi: mergedFyi }).where(eq(dailyBriefsTable.date, today));
    }

    res.json({
      ok: true,
      added: newImportant.length + newFyi.length + newPromotions.length,
      emailsImportant: mergedImportant,
      emailsFyi: mergedFyi,
      emailsPromotions: newPromotions,
    });
  } catch (err) {
    console.warn("[EmailReclassify] failed:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Reclassify failed" });
  }
});

export default router;

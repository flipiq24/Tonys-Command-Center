import { Router, type IRouter } from "express";
import { db, phoneLogTable, contactsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const SendSmsBody = z.object({
  phone_number: z.string(),
  message: z.string(),
  contact_id: z.string().optional(),
});

// ─── POST /send-sms — triggers MacroDroid to send SMS from Tony's phone ───────
router.post("/send-sms", async (req, res): Promise<void> => {
  const parsed = SendSmsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid body" });
    return;
  }

  const { phone_number, message, contact_id } = parsed.data;
  const webhookUrl = process.env.MACRODROID_WEBHOOK_URL;

  let macrodroidOk = false;
  if (webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number, message }),
        signal: AbortSignal.timeout(8000),
      });
      macrodroidOk = resp.ok;
    } catch {
      // MacroDroid webhook may not return — log the SMS anyway
      macrodroidOk = false;
    }
  }

  // Resolve contact name if contact_id given
  let contactName: string | undefined;
  if (contact_id) {
    const [c] = await db.select({ name: contactsTable.name }).from(contactsTable).where(eq(contactsTable.id, contact_id));
    contactName = c?.name;
  }

  // Log the outbound SMS
  const [entry] = await db
    .insert(phoneLogTable)
    .values({
      phoneNumber: phone_number,
      type: "sms_outbound",
      contactId: contact_id ?? undefined,
      contactName: contactName ?? undefined,
      smsBody: message,
      matched: !!contact_id,
      loggedAt: new Date(),
    })
    .returning();

  res.status(201).json({
    sent: true,
    macrodroid_triggered: macrodroidOk,
    macrodroid_configured: !!webhookUrl,
    log_id: entry.id,
  });
});

export default router;

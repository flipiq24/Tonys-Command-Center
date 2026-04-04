import { Router, type IRouter } from "express";
import { db, phoneLogTable, contactsTable } from "@workspace/db";
import { eq, desc, gte, and } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

// ─── Shared secret check ──────────────────────────────────────────────────────
function checkSecret(req: import("express").Request, res: import("express").Response): boolean {
  const secret = req.query["key"] as string | undefined;
  const expected = process.env.MACRODROID_SECRET;
  if (!expected) return true; // no secret set — allow (dev mode)
  if (secret !== expected) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

// ─── Strip non-digits for phone matching ─────────────────────────────────────
function normalizePhone(p: string): string {
  return p.replace(/\D/g, "");
}

// ─── Webhook: MacroDroid → POST /phone-log?key=secret ────────────────────────
const PhoneLogBody = z.object({
  type: z.enum(["call_outbound", "call_inbound", "sms_outbound", "sms_inbound"]),
  phone_number: z.string(),
  duration_seconds: z.number().optional(),
  sms_body: z.string().optional(),
  logged_at: z.string().optional(),
});

router.post("/phone-log", async (req, res): Promise<void> => {
  if (!checkSecret(req, res)) return;

  const parsed = PhoneLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid body", details: parsed.error.message });
    return;
  }

  const { type, phone_number, duration_seconds, sms_body, logged_at } = parsed.data;
  const normalizedIncoming = normalizePhone(phone_number);

  // Auto-match to contact
  const allContacts = await db.select({ id: contactsTable.id, name: contactsTable.name, phone: contactsTable.phone }).from(contactsTable);
  const match = allContacts.find(c => c.phone && normalizePhone(c.phone) === normalizedIncoming);

  const [entry] = await db
    .insert(phoneLogTable)
    .values({
      phoneNumber: phone_number,
      type,
      contactId: match?.id ?? undefined,
      contactName: match?.name ?? undefined,
      durationSeconds: duration_seconds ?? undefined,
      smsBody: sms_body ?? undefined,
      matched: !!match,
      loggedAt: logged_at ? new Date(logged_at) : new Date(),
    })
    .returning();

  // Update contact's lastContactDate if matched
  if (match) {
    await db
      .update(contactsTable)
      .set({ lastContactDate: new Date().toISOString().split("T")[0], updatedAt: new Date() })
      .where(eq(contactsTable.id, match.id))
      .catch(() => {});
  }

  res.status(201).json({
    logged: true,
    matched: entry.matched,
    contact_name: entry.contactName ?? null,
  });
});

// ─── GET /phone-log?contactId=xxx — for contact activity feed ────────────────
router.get("/phone-log", async (req, res): Promise<void> => {
  const contactId = req.query["contactId"] as string | undefined;
  const since = req.query["since"] as string | undefined;

  let conditions: import("drizzle-orm").SQL[] = [];
  if (contactId) conditions.push(eq(phoneLogTable.contactId, contactId));
  if (since) conditions.push(gte(phoneLogTable.loggedAt, new Date(since)));

  const logs = await db
    .select()
    .from(phoneLogTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(phoneLogTable.loggedAt))
    .limit(50);

  res.json(logs);
});

// ─── GET /phone-log/today — all phone activity today ─────────────────────────
router.get("/phone-log/today", async (req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const logs = await db
    .select()
    .from(phoneLogTable)
    .where(gte(phoneLogTable.loggedAt, today))
    .orderBy(desc(phoneLogTable.loggedAt));

  res.json(logs);
});

export default router;

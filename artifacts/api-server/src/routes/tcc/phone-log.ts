import { Router, type IRouter } from "express";
import { db, phoneLogTable, contactsTable } from "@workspace/db";
import { eq, desc, gte, and, sql } from "drizzle-orm";

const router: IRouter = Router();

const VALID_TYPES = ["call_outbound", "call_inbound", "sms_outbound", "sms_inbound"] as const;
type PhoneLogType = typeof VALID_TYPES[number];

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
router.post("/phone-log", async (req, res): Promise<void> => {
  if (!checkSecret(req, res)) return;

  const body = req.body as Record<string, unknown>;
  const type = body["type"] as string;
  const phone_number = body["phone_number"] as string;
  const duration_seconds = body["duration_seconds"] as number | undefined;
  const sms_body = body["sms_body"] as string | undefined;
  const logged_at = body["logged_at"] as string | undefined;

  if (!phone_number || !VALID_TYPES.includes(type as PhoneLogType)) {
    res.status(400).json({ error: "invalid body: phone_number and valid type required" });
    return;
  }
  const normalizedIncoming = normalizePhone(phone_number);

  // Auto-match to contact using functional index on regexp_replace(phone, '[^0-9]', '', 'g')
  const [match] = await db
    .select({ id: contactsTable.id, name: contactsTable.name })
    .from(contactsTable)
    .where(sql`regexp_replace(phone, '[^0-9]', '', 'g') = ${normalizedIncoming}`)
    .limit(1);

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

  let query = db.select().from(phoneLogTable).$dynamic();

  if (contactId && since) {
    query = query.where(and(eq(phoneLogTable.contactId, contactId), gte(phoneLogTable.loggedAt, new Date(since))));
  } else if (contactId) {
    query = query.where(eq(phoneLogTable.contactId, contactId));
  } else if (since) {
    query = query.where(gte(phoneLogTable.loggedAt, new Date(since)));
  }

  const logs = await query.orderBy(desc(phoneLogTable.loggedAt)).limit(50);
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

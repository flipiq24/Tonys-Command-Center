import { Router, type IRouter } from "express";
import { db, contactsTable, contactNotesTable, callLogTable } from "@workspace/db";
import { communicationLogTable } from "../../lib/schema-v2";
import { eq, ilike, or, and, sql, desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

router.get("/contacts", async (req, res): Promise<void> => {
  const { status, stage, type, category, search, limit = "50", offset = "0" } = req.query as Record<string, string>;
  const lim = Math.min(parseInt(limit) || 50, 200);
  const off = parseInt(offset) || 0;

  const conditions: import("drizzle-orm").SQL[] = [];

  if (status && status !== "All") conditions.push(eq(contactsTable.status, status));
  if (stage && stage !== "All") conditions.push(eq(contactsTable.pipelineStage, stage));
  if (type && type !== "All") conditions.push(eq(contactsTable.type, type));
  if (category && category !== "All") conditions.push(eq(contactsTable.category, category));

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(contactsTable.name, q),
        ilike(contactsTable.company, q),
        ilike(contactsTable.phone, q),
        ilike(contactsTable.email, q),
        ilike(contactsTable.title, q),
      )!
    );
  }

  const where = conditions.length === 1 ? conditions[0]
    : conditions.length > 1 ? and(...conditions)
    : undefined;

  const contacts = await db
    .select()
    .from(contactsTable)
    .where(where)
    .orderBy(
      sql`CASE status WHEN 'Hot' THEN 0 WHEN 'Warm' THEN 1 WHEN 'New' THEN 2 ELSE 3 END`,
      sql`CASE pipeline_stage WHEN 'Demo Scheduled' THEN 0 WHEN 'Negotiation' THEN 1 WHEN 'Proposal Sent' THEN 2 WHEN 'Qualified' THEN 3 WHEN 'Lead' THEN 4 ELSE 5 END`,
      contactsTable.name
    )
    .limit(lim)
    .offset(off);

  const countResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(contactsTable)
    .where(where);

  res.json({
    contacts,
    total: Number(countResult[0]?.count ?? 0),
    limit: lim,
    offset: off,
  });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/contacts/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) { res.status(404).json({ error: "Not found" }); return; }
  const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, id)).limit(1);
  if (!contact) { res.status(404).json({ error: "Not found" }); return; }

  const [notes, recentCalls, comms] = await Promise.all([
    db.select().from(contactNotesTable).where(eq(contactNotesTable.contactId, id)).orderBy(desc(contactNotesTable.createdAt)).limit(50),
    db.select().from(callLogTable).where(eq(callLogTable.contactId, id)).orderBy(desc(callLogTable.createdAt)).limit(20),
    db.select().from(communicationLogTable).where(eq(communicationLogTable.contactId, id)).orderBy(desc(communicationLogTable.loggedAt)).limit(30),
  ]);

  res.json({ ...contact, _notes: notes, _calls: recentCalls, _comms: comms });
});

router.post("/contacts", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  if (!body.name || typeof body.name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [contact] = await db.insert(contactsTable).values({
    name: String(body.name),
    company: body.company ? String(body.company) : undefined,
    status: body.status ? String(body.status) : "New",
    phone: body.phone ? String(body.phone) : undefined,
    email: body.email ? String(body.email) : undefined,
    type: body.type ? String(body.type) : undefined,
    category: body.category ? String(body.category) : undefined,
    title: body.title ? String(body.title) : undefined,
    nextStep: body.nextStep ? String(body.nextStep) : undefined,
    notes: body.notes ? String(body.notes) : undefined,
    source: body.source ? String(body.source) : undefined,
    pipelineStage: body.pipelineStage ? String(body.pipelineStage) : "Lead",
    dealValue: body.dealValue ? String(body.dealValue) : undefined,
    leadSource: body.leadSource ? String(body.leadSource) : undefined,
    linkedinUrl: body.linkedinUrl ? String(body.linkedinUrl) : undefined,
    website: body.website ? String(body.website) : undefined,
    tags: Array.isArray(body.tags) ? body.tags as string[] : undefined,
    followUpDate: body.followUpDate ? String(body.followUpDate) : undefined,
    expectedCloseDate: body.expectedCloseDate ? String(body.expectedCloseDate) : undefined,
    dealProbability: body.dealProbability ? Number(body.dealProbability) : undefined,
  }).returning();

  res.status(201).json(contact);
});

router.patch("/contacts/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  const body = req.body as Record<string, unknown>;

  const [current] = await db.select({ status: contactsTable.status, pipelineStage: contactsTable.pipelineStage })
    .from(contactsTable).where(eq(contactsTable.id, id)).limit(1);
  if (!current) { res.status(404).json({ error: "Not found" }); return; }

  const updateFields: Partial<typeof contactsTable.$inferInsert> = {};
  if ("name" in body) updateFields.name = String(body.name);
  if ("company" in body) updateFields.company = body.company ? String(body.company) : null;
  if ("status" in body) updateFields.status = body.status ? String(body.status) : "New";
  if ("phone" in body) updateFields.phone = body.phone ? String(body.phone) : null;
  if ("email" in body) updateFields.email = body.email ? String(body.email) : null;
  if ("type" in body) updateFields.type = body.type ? String(body.type) : null;
  if ("category" in body) updateFields.category = body.category ? String(body.category) : null;
  if ("title" in body) updateFields.title = body.title ? String(body.title) : null;
  if ("nextStep" in body) updateFields.nextStep = body.nextStep ? String(body.nextStep) : null;
  if ("lastContactDate" in body) updateFields.lastContactDate = body.lastContactDate ? String(body.lastContactDate) : null;
  if ("notes" in body) updateFields.notes = body.notes ? String(body.notes) : null;
  if ("source" in body) updateFields.source = body.source ? String(body.source) : null;
  if ("pipelineStage" in body) updateFields.pipelineStage = body.pipelineStage ? String(body.pipelineStage) : "Lead";
  if ("dealValue" in body) updateFields.dealValue = body.dealValue != null ? String(body.dealValue) : null;
  if ("leadSource" in body) updateFields.leadSource = body.leadSource ? String(body.leadSource) : null;
  if ("linkedinUrl" in body) updateFields.linkedinUrl = body.linkedinUrl ? String(body.linkedinUrl) : null;
  if ("website" in body) updateFields.website = body.website ? String(body.website) : null;
  if ("tags" in body) updateFields.tags = Array.isArray(body.tags) ? body.tags as string[] : null;
  if ("followUpDate" in body) updateFields.followUpDate = body.followUpDate ? String(body.followUpDate) : null;
  if ("expectedCloseDate" in body) updateFields.expectedCloseDate = body.expectedCloseDate ? String(body.expectedCloseDate) : null;
  if ("dealProbability" in body) updateFields.dealProbability = body.dealProbability != null ? Number(body.dealProbability) : null;
  updateFields.updatedAt = new Date();

  const [updated] = await db.update(contactsTable).set(updateFields).where(eq(contactsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  const activityNotes: { contactId: string; text: string; kind: string }[] = [];
  if ("status" in body && updateFields.status && updateFields.status !== current.status) {
    activityNotes.push({ contactId: id, text: `Status changed: ${current.status ?? "—"} → ${updateFields.status}`, kind: "status_change" });
  }
  if ("pipelineStage" in body && updateFields.pipelineStage && updateFields.pipelineStage !== current.pipelineStage) {
    activityNotes.push({ contactId: id, text: `Stage moved: ${current.pipelineStage ?? "—"} → ${updateFields.pipelineStage}`, kind: "stage_change" });
  }
  if (activityNotes.length > 0) {
    await db.insert(contactNotesTable).values(activityNotes).catch(() => {});
  }

  res.json(updated);
});

router.delete("/contacts/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  const [deleted] = await db.delete(contactsTable).where(eq(contactsTable.id, id)).returning({ id: contactsTable.id });
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true, id: deleted.id });
});

router.get("/contacts/:id/notes", async (req, res): Promise<void> => {
  const { id } = req.params;
  const notes = await db.select().from(contactNotesTable).where(eq(contactNotesTable.contactId, id)).orderBy(desc(contactNotesTable.createdAt)).limit(100);
  res.json(notes);
});

router.post("/contacts/:id/notes", async (req, res): Promise<void> => {
  const { id } = req.params;
  const body = req.body as Record<string, unknown>;
  if (!body.text || typeof body.text !== "string" || !body.text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const [note] = await db.insert(contactNotesTable).values({
    contactId: id,
    text: body.text.trim(),
  }).returning();

  res.status(201).json(note);
});

// ─── POST /contacts/scan-card ─────────────────────────────────────────────
// Accepts a base64 image, uses Claude vision to extract contact details
router.post("/contacts/scan-card", async (req, res): Promise<void> => {
  const { imageBase64, mimeType } = req.body as { imageBase64?: string; mimeType?: string };
  if (!imageBase64) { res.status(400).json({ error: "imageBase64 required" }); return; }

  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const mt = (mimeType && allowedTypes.includes(mimeType) ? mimeType : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mt, data: imageBase64 },
          },
          {
            type: "text",
            text: `Extract contact information from this business card image. Return ONLY a JSON object with these fields (omit any field not found):
{"name":"","company":"","title":"","phone":"","email":"","website":"","linkedin":"","notes":""}
Rules: phone in format (xxx) xxx-xxxx if possible, notes = any extra info not in other fields. No markdown, no explanation.`,
          },
        ],
      }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    const raw = textBlock?.type === "text" ? textBlock.text.trim() : "{}";

    let parsed: Record<string, string> = {};
    try {
      // Handle potential markdown code fences
      const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {};
    }

    res.json(parsed);
  } catch (err) {
    req.log.error({ err }, "Business card scan failed");
    res.status(500).json({ error: "Scan failed" });
  }
});

export default router;

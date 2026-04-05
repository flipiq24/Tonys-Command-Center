import { Router, type IRouter } from "express";
import { db, contactsTable } from "@workspace/db";
import { contactIntelligenceTable, communicationLogTable, contactBriefsTable } from "../../lib/schema-v2";
import { eq, desc, gte, lt, lte, and, sql, isNotNull, or, isNull, inArray } from "drizzle-orm";
import { todayPacific } from "../../lib/dates";

const router: IRouter = Router();

router.get("/sales/morning", async (_req, res): Promise<void> => {
  try {
    const todayStr = todayPacific();
    const now = new Date();
    const hours48Ago = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const hours24Ago = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Tier 1: Urgent inbound comms — LEFT JOIN contacts + intel in a single query
    const urgentRows = await db
      .selectDistinctOn([communicationLogTable.contactId], {
        contactId: communicationLogTable.contactId,
        channel: communicationLogTable.channel,
        summary: communicationLogTable.summary,
        subject: communicationLogTable.subject,
        loggedAt: communicationLogTable.loggedAt,
        contactName: contactsTable.name,
        contactCompany: contactsTable.company,
        contactStatus: contactsTable.status,
        contactPhone: contactsTable.phone,
        contactEmail: contactsTable.email,
        contactType: contactsTable.type,
        contactNextStep: contactsTable.nextStep,
        aiScore: contactIntelligenceTable.aiScore,
        aiScoreReason: contactIntelligenceTable.aiScoreReason,
        stage: contactIntelligenceTable.stage,
      })
      .from(communicationLogTable)
      .leftJoin(contactsTable, eq(contactsTable.id, communicationLogTable.contactId))
      .leftJoin(contactIntelligenceTable, eq(contactIntelligenceTable.contactId, communicationLogTable.contactId))
      .where(
        and(
          gte(communicationLogTable.loggedAt, hours48Ago),
          isNotNull(communicationLogTable.contactId),
          or(
            eq(communicationLogTable.channel, "email_received"),
            eq(communicationLogTable.channel, "call_inbound"),
            eq(communicationLogTable.channel, "text_received"),
          )
        )
      )
      .orderBy(communicationLogTable.contactId, desc(communicationLogTable.loggedAt));

    const seenContactIds = new Set<string>();
    const urgentResponses = [];
    for (const u of urgentRows) {
      if (!u.contactId || !u.contactName) continue;
      if (seenContactIds.has(u.contactId)) continue;
      seenContactIds.add(u.contactId);
      urgentResponses.push({
        id: u.contactId,
        name: u.contactName,
        company: u.contactCompany,
        status: u.contactStatus,
        phone: u.contactPhone,
        email: u.contactEmail,
        type: u.contactType,
        nextStep: u.contactNextStep,
        aiScore: u.aiScore || null,
        aiScoreReason: u.aiScoreReason || null,
        stage: u.stage || "new",
        lastComm: { channel: u.channel, summary: u.summary || u.subject, loggedAt: u.loggedAt },
      });
    }

    // Tier 2: Follow-ups due today — LEFT JOIN contacts + intel in a single query
    const followUpRows = await db
      .select({
        contactId: contactIntelligenceTable.contactId,
        stage: contactIntelligenceTable.stage,
        aiScore: contactIntelligenceTable.aiScore,
        aiScoreReason: contactIntelligenceTable.aiScoreReason,
        nextAction: contactIntelligenceTable.nextAction,
        nextActionDate: contactIntelligenceTable.nextActionDate,
        lastCommunicationDate: contactIntelligenceTable.lastCommunicationDate,
        lastCommunicationType: contactIntelligenceTable.lastCommunicationType,
        lastCommunicationSummary: contactIntelligenceTable.lastCommunicationSummary,
        contactName: contactsTable.name,
        contactCompany: contactsTable.company,
        contactStatus: contactsTable.status,
        contactPhone: contactsTable.phone,
        contactEmail: contactsTable.email,
        contactType: contactsTable.type,
        contactNextStep: contactsTable.nextStep,
      })
      .from(contactIntelligenceTable)
      .leftJoin(contactsTable, eq(contactsTable.id, contactIntelligenceTable.contactId))
      .where(
        and(
          isNotNull(contactIntelligenceTable.nextActionDate),
          lte(contactIntelligenceTable.nextActionDate, todayStr)
        )
      )
      .orderBy(contactIntelligenceTable.nextActionDate);

    const followUps = [];
    for (const f of followUpRows) {
      if (!f.contactId || !f.contactName) continue;
      if (seenContactIds.has(f.contactId)) continue;
      seenContactIds.add(f.contactId);
      followUps.push({
        id: f.contactId,
        name: f.contactName,
        company: f.contactCompany,
        status: f.contactStatus,
        phone: f.contactPhone,
        email: f.contactEmail,
        type: f.contactType,
        nextStep: f.contactNextStep,
        aiScore: f.aiScore,
        aiScoreReason: f.aiScoreReason,
        stage: f.stage || "new",
        nextAction: f.nextAction,
        nextActionDate: f.nextActionDate,
        lastComm: {
          date: f.lastCommunicationDate,
          type: f.lastCommunicationType,
          summary: f.lastCommunicationSummary,
        },
      });
    }

    // Tier 3: Top prospects by AI score — LEFT JOIN contacts, sorted by broker/investor in SQL
    const top10Rows = await db
      .select({
        contactId: contactIntelligenceTable.contactId,
        aiScore: contactIntelligenceTable.aiScore,
        aiScoreReason: contactIntelligenceTable.aiScoreReason,
        stage: contactIntelligenceTable.stage,
        lastCommunicationDate: contactIntelligenceTable.lastCommunicationDate,
        lastCommunicationType: contactIntelligenceTable.lastCommunicationType,
        lastCommunicationSummary: contactIntelligenceTable.lastCommunicationSummary,
        contactName: contactsTable.name,
        contactCompany: contactsTable.company,
        contactStatus: contactsTable.status,
        contactPhone: contactsTable.phone,
        contactEmail: contactsTable.email,
        contactType: contactsTable.type,
        contactNextStep: contactsTable.nextStep,
      })
      .from(contactIntelligenceTable)
      .leftJoin(contactsTable, eq(contactsTable.id, contactIntelligenceTable.contactId))
      .where(
        or(
          isNull(contactIntelligenceTable.lastCommunicationDate),
          lt(contactIntelligenceTable.lastCommunicationDate, hours24Ago)
        )
      )
      .orderBy(
        sql`CASE WHEN LOWER(${contactsTable.type}) LIKE '%broker%' OR LOWER(${contactsTable.type}) LIKE '%investor%' THEN 0 ELSE 1 END`,
        desc(contactIntelligenceTable.aiScore)
      )
      .limit(20);

    const top10New = [];
    for (const t of top10Rows) {
      if (!t.contactId || !t.contactName) continue;
      if (seenContactIds.has(t.contactId)) continue;
      seenContactIds.add(t.contactId);
      top10New.push({
        id: t.contactId,
        name: t.contactName,
        company: t.contactCompany,
        status: t.contactStatus,
        phone: t.contactPhone,
        email: t.contactEmail,
        type: t.contactType,
        nextStep: t.contactNextStep,
        aiScore: t.aiScore,
        aiScoreReason: t.aiScoreReason,
        stage: t.stage || "new",
        lastComm: {
          date: t.lastCommunicationDate,
          type: t.lastCommunicationType,
          summary: t.lastCommunicationSummary,
        },
      });
    }

    const stageCounts = await db
      .select({
        stage: contactIntelligenceTable.stage,
        count: sql<number>`COUNT(*)`,
      })
      .from(contactIntelligenceTable)
      .groupBy(contactIntelligenceTable.stage);

    const statusCounts = await db
      .select({
        status: contactsTable.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(contactsTable)
      .groupBy(contactsTable.status);

    const [overdueRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(contactIntelligenceTable)
      .where(
        and(
          isNotNull(contactIntelligenceTable.nextActionDate),
          lt(contactIntelligenceTable.nextActionDate, todayStr)
        )
      );

    const pipelineSummary = {
      byStage: Object.fromEntries(stageCounts.map(s => [s.stage || "new", Number(s.count)])),
      byStatus: Object.fromEntries(statusCounts.map(s => [s.status || "New", Number(s.count)])),
      overdue: Number(overdueRow?.count || 0),
    };

    // ── Batch brief-line lookup for all displayed contacts ────────────────────
    const allIds = [...seenContactIds];
    const briefMap: Record<string, string> = {};
    if (allIds.length > 0) {
      try {
        const briefs = await db
          .select({ contactId: contactBriefsTable.contactId, briefText: contactBriefsTable.briefText })
          .from(contactBriefsTable)
          .where(inArray(contactBriefsTable.contactId, allIds))
          .orderBy(desc(contactBriefsTable.generatedAt));
        for (const b of briefs) {
          if (b.contactId && !briefMap[b.contactId]) {
            briefMap[b.contactId] = (b.briefText || "").slice(0, 120);
          }
        }
      } catch { /* brief lines are best-effort */ }
    }

    res.json({
      urgentResponses: urgentResponses.map(c => ({ ...c, briefLine: briefMap[c.id as string] || null })),
      followUps: followUps.map(c => ({ ...c, briefLine: briefMap[c.id as string] || null })),
      top10New: top10New.slice(0, 10).map(c => ({ ...c, briefLine: briefMap[c.id as string] || null })),
      pipelineSummary,
    });
  } catch (err) {
    console.error("[sales-morning] Error:", err);
    res.status(500).json({ error: "Failed to build morning sales data" });
  }
});

const VALID_STAGES = ["new", "outreach", "engaged", "meeting_scheduled", "negotiating", "closed", "dormant"];

router.post("/contacts/:contactId/stage", async (req, res): Promise<void> => {
  const { contactId } = req.params;
  const { stage } = req.body;

  if (!stage || !VALID_STAGES.includes(stage)) {
    res.status(400).json({ error: `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}` });
    return;
  }

  try {
    const [existing] = await db.select().from(contactIntelligenceTable)
      .where(eq(contactIntelligenceTable.contactId, contactId)).limit(1);

    if (existing) {
      await db.update(contactIntelligenceTable)
        .set({ stage, updatedAt: new Date() })
        .where(eq(contactIntelligenceTable.contactId, contactId));
    } else {
      await db.insert(contactIntelligenceTable).values({ contactId, stage });
    }

    res.json({ ok: true, stage });
  } catch (err) {
    console.error("[stage update] Error:", err);
    res.status(500).json({ error: "Failed to update stage" });
  }
});

const VALID_STATUSES = ["Hot", "Warm", "Cold", "New"];

router.post("/contacts/:contactId/status", async (req, res): Promise<void> => {
  const { contactId } = req.params;
  const { status } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  try {
    await db.update(contactsTable)
      .set({ status })
      .where(eq(contactsTable.id, contactId));
    res.json({ ok: true, status });
  } catch (err) {
    console.error("[status update] Error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

router.post("/contacts/:contactId/call-outcome", async (req, res): Promise<void> => {
  const { contactId } = req.params;
  const { outcomeNotes, nextStep, followUpDate } = req.body;

  try {
    const [existing] = await db.select().from(contactIntelligenceTable)
      .where(eq(contactIntelligenceTable.contactId, contactId)).limit(1);

    const updates: Record<string, any> = {
      nextAction: nextStep || null,
      nextActionDate: followUpDate || null,
      lastCommunicationDate: new Date(),
      lastCommunicationType: "call_outbound",
      lastCommunicationSummary: outcomeNotes || "Connected call",
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(contactIntelligenceTable).set(updates)
        .where(eq(contactIntelligenceTable.contactId, contactId));
    } else {
      await db.insert(contactIntelligenceTable).values({ contactId, ...updates });
    }

    const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
    await db.insert(communicationLogTable).values({
      contactId,
      contactName: contact?.name || "Unknown",
      channel: "call_outbound",
      summary: outcomeNotes || "Connected call",
    });

    let calendarEventId = null;
    if (followUpDate) {
      try {
        const { createEvent } = await import("../../lib/gcal");
        const followUp = new Date(followUpDate);
        followUp.setHours(9, 0, 0, 0);
        const endTime = new Date(followUp.getTime() + 15 * 60 * 1000);
        const result = await createEvent({
          summary: `Follow up: ${contact?.name || "Contact"}`,
          start: followUp.toISOString(),
          end: endTime.toISOString(),
          description: `Next step: ${nextStep || "Follow up"}\n\nCall notes: ${outcomeNotes || "N/A"}`,
        });
        if (result.ok) calendarEventId = result.eventId;
      } catch { /* calendar reminder is best-effort */ }
    }

    res.json({ ok: true, calendarEventId });
  } catch (err) {
    console.error("[call-outcome] Error:", err);
    res.status(500).json({ error: "Failed to log call outcome" });
  }
});

export default router;

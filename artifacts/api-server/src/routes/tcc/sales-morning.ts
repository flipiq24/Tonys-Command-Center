import { Router, type IRouter } from "express";
import { db, contactsTable } from "@workspace/db";
import { contactIntelligenceTable, communicationLogTable } from "../../lib/schema-v2";
import { eq, desc, gte, lte, and, sql, isNotNull, or, isNull } from "drizzle-orm";

const router: IRouter = Router();

router.get("/sales/morning", async (_req, res): Promise<void> => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const hours48Ago = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const urgentComms = await db
      .selectDistinctOn([communicationLogTable.contactId], {
        contactId: communicationLogTable.contactId,
        contactName: communicationLogTable.contactName,
        channel: communicationLogTable.channel,
        summary: communicationLogTable.summary,
        subject: communicationLogTable.subject,
        loggedAt: communicationLogTable.loggedAt,
      })
      .from(communicationLogTable)
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

    const urgentResponses = [];
    for (const u of urgentComms) {
      if (!u.contactId) continue;
      const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, u.contactId)).limit(1);
      const [intel] = await db.select().from(contactIntelligenceTable).where(eq(contactIntelligenceTable.contactId, u.contactId)).limit(1);
      if (contact) {
        urgentResponses.push({
          ...contact,
          aiScore: intel?.aiScore || null,
          aiScoreReason: intel?.aiScoreReason || null,
          stage: intel?.stage || "new",
          lastComm: { channel: u.channel, summary: u.summary || u.subject, loggedAt: u.loggedAt },
        });
      }
    }

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
      })
      .from(contactIntelligenceTable)
      .where(
        and(
          isNotNull(contactIntelligenceTable.nextActionDate),
          lte(contactIntelligenceTable.nextActionDate, todayStr)
        )
      )
      .orderBy(contactIntelligenceTable.nextActionDate);

    const followUps = [];
    for (const f of followUpRows) {
      if (!f.contactId) continue;
      const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, f.contactId)).limit(1);
      if (contact) {
        followUps.push({
          ...contact,
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
    }

    const top10Rows = await db
      .select({
        contactId: contactIntelligenceTable.contactId,
        aiScore: contactIntelligenceTable.aiScore,
        aiScoreReason: contactIntelligenceTable.aiScoreReason,
        stage: contactIntelligenceTable.stage,
        lastCommunicationDate: contactIntelligenceTable.lastCommunicationDate,
        lastCommunicationType: contactIntelligenceTable.lastCommunicationType,
        lastCommunicationSummary: contactIntelligenceTable.lastCommunicationSummary,
      })
      .from(contactIntelligenceTable)
      .where(
        or(
          isNull(contactIntelligenceTable.lastCommunicationDate),
          lte(contactIntelligenceTable.lastCommunicationDate, hours24Ago)
        )
      )
      .orderBy(desc(contactIntelligenceTable.aiScore))
      .limit(20);

    const top10New = [];
    for (const t of top10Rows) {
      if (!t.contactId) continue;
      const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, t.contactId)).limit(1);
      if (contact) {
        top10New.push({
          ...contact,
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
    }

    top10New.sort((a, b) => {
      const aIsBroker = (a.type || "").toLowerCase().includes("broker") ? 0 : 1;
      const bIsBroker = (b.type || "").toLowerCase().includes("broker") ? 0 : 1;
      if (aIsBroker !== bIsBroker) return aIsBroker - bIsBroker;
      return (Number(b.aiScore) || 0) - (Number(a.aiScore) || 0);
    });

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
          lte(contactIntelligenceTable.nextActionDate, todayStr)
        )
      );

    const pipelineSummary = {
      byStage: Object.fromEntries(stageCounts.map(s => [s.stage || "new", Number(s.count)])),
      byStatus: Object.fromEntries(statusCounts.map(s => [s.status || "New", Number(s.count)])),
      overdue: Number(overdueRow?.count || 0),
    };

    res.json({
      urgentResponses,
      followUps,
      top10New: top10New.slice(0, 10),
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

import { Router, type IRouter } from "express";
import { db, meetingHistoryTable } from "@workspace/db";
import { eq, desc, ilike } from "drizzle-orm";

const router: IRouter = Router();

router.get("/meeting-history", async (req, res): Promise<void> => {
  const { contactName, limit = "20" } = req.query as Record<string, string>;
  const lim = Math.min(parseInt(limit) || 20, 100);

  let rows;
  if (contactName && contactName.trim()) {
    rows = await db
      .select()
      .from(meetingHistoryTable)
      .where(ilike(meetingHistoryTable.contactName, `%${contactName.trim()}%`))
      .orderBy(desc(meetingHistoryTable.date))
      .limit(lim);
  } else {
    rows = await db
      .select()
      .from(meetingHistoryTable)
      .orderBy(desc(meetingHistoryTable.date))
      .limit(lim);
  }

  res.json(rows);
});

router.post("/meeting-history", async (req, res): Promise<void> => {
  const { date, contactName, summary, nextSteps, outcome } = req.body as Record<string, string>;
  if (!date) { res.status(400).json({ error: "date is required" }); return; }

  const [row] = await db
    .insert(meetingHistoryTable)
    .values({ date, contactName: contactName ?? null, summary: summary ?? null, nextSteps: nextSteps ?? null, outcome: outcome ?? null })
    .returning();

  res.status(201).json(row);
});

router.delete("/meeting-history/:id", async (req, res): Promise<void> => {
  await db.delete(meetingHistoryTable).where(eq(meetingHistoryTable.id, req.params.id));
  res.json({ ok: true });
});

export default router;

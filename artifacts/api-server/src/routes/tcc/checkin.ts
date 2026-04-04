import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, checkinsTable } from "@workspace/db";
import { SaveCheckinBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/checkin/today", async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const [checkin] = await db
    .select()
    .from(checkinsTable)
    .where(eq(checkinsTable.date, today));

  if (!checkin) {
    res.json({ id: null, date: today, bedtime: null, waketime: null, sleepHours: null, bible: false, workout: false, journal: false, nutrition: "Good", unplug: false, done: false });
    return;
  }

  res.json({ ...checkin, done: true });
});

router.post("/checkin", async (req, res): Promise<void> => {
  const parsed = SaveCheckinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const data = parsed.data;

  // Use ON CONFLICT DO UPDATE to avoid select-then-insert race condition
  const [checkin] = await db
    .insert(checkinsTable)
    .values({
      date: today,
      bedtime: data.bedtime ?? undefined,
      waketime: data.waketime ?? undefined,
      sleepHours: data.sleepHours ?? undefined,
      bible: data.bible ?? false,
      workout: data.workout ?? false,
      journal: data.journal ?? false,
      nutrition: data.nutrition ?? "Good",
      unplug: data.unplug ?? false,
    })
    .onConflictDoUpdate({
      target: checkinsTable.date,
      set: {
        bedtime: data.bedtime ?? undefined,
        waketime: data.waketime ?? undefined,
        sleepHours: data.sleepHours ?? undefined,
        bible: data.bible ?? undefined,
        workout: data.workout ?? undefined,
        journal: data.journal ?? undefined,
        nutrition: data.nutrition ?? undefined,
        unplug: data.unplug ?? undefined,
      },
    })
    .returning();

  res.json({ ...checkin, done: true });
});

export default router;

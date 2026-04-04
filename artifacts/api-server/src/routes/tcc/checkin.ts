import { Router, type IRouter } from "express";
import { eq, desc, lt } from "drizzle-orm";
import { db, checkinsTable } from "@workspace/db";
import { SaveCheckinBody } from "@workspace/api-zod";
import { todayPacific } from "../../lib/dates.js";

const router: IRouter = Router();

router.get("/checkin/today", async (req, res): Promise<void> => {
  const today = todayPacific();
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

  const today = todayPacific();
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

  // Pattern analysis: look at last 7 check-ins
  const recent = await db
    .select()
    .from(checkinsTable)
    .where(lt(checkinsTable.date, today))
    .orderBy(desc(checkinsTable.date))
    .limit(7);

  const alerts: { type: string; message: string; level: "high" | "mid" | "low" }[] = [];

  if (recent.length >= 3) {
    const sleepValues = recent
      .map(r => parseFloat(r.sleepHours ?? "0"))
      .filter(v => v > 0);
    if (sleepValues.length >= 3) {
      const avgSleep = sleepValues.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      if (avgSleep < 6.5) {
        alerts.push({ type: "sleep", message: `Avg sleep this week: ${avgSleep.toFixed(1)}h — You're running a sleep debt. Performance will drop.`, level: "high" });
      }
    }

    const noWorkout = recent.slice(0, 3).filter(r => !r.workout).length;
    if (noWorkout >= 3) {
      alerts.push({ type: "workout", message: `Missed workout 3 days in a row. Body and mind need this — get back on it.`, level: "mid" });
    }

    const noBible = recent.slice(0, 3).filter(r => !r.bible).length;
    if (noBible >= 3) {
      alerts.push({ type: "bible", message: `No Bible time 3 days straight. This is your anchor. Don't drift.`, level: "mid" });
    }

    const badNut = recent.slice(0, 4).filter(r => r.nutrition === "Bad").length;
    if (badNut >= 3) {
      alerts.push({ type: "nutrition", message: `Poor nutrition ${badNut} of last 4 days. Fuel matters for focus and deals.`, level: "mid" });
    }

    const noUnplug = recent.slice(0, 3).filter(r => !r.unplug).length;
    if (noUnplug >= 3) {
      alerts.push({ type: "unplug", message: `Didn't unplug at 6PM for 3 days straight. Recovery is part of performance.`, level: "low" });
    }
  }

  res.json({ ...checkin, done: true, patternAlerts: alerts });
});

export default router;

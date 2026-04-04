import { Router, type IRouter } from "express";
import { eq, gte } from "drizzle-orm";
import { db, manualScheduleEventsTable, callLogTable, ideasTable } from "@workspace/db";
import { todayPacific } from "../../lib/dates.js";
import z from "zod";

const router: IRouter = Router();

const CALL_QUOTA = 10;
const CALL_START_MIN = 9 * 60;   // 9:00 AM
const CALL_END_MIN   = 16 * 60;  // 4:00 PM

function parseTimeToMinutes(t: string): number | null {
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

async function getTodayCallCount(): Promise<number> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const calls = await db.select().from(callLogTable).where(gte(callLogTable.createdAt, today));
    return calls.length;
  } catch { return 0; }
}

const AddEventBody = z.object({
  time: z.string().min(1),
  timeEnd: z.string().optional(),
  title: z.string().min(1),
  type: z.string().min(1),
  category: z.string().min(1),
  importance: z.enum(["high", "mid", "low"]).default("mid"),
  person: z.string().optional(),
  contactId: z.string().uuid().optional(),
  description: z.string().optional(),
  briefing: z.string().optional(),
  forceOverride: z.boolean().optional(),
});

// GET today's manual events
router.get("/schedule/manual", async (req, res): Promise<void> => {
  const today = todayPacific();
  const events = await db
    .select()
    .from(manualScheduleEventsTable)
    .where(eq(manualScheduleEventsTable.date, today));
  res.json(events);
});

// POST add schedule item (with guilt trip check)
router.post("/schedule/add", async (req, res): Promise<void> => {
  const parsed = AddEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { time, timeEnd, title, type, category, importance, person, contactId, description, briefing, forceOverride } = parsed.data;
  const today = todayPacific();

  // ── Guilt trip logic ────────────────────────────────────────────────────────
  let guiltTrip = false;
  let guiltTripMsg = "";
  let callsMade = 0;

  if (importance !== "high" && !forceOverride) {
    const eventMin = parseTimeToMinutes(time);
    if (eventMin !== null && eventMin >= CALL_START_MIN && eventMin < CALL_END_MIN) {
      callsMade = await getTodayCallCount();
      if (callsMade < CALL_QUOTA) {
        guiltTrip = true;
        guiltTripMsg = `You're scheduling a ${importance}-priority ${type} during call hours (${time}) and you've only made ${callsMade} of ${CALL_QUOTA} calls today. This will be flagged in your EOD report to Ethan.`;
      }
    }
  }

  // If guilt trip and not forcing, just return the warning — don't save yet
  if (guiltTrip && !forceOverride) {
    res.json({ ok: false, guiltTrip: true, guiltTripMsg, callsMade, quotaTarget: CALL_QUOTA });
    return;
  }

  // Build override reason if forced
  const overrideReason = forceOverride && guiltTripMsg
    ? guiltTripMsg
    : forceOverride
    ? `Forced override: ${importance}-priority ${type} at ${time} during call hours (${callsMade} calls made)`
    : null;

  // Save the event
  const [event] = await db
    .insert(manualScheduleEventsTable)
    .values({
      date: today,
      time,
      timeEnd: timeEnd || null,
      title,
      type,
      category,
      importance,
      person: person || null,
      contactId: contactId || null,
      description: description || null,
      briefing: briefing || null,
      forcedOverride: forceOverride ? 1 : 0,
      overrideReason,
    })
    .returning();

  // Log override to ideasTable so EOD Ethan report picks it up
  if (forceOverride && overrideReason) {
    const overrideText = `⚠️ FORCED MEETING: ${person ? `${person} — ` : ""}${title} at ${time} | ${importance.toUpperCase()} priority | Calls: ${callsMade}/${CALL_QUOTA}`;
    await db.insert(ideasTable).values({
      text: overrideText,
      category: "accountability",
      urgency: "high",
      status: "override",
    }).catch(() => { /* non-critical */ });
  }

  res.json({ ok: true, event, forcedOverride: forceOverride || false });
});

export default router;

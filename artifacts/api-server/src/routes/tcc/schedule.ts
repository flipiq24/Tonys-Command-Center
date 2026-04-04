import { Router, type IRouter } from "express";
import { gte } from "drizzle-orm";
import { db, callLogTable, ideasTable } from "@workspace/db";
import { createEvent } from "../../lib/gcal.js";
import z from "zod";

const router: IRouter = Router();

const CALL_QUOTA = 10;
const CALL_START_MIN = 9 * 60;   // 9:00 AM
const CALL_END_MIN   = 16 * 60;  // 4:00 PM

function timeToMinutes(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function buildISO(date: string, time: string): string {
  // date = YYYY-MM-DD, time = HH:MM (24h)
  return `${date}T${time}:00-07:00`; // Pacific (PT) — handles DST offset
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
  title: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  allDay: z.boolean().optional().default(false),
  startTime: z.string().optional(),  // HH:MM (24h)
  endTime: z.string().optional(),    // HH:MM (24h)
  location: z.string().optional(),
  description: z.string().optional(),
  notification: z.number().optional().default(10), // minutes
  guests: z.array(z.string()).optional().default([]),
  forceOverride: z.boolean().optional().default(false),
});

router.post("/schedule/add", async (req, res): Promise<void> => {
  const parsed = AddEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, date, allDay, startTime, endTime, location, description, notification, guests, forceOverride } = parsed.data;

  // ── Guilt-trip check (only for timed events during call hours) ───────────
  let guiltTrip = false;
  let guiltTripMsg = "";
  let callsMade = 0;

  if (!allDay && !forceOverride && startTime) {
    const eventMin = timeToMinutes(startTime);
    if (eventMin !== null && eventMin >= CALL_START_MIN && eventMin < CALL_END_MIN) {
      callsMade = await getTodayCallCount();
      if (callsMade < CALL_QUOTA) {
        guiltTrip = true;
        guiltTripMsg = `You're scheduling "${title}" at ${startTime} during call hours and you've only made ${callsMade} of ${CALL_QUOTA} calls today. This will be flagged in your EOD report.`;
      }
    }
  }

  if (guiltTrip && !forceOverride) {
    res.json({ ok: false, guiltTrip: true, guiltTripMsg, callsMade, quotaTarget: CALL_QUOTA });
    return;
  }

  // ── Build Google Calendar event ──────────────────────────────────────────
  let gcalStart: string;
  let gcalEnd: string;

  if (allDay) {
    gcalStart = date;
    gcalEnd = date;
  } else {
    gcalStart = buildISO(date, startTime || "09:00");
    gcalEnd   = buildISO(date, endTime   || "10:00");
  }

  const gcalResult = await createEvent({
    summary: title,
    start: gcalStart,
    end: gcalEnd,
    attendees: guests.length > 0 ? guests : undefined,
    description: description,
    location: location,
  });

  if (!gcalResult.ok) {
    res.status(500).json({ ok: false, error: gcalResult.error || "Failed to create Google Calendar event" });
    return;
  }

  // ── Log forced override to EOD ────────────────────────────────────────────
  if (forceOverride && guiltTripMsg) {
    const overrideText = `⚠️ FORCED MEETING: ${title} at ${startTime} on ${date} | Calls: ${callsMade}/${CALL_QUOTA}`;
    await db.insert(ideasTable).values({
      text: overrideText,
      category: "accountability",
      urgency: "high",
      status: "override",
    }).catch(() => { /* non-critical */ });
  }

  res.json({ ok: true, eventId: gcalResult.eventId, htmlLink: gcalResult.htmlLink });
});

export default router;

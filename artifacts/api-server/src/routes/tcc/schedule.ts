import { Router, type IRouter } from "express";
import { gte } from "drizzle-orm";
import { db, callLogTable, ideasTable } from "@workspace/db";
import { createEvent } from "../../lib/gcal.js";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { postSlackMessage } from "../../lib/slack.js";
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

function getPacificOffset(dateStr: string): string {
  // Determine whether the given date falls in PDT (UTC-7) or PST (UTC-8)
  // PDT: 2nd Sunday of March 2 AM → 1st Sunday of November 2 AM
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  // 2nd Sunday of March
  const marchFirst = new Date(Date.UTC(year, 2, 1));
  const marchSecondSun = new Date(Date.UTC(year, 2,
    (marchFirst.getUTCDay() === 0 ? 8 : 15 - marchFirst.getUTCDay())));
  // 1st Sunday of November
  const novFirst = new Date(Date.UTC(year, 10, 1));
  const novFirstSun = new Date(Date.UTC(year, 10,
    (novFirst.getUTCDay() === 0 ? 1 : 8 - novFirst.getUTCDay())));
  return d >= marchSecondSun && d < novFirstSun ? "-07:00" : "-08:00";
}

function buildISO(date: string, time: string): string {
  // date = YYYY-MM-DD, time = HH:MM (24h)
  return `${date}T${time}:00${getPacificOffset(date)}`;
}

async function getTodayCallCount(): Promise<number> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const calls = await db.select().from(callLogTable).where(gte(callLogTable.createdAt, today));
    return calls.length;
  } catch { return 0; }
}

const CATEGORY_COLOR_ID: Record<string, string> = {
  "TECH":           "9",  // Basil (dark green)
  "OPERATIONS":     "4",  // Flamingo (salmon)
  "DONE":           "11", // Graphite (gray)
  "FINANCE":        "1",  // Lavender (blue-purple)
  "IMPORTANT":      "10", // Tomato (red)
  "PROJECTS":       "5",  // Banana (yellow)
  "PERSONAL":       "3",  // Grape (purple)
  "MEETING":        "6",  // Tangerine (orange)
  "NEEDS PLANNING": "8",  // Blueberry (indigo)
  "SALES Tech":     "2",  // Sage (light green)
};

// ── Scope gatekeeper ─────────────────────────────────────────────────────────
// Priority: Sales activities > Ramy (CSM ops) > Ethan (COO ops) > Other
async function checkMeetingScope(title: string, description?: string): Promise<{
  inScope: boolean;
  category: "Sales" | "CSM" | "COO" | "Other";
  warning?: string;
}> {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: `You are Tony Diaz's scheduling gatekeeper for FlipIQ, a real estate wholesale platform.
Tony's daily priority: 10 Sales Calls first, then demos/follow-ups, then everything else.
Classify this meeting and return ONLY valid JSON.

Meeting: "${title}"${description ? `\nDescription: "${description}"` : ""}

Categories (in priority order):
- "Sales": Sales calls, demos, investor calls, buyer/seller conversations, acquisition calls
- "CSM": Ramy-related ops, OMS, title company, compliance, customer success
- "COO": Ethan-related ops, investor updates, legal, finance, hiring, Linear/engineering review
- "Other": Everything else — could distract from core revenue activities

Return: {"inScope": true/false, "category": "Sales|CSM|COO|Other", "warning": "optional one-line warning if Other"}
inScope = false ONLY if category is "Other" AND it seems like a distraction from revenue.
Return ONLY the JSON, no markdown.`
      }]
    });
    const block = msg.content[0];
    if (block.type !== "text") return { inScope: true, category: "Other" };
    const parsed = JSON.parse(block.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, ""));
    return { inScope: parsed.inScope ?? true, category: parsed.category ?? "Other", warning: parsed.warning };
  } catch {
    return { inScope: true, category: "Other" }; // fail open
  }
}

const ETHAN_SLACK_USER = "ethan"; // will DM via Slack if we can find his ID

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
  category: z.string().optional(),
  priority: z.string().optional(),
});

router.post("/schedule/add", async (req, res): Promise<void> => {
  const parsed = AddEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, date, allDay, startTime, endTime, location, description, notification, guests, forceOverride, category, priority } = parsed.data;
  const colorId = category ? CATEGORY_COLOR_ID[category] : undefined;

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

  // ── Scope gatekeeper (AI check — fires in parallel, non-blocking) ─────────
  let scopeWarning: string | undefined;
  let scopeCategory = "Other";
  if (!allDay) {
    const scope = await checkMeetingScope(title, description).catch(() => ({ inScope: true, category: "Other" as const }));
    scopeCategory = scope.category;
    if (!scope.inScope && !forceOverride) {
      res.json({
        ok: false, scopeBlock: true,
        scopeMsg: scope.warning || `"${title}" doesn't look like a Sales or ops meeting. Your North Star is 10 calls/day. Force override?`,
        scopeCategory: scope.category,
        callsMade, quotaTarget: CALL_QUOTA,
      });
      return;
    }
    if (!scope.inScope && forceOverride) {
      scopeWarning = scope.warning;
      // Notify Ethan via Slack that Tony force-overrode an out-of-scope meeting
      postSlackMessage({
        channel: "#ethan-alerts",
        text: `⚠️ Tony force-overrode a non-Sales meeting: *${title}* on ${date}${startTime ? ` at ${startTime}` : ""}\n_${scope.warning || "Flagged as out-of-scope by AI gatekeeper"}_`,
      }).catch(() => { /* non-critical */ });
    }
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

  const descParts = [];
  if (priority) descParts.push(`Priority: ${priority}`);
  if (description) descParts.push(description);

  const gcalResult = await createEvent({
    summary: title,
    start: gcalStart,
    end: gcalEnd,
    attendees: guests.length > 0 ? guests : undefined,
    description: descParts.join("\n\n") || undefined,
    location: location,
    colorId,
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

// ── AI Day Plan ────────────────────────────────────────────────────────────────
interface AiPlanBlock { start: string; end: string; label: string; items: string[]; tip?: string; }
// Cache keyed by date + input fingerprint so stale inputs on the same day
// produce a new plan, and different users (or different data) never share entries.
const AI_PLAN_CACHE = new Map<string, AiPlanBlock[]>();

const AiPlanBody = z.object({
  meetings: z.array(z.object({ time: z.string(), name: z.string(), tEnd: z.string().optional() })).default([]),
  contacts: z.array(z.object({ name: z.string(), company: z.string().optional(), status: z.string().optional() })).default([]),
  tasks:    z.array(z.string()).default([]),
  emails:   z.array(z.object({ from: z.string(), subject: z.string(), action: z.string().optional() })).default([]),
});

router.post("/schedule/ai-plan", async (req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const parsed = AiPlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { meetings, contacts, tasks, emails } = parsed.data;

  // Build a fingerprint from scheduling-critical fields (not just names) so that
  // changed meeting times, contact statuses, or task priorities produce a fresh plan
  // and different users on the same server never share a cache entry.
  const fingerprint = [
    meetings.slice(0, 3).map(m => `${m.name}@${m.time}-${m.tEnd ?? ""}`).join("+"),
    contacts.slice(0, 3).map(c => `${c.name}:${c.status ?? ""}`).join("+"),
    tasks.slice(0, 2).map(t => t.slice(0, 20)).join("+"),
    emails.slice(0, 2).map(e => `${e.from}:${e.action ?? ""}`).join("+"),
  ].join("|");
  const cacheKey = `${today}:${fingerprint}`;

  if (AI_PLAN_CACHE.has(cacheKey)) {
    res.json({ ok: true, blocks: AI_PLAN_CACHE.get(cacheKey) });
    return;
  }

  // Evict any stale same-day entries for different inputs to bound memory growth
  for (const key of AI_PLAN_CACHE.keys()) {
    if (key.startsWith(`${today}:`)) AI_PLAN_CACHE.delete(key);
  }

  const hotWarm = contacts.filter(c => c.status === "Hot" || c.status === "Warm");
  const others  = contacts.filter(c => c.status !== "Hot" && c.status !== "Warm");
  const sortedContacts = [...hotWarm, ...others].slice(0, 10);

  const prompt = `You are Tony Diaz's AI scheduler at FlipIQ. Today is ${today}. Tony's work day: 8:00 AM – 6:00 PM PT. Calls start at 8:00 AM minimum.

MEETINGS TODAY:
${meetings.length ? meetings.map(m => `  ${m.time}${m.tEnd ? "–" + m.tEnd : ""}: ${m.name}`).join("\n") : "  (none scheduled)"}

SALES CONTACTS (call in priority order — Hot first, then Warm, then others):
${sortedContacts.map((c, i) => `  ${i + 1}. ${c.name}${c.company ? " (" + c.company + ")" : ""} — ${c.status || "New"}`).join("\n") || "  (none)"}

TASKS:
${tasks.slice(0, 6).map((t, i) => `  ${i + 1}. ${t}`).join("\n") || "  (none)"}

PRIORITY EMAILS:
${emails.slice(0, 5).map(e => `  • From ${e.from}: "${e.subject}"${e.action ? " → " + e.action : ""}`).join("\n") || "  (none)"}

SCHEDULING RULES:
1. Calls window: 8:00 AM to the first meeting start (or 9:30 AM if first meeting is after 9:30). Average 8 minutes per call. Include Hot/Warm contacts first.
2. Tasks window: 15 minutes after each meeting ends. Pick 2-3 highest-value tasks per window.
3. Email block: Use the largest free afternoon window (ideally 11 AM–1 PM if free). List top priority emails.
4. Never schedule work during meetings.
5. Be realistic — don't overfill blocks. A focused 3-item list beats 10 rushed items.
6. Include a brief coaching tip per block (1 short sentence).

Return ONLY a valid JSON array, no markdown, no explanation. Format:
[{"start":"8:00 AM","end":"9:00 AM","label":"Sales Calls","items":["Call Mike Torres (Hot — Coko Acq.)","Call Sarah Chen (Warm)"],"tip":"Open with a question, not a pitch."}]`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    let raw = (response.content[0] as { type: string; text: string }).text.trim();
    // Strip markdown fences if present
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed2 = JSON.parse(raw);
    // Validate Claude's response shape before caching/returning
    if (!Array.isArray(parsed2)) throw new Error("AI response is not an array");
    const blocks: AiPlanBlock[] = parsed2.filter(
      (b: unknown): b is AiPlanBlock =>
        b !== null && typeof b === "object" &&
        typeof (b as Record<string, unknown>).start === "string" &&
        typeof (b as Record<string, unknown>).end === "string" &&
        typeof (b as Record<string, unknown>).label === "string" &&
        Array.isArray((b as Record<string, unknown>).items)
    );
    if (blocks.length === 0) throw new Error("AI response contained no valid blocks");
    AI_PLAN_CACHE.set(cacheKey, blocks);
    res.json({ ok: true, blocks });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;

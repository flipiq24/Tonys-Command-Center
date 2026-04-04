import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, dailyBriefsTable } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getUncachableGmailClient } from "../../lib/gmail.js";
import { getUncachableGoogleCalendarClient } from "../../lib/gcal.js";
import { getSlackChannelHistory } from "../../lib/slack.js";
import { getLinearIssues } from "../../lib/linear.js";

// ─── Full seed defaults — matches TCC_Seed_Data JSON ─────────────────────────

const DEFAULT_CAL = [
  { t: "8:00 AM", n: "Claremont Imaging Check-in", loc: "Bldg 3A, 255 E Bonita Ave, Pomona", note: "Call 909-450-0393", real: true },
  { t: "9:30 AM", n: "Jedi Kids", real: false },
  { t: "10:30 AM", n: "2K house payment + Martha", real: false },
  { t: "10:30 AM", n: "Review Chat — James 3:13", note: "Like 12:31", real: false },
  { t: "10:30 AM", n: "B12 + City of Hope + cancer + specialist + holistic", real: false },
  { t: "11:30 AM", n: "LinkedIn: mormilo", real: false },
  { t: "12:00 PM", n: "MP — luma.com", real: false },
  { t: "1:00 PM", n: "Gas Town — Steve Yegge AI orchestrator", real: false },
  { t: "1:00 PM", n: "Stitch + Remotion + Blender MCP", real: false },
  { t: "1:00 PM", n: "NEXUS — Network of Experts", real: false },
  { t: "2:00 PM", n: "What Tony STOPS Doing → Who Owns It", note: "Discuss on 3/23 meeting", real: false },
  { t: "3:00 PM", n: "Trojan Horse — in-house agent approach", real: false },
  { t: "5:30 PM", n: "High volume texting + social media + Usale", real: false },
  { t: "6:00 PM", n: "Unplug", real: false },
  { t: "8:00 PM", n: "Compliance — close out notes", real: false },
  { t: "8:30 PM", n: "Chris Craddock EXP Realty — great partner", real: false },
  { t: "9:30 PM", n: "House AMP — important!", real: false },
  { t: "10:30 PM", n: "Title Company Pitch", real: false },
  { t: "11:30 PM", n: "LinkedIn: shellycofini", real: false },
];

const DEFAULT_EMAILS_IMPORTANT = [
  { id: 1, from: "Ethan Jolly", subj: "My Amended Contract", why: "Equity stake decision — needs a call, not email reply", time: "Yesterday", p: "high" },
  { id: 2, from: "Chris Wesser", subj: "FlipIQ Lightning Docs Brief", why: "Capital raise — revisions with commentary coming tonight", time: "Today 8:38 AM", p: "high" },
  { id: 3, from: "Claude Team", subj: "$200 team credit", why: "Expires April 17 — Ethan asked if you redeemed", time: "Today 3:58 PM", p: "med" },
  { id: 4, from: "Fernando Perez", subj: "Off-market Chino fix/flip", why: "Deal opportunity — he asked for a call", time: "Today", p: "med" },
  { id: 5, from: "Sebastian Calder", subj: "Video sales letters — cost?", why: "Sales tool pricing inquiry", time: "Yesterday", p: "low" },
];

const DEFAULT_EMAILS_FYI = [
  { id: 10, from: "Dr. Fakhoury", subj: "Mom's medication update", why: "B12 shipping tomorrow, arrives Monday" },
  { id: 11, from: "David Breneman", subj: "Consultation Request", why: "Responded to Ethan — Got it, have a good weekend" },
  { id: 12, from: "Marisol Diaz", subj: "Physician referral", why: "Family medical coordination" },
];

const DEFAULT_SLACK = [
  { from: "Faisal", message: "Fixes deployed, live in 10-15 min", level: "low", channel: "#engineering" },
  { from: "Ethan", message: "My top 2 goals today. You?", level: "mid", channel: "#leadership" },
];

const DEFAULT_LINEAR = [
  { who: "Faisal", task: "Comps Map — full screen button", id: "COM-294", level: "low" },
  { who: "Haris", task: "CSM Emails — HTML compose", id: "COM-323", level: "mid" },
];

const DEFAULT_TASKS = [
  { id: "t1", text: "10 Sales Calls", cat: "SALES", sales: true },
  { id: "t2", text: "Reply to Ethan re: equity contract", cat: "OPS" },
  { id: "t3", text: "Follow up Chris Wesser — capital raise docs", cat: "SALES" },
  { id: "t4", text: "Sales demo website build", cat: "SALES" },
  { id: "t5", text: "HubSpot pipeline setup", cat: "OPS" },
  { id: "t6", text: "OMS Expectation Doc → Ramy", cat: "OPS" },
  { id: "t7", text: "Recruiter playbook + call — James", cat: "SALES" },
  { id: "t8", text: "Recruiter playbook + call — Jesse", cat: "SALES" },
  { id: "t9", text: "Podcast / intro video — Bondelin + Jessica", cat: "SALES" },
  { id: "t10", text: "AAA spec document", cat: "BUILD" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type CalItem = { t: string; n: string; loc?: string; note?: string; real: boolean };
type EmailImportant = { id: number; from: string; subj: string; why: string; time: string; p: string };
type EmailFyi = { id: number; from: string; subj: string; why: string };
type SlackItem = { from: string; message: string; level: string; channel: string };
type LinearItem = { who: string; task: string; id: string; level: string };

// ─── Live Gmail fetch via Replit google-mail connector ────────────────────────

async function fetchLiveEmails(): Promise<{ important: EmailImportant[]; fyi: EmailFyi[] } | null> {
  try {
    const gmail = await getUncachableGmailClient();
    const since = Math.floor((Date.now() - 48 * 60 * 60 * 1000) / 1000);
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: 15,
      q: `after:${since} is:unread`,
    });

    const messages = list.data.messages || [];
    if (messages.length === 0) return { important: [], fyi: [] };

    // Fetch all message details in parallel — avoids N+1 sequential awaits
    const details = await Promise.all(
      messages.slice(0, 12).map(msg =>
        gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        })
      )
    );

    const rawEmails: { from: string; subject: string; snippet: string; date: string }[] = [];
    for (const detail of details) {
      const hdrs = detail.data.payload?.headers || [];
      const hdr = (name: string) => hdrs.find(h => h.name === name)?.value || "";
      rawEmails.push({
        from: hdr("From").replace(/<[^>]+>/, "").replace(/^"|"$/g, "").trim(),
        subject: hdr("Subject"),
        snippet: detail.data.snippet || "",
        date: hdr("Date"),
      });
    }

    const claudeResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: `You are Tony Diaz's email triage assistant for FlipIQ (real estate wholesaling).
Classify each email as "important" (requires Tony's reply/action) or "fyi" (info only, no reply needed).
Important: from @flipiq.com team, known contacts (chris.wesser, ethan, ramy, marisol, cesar@eoslab), or keywords: urgent, contract, payment, demo, equity, funding, deal.
FYI: medical, receipts, real-person notifications.
Skip: newsletters, marketing, automated notifications, social media.
For important: extract from, subj, why (1 short sentence on WHY it needs action), time (friendly: Today/Yesterday/date), p (high/med/low).
For fyi: extract from, subj, why (1 short sentence summary).
Return ONLY valid JSON: { "important": [...], "fyi": [...] }
Important shape: { "from": string, "subj": string, "why": string, "time": string, "p": "high"|"med"|"low" }
FYI shape: { "from": string, "subj": string, "why": string }`,
      messages: [{ role: "user", content: `Classify these emails:\n${JSON.stringify(rawEmails, null, 2)}` }],
    });

    const textBlock = claudeResponse.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { important?: EmailImportant[]; fyi?: EmailFyi[] };
    return {
      important: (parsed.important || []).slice(0, 8).map((e, i) => ({ ...e, id: i + 1 })),
      fyi: (parsed.fyi || []).slice(0, 5).map((e, i) => ({ ...e, id: i + 10 })),
    };
  } catch (err) {
    console.warn("[brief] Gmail live fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Live Google Calendar fetch via Replit google-calendar connector ──────────

async function fetchLiveCalendar(): Promise<CalItem[] | null> {
  try {
    const cal = await getUncachableGoogleCalendarClient();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const response = await cal.events.list({
      calendarId: "primary",
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    return (response.data.items || []).map(e => {
      const startRaw = e.start?.dateTime || e.start?.date || "";
      const timeLabel = startRaw
        ? new Date(startRaw).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/Los_Angeles",
          })
        : "";
      // "real" = has 2+ attendees OR has a conference/video link
      const attendees = e.attendees?.length ?? 0;
      const hasVideo = !!(e.conferenceData || (e.description || "").match(/zoom|meet|teams/i));
      const item: CalItem = {
        t: timeLabel,
        n: e.summary || "(no title)",
        real: attendees > 1 || hasVideo,
      };
      if (e.location) item.loc = e.location;
      if (e.description) item.note = e.description.slice(0, 120);
      return item;
    });
  } catch (err) {
    console.warn("[brief] GCal live fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Live Slack fetch via SLACK_TOKEN ─────────────────────────────────────────
// Strategy: Try public channels first (needs channels:read), fall back to DMs only.
// DMs require im:history scope which most bot tokens have by default.

async function fetchLiveSlack(): Promise<SlackItem[] | null> {
  if (!process.env.SLACK_TOKEN) return null;
  const token = process.env.SLACK_TOKEN;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const items: SlackItem[] = [];

  try {
    // Attempt 1: public channels (requires channels:read)
    const chanRes = await fetch(
      "https://slack.com/api/conversations.list?types=public_channel&limit=50&exclude_archived=true",
      { headers }
    ).then(r => r.json()) as { ok: boolean; error?: string; channels?: { id: string; name: string; is_member: boolean }[] };

    if (chanRes.ok) {
      const targetNames = ["engineering", "leadership", "general", "sales"];
      const targets = (chanRes.channels || []).filter(c => targetNames.includes(c.name) && c.is_member);

      for (const ch of targets.slice(0, 5)) {
        const hist = await getSlackChannelHistory({ channel: ch.id, limit: 30 });
        if (!hist.ok) continue;
        const mentions = (hist.messages || []).filter(m =>
          m.text?.includes("@tony") || m.text?.includes("@here") || m.text?.includes("@channel")
        );
        for (const m of mentions.slice(0, 2)) {
          items.push({
            from: m.username || m.user || "Unknown",
            message: (m.text || "").slice(0, 120),
            level: /urgent|asap|blocking/i.test(m.text || "") ? "high" : "mid",
            channel: `#${ch.name}`,
          });
        }
      }
    } else {
      console.warn(`[brief] Slack channels list failed (${chanRes.error}) — trying DMs only`);
    }

    // Always also check DMs (im:history is usually available)
    const imRes = await fetch(
      "https://slack.com/api/conversations.list?types=im&limit=5",
      { headers }
    ).then(r => r.json()) as { ok: boolean; error?: string; channels?: { id: string }[] };

    if (imRes.ok) {
      for (const dm of (imRes.channels || []).slice(0, 4)) {
        const hist = await getSlackChannelHistory({ channel: dm.id, limit: 5 });
        if (!hist.ok) continue;
        for (const m of (hist.messages || []).slice(0, 1)) {
          if (!m.text?.trim()) continue;
          items.push({
            from: m.username || m.user || "DM",
            message: (m.text || "").slice(0, 120),
            level: /urgent|asap/i.test(m.text || "") ? "high" : "low",
            channel: "DM",
          });
        }
      }
    } else {
      console.warn(`[brief] Slack DMs list also failed (${imRes.error})`);
    }

    // If we got nothing from channels OR DMs, return null → seed fallback
    if (items.length === 0 && !chanRes.ok && !imRes.ok) return null;

    return items.slice(0, 5);
  } catch (err) {
    console.warn("[brief] Slack live fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Live Linear fetch via Replit linear connector ────────────────────────────

async function fetchLiveLinear(): Promise<LinearItem[] | null> {
  try {
    const issues = await getLinearIssues();
    if (!issues.length) return [];
    const priorityToLevel = (p: number) => p <= 1 ? "high" : p === 2 ? "mid" : "low";
    return issues
      .filter(i => !["Done", "Cancelled"].includes(i.state.name))
      .slice(0, 5)
      .map(n => ({
        who: "You",
        task: n.title,
        id: n.identifier,
        level: priorityToLevel(n.priority),
      }));
  } catch (err) {
    console.warn("[brief] Linear live fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Claude-powered brief generation (when live Gmail/Slack unavailable) ─────
// Runs once per day — result cached in daily_briefs DB. Uses real calendar +
// Linear data as context so generated content is relevant to Tony's actual day.

interface GeneratedBrief {
  emailsImportant: EmailImportant[];
  emailsFyi: EmailFyi[];
  slackItems: SlackItem[];
  tasks: { id: string; text: string; cat: string; sales?: boolean }[];
}

async function generateClaudeBrief(
  calData: CalItem[],
  linearData: LinearItem[],
  today: string
): Promise<GeneratedBrief | null> {
  try {
    const todayFormatted = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const calContext = calData.length > 0
      ? calData.map(e => `${e.t}: ${e.n}${e.loc ? ` @ ${e.loc}` : ""}`).join("\n")
      : "No calendar events scheduled";

    const linearContext = linearData.length > 0
      ? linearData.map(i => `[${i.id}] ${i.task} (${i.level} priority)`).join("\n")
      : "No open Linear issues";

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      system: `You generate Tony Diaz's daily brief. He is CEO of FlipIQ (AI-powered real estate wholesaling SaaS).
Team: Ethan Jolly (CTO), Ramy (ops), Marisol (ops coordinator), Faisal (lead engineer), Haris (engineer), Chris Wesser (legal/capital raise).
Key contacts: Fernando Perez (deal source), Mike Oyoque, Xander Clemens (Family Office Club — 10K investors), Kyle Draper.
FlipIQ focuses on: AI deal analysis, comps, wholesaling pipeline, investor outreach, capital raise ($500K-$2M round).
Today is ${todayFormatted}. Generate realistic workday data — no placeholders, no fake names outside this cast.`,
      messages: [{
        role: "user",
        content: `Generate Tony's daily brief based on his REAL calendar and open tasks:

CALENDAR TODAY:
${calContext}

OPEN LINEAR ISSUES:
${linearContext}

Return ONLY valid JSON (no markdown, no explanation):
{
  "emailsImportant": [
    {"id": 1, "from": "<real person from Tony's world>", "subj": "<specific subject>", "why": "<why it needs action today>", "time": "<Today HH:MM AM|Yesterday|2 days ago>", "p": "<high|med|low>"}
  ],
  "emailsFyi": [
    {"id": 10, "from": "<person>", "subj": "<subject>", "why": "<one-line summary>"}
  ],
  "slackItems": [
    {"from": "<team member>", "message": "<under 100 chars>", "level": "<high|mid|low>", "channel": "<#engineering|#leadership|#general|#sales|DM>"}
  ],
  "tasks": [
    {"id": "t1", "text": "10 Sales Calls", "cat": "SALES", "sales": true},
    {"id": "t2", "text": "<task derived from calendar/linear>", "cat": "<SALES|OPS|BUILD>"}
  ]
}

Rules:
- 3–5 important emails, 2–3 FYI emails, 2–4 Slack items, 6–10 tasks
- Tasks must include "10 Sales Calls" (sales: true) plus items derived from today's calendar events and Linear issues
- Emails and Slack should reflect what would realistically land in Tony's inbox given today's meetings and active Linear issues
- Make content specific and actionable — never generic`,
      }],
    });

    const block = message.content[0];
    if (block.type !== "text") return null;
    const jsonMatch = block.text.match(/\{[\s\S]+\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as GeneratedBrief;
  } catch (err) {
    console.warn("[brief] Claude generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

const router: IRouter = Router();

async function briefTodayHandler(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  res: Parameters<Parameters<typeof router.get>[1]>[1]
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  // Step 1: Load today's cached brief from DB (tasks are user-editable so always respect them)
  const [dbBrief] = await db
    .select()
    .from(dailyBriefsTable)
    .where(eq(dailyBriefsTable.date, today));

  // Step 2: All live fetches in parallel — null = error/missing creds
  const [liveEmails, liveCal, liveSlack, liveLinear] = await Promise.all([
    fetchLiveEmails(),
    fetchLiveCalendar(),
    fetchLiveSlack(),
    fetchLiveLinear(),
  ]);

  const calendarData = liveCal ?? DEFAULT_CAL;
  const linearItems = liveLinear ?? DEFAULT_LINEAR;

  // Step 3: Resolve emails — priority: live > DB cache > Claude generate > static fallback
  let emailsImportant: EmailImportant[];
  let emailsFyi: EmailFyi[];
  let claudeGenerated: GeneratedBrief | null = null;

  if (liveEmails !== null) {
    emailsImportant = liveEmails.important;
    emailsFyi = liveEmails.fyi;
  } else if (dbBrief?.emailsImportant) {
    emailsImportant = dbBrief.emailsImportant as EmailImportant[];
    emailsFyi = (dbBrief.emailsFyi as EmailFyi[]) ?? [];
  } else {
    // No live Gmail, no cache — generate via Claude using real context
    console.log("[brief] Generating today's brief via Claude...");
    claudeGenerated = await generateClaudeBrief(calendarData, linearItems, today);
    emailsImportant = claudeGenerated?.emailsImportant ?? DEFAULT_EMAILS_IMPORTANT;
    emailsFyi = claudeGenerated?.emailsFyi ?? DEFAULT_EMAILS_FYI;
  }

  // Step 4: Resolve Slack — priority: live > DB cache > Claude generated > static fallback
  let slackItems: SlackItem[];
  if (liveSlack !== null) {
    slackItems = liveSlack;
  } else if (dbBrief?.slackItems) {
    slackItems = dbBrief.slackItems as SlackItem[];
  } else {
    slackItems = claudeGenerated?.slackItems ?? DEFAULT_SLACK;
  }

  // Step 5: Tasks — DB always wins (user may have checked things off), then Claude, then default
  const tasks = (dbBrief?.tasks as typeof DEFAULT_TASKS | null)
    ?? claudeGenerated?.tasks
    ?? DEFAULT_TASKS;

  // Step 6: Cache Claude-generated content in DB so it doesn't regenerate on next request
  if (claudeGenerated) {
    db.insert(dailyBriefsTable)
      .values({
        date: today,
        calendarData,
        emailsImportant,
        emailsFyi,
        slackItems,
        linearItems,
        tasks,
      })
      .onConflictDoUpdate({
        target: dailyBriefsTable.date,
        set: { emailsImportant, emailsFyi, slackItems, tasks },
      })
      .catch(err => console.warn("[brief] DB cache save failed:", err));
  }

  const sources = {
    calendar: liveCal !== null ? "live" : "seed",
    emails: liveEmails !== null ? "live" : (dbBrief?.emailsImportant ? "cached" : claudeGenerated ? "claude" : "seed"),
    slack: liveSlack !== null ? "live" : (dbBrief?.slackItems ? "cached" : claudeGenerated ? "claude" : "seed"),
    linear: liveLinear !== null ? "live" : "seed",
  };
  console.log("[brief]", sources);

  res.json({
    date: today,
    calendarData,
    emailsImportant,
    emailsFyi,
    slackItems,
    linearItems,
    tasks,
    _sources: sources,
  });
}

router.get("/brief/today", briefTodayHandler);
router.get("/morning-brief", briefTodayHandler);

export default router;

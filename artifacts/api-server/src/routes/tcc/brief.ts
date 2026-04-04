import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, dailyBriefsTable } from "@workspace/db";
import { google } from "googleapis";
import { anthropic } from "@workspace/integrations-anthropic-ai";

// ─── Full seed defaults — matches TCC_Seed_Data JSON (+ 6 PM Unplug per user request) ──
// Key names match the frontend CalItem / EmailItem / TaskItem schema (t/n/loc, subj/p, cat)

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

// ─── Helper: build Gmail client from env token ────────────────────────────────

function buildGmailClient(token: string) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: token });
  return google.gmail({ version: "v1", auth: oauth2 });
}

// ─── Helper: build Calendar client from env token ────────────────────────────

function buildCalendarClient(token: string) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: token });
  return google.calendar({ version: "v3", auth: oauth2 });
}

// ─── Live Gmail fetch + Claude classification ─────────────────────────────────
// Returns null on missing token or any API failure (triggers seed fallback).
// Returns { important: [], fyi: [] } when connected but inbox has no recent mail.

async function fetchLiveEmails(): Promise<{ important: EmailImportant[]; fyi: EmailFyi[] } | null> {
  if (!process.env.GMAIL_TOKEN) return null;
  try {
    const gmail = buildGmailClient(process.env.GMAIL_TOKEN);
    const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: 15,
      q: `after:${since}`,
    });

    const messages = list.data.messages || [];
    const rawEmails: { from: string; subject: string; snippet: string; date: string }[] = [];

    for (const msg of messages.slice(0, 10)) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const headers = detail.data.payload?.headers || [];
      const get = (name: string) => headers.find(h => h.name === name)?.value || "";
      rawEmails.push({
        from: get("From").replace(/<[^>]+>/, "").replace(/^"|"$/g, "").trim(),
        subject: get("Subject"),
        snippet: detail.data.snippet || "",
        date: get("Date"),
      });
    }

    if (rawEmails.length === 0) return { important: [], fyi: [] };

    // Use Claude to classify emails into Important vs FYI with structured extraction
    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You are Tony Diaz's email triage assistant for FlipIQ (real estate wholesaling).
Classify each email as "important" (requires Tony's reply/action) or "fyi" (info only, no reply needed).
For important: extract from, subj, why (1 short sentence on WHY it needs action), time (friendly label), p (high/med/low).
For fyi: extract from, subj, why (1 short sentence summary).
Return ONLY valid JSON: { "important": [...], "fyi": [...] }
Important item shape: { "from": string, "subj": string, "why": string, "time": string, "p": "high"|"med"|"low" }
FYI item shape: { "from": string, "subj": string, "why": string }`,
      messages: [
        { role: "user", content: `Classify these emails:\n${JSON.stringify(rawEmails, null, 2)}` },
      ],
    });

    const textBlock = claudeResponse.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { important?: EmailImportant[]; fyi?: EmailFyi[] };
    return {
      important: (parsed.important || []).map((e, i) => ({ ...e, id: i + 1 })),
      fyi: (parsed.fyi || []).map((e, i) => ({ ...e, id: i + 10 })),
    };
  } catch (err) {
    console.warn("[brief] Gmail live fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Live Google Calendar fetch ───────────────────────────────────────────────
// Returns null on missing token or any API failure.
// Returns [] when connected but no events today.

async function fetchLiveCalendar(): Promise<CalItem[] | null> {
  if (!process.env.GOOGLE_CALENDAR_TOKEN) return null;
  try {
    const cal = buildCalendarClient(process.env.GOOGLE_CALENDAR_TOKEN);
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
        ? new Date(startRaw).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        : "";
      const item: CalItem = { t: timeLabel, n: e.summary || "(no title)", real: true };
      if (e.location) item.loc = e.location;
      if (e.description) item.note = e.description.slice(0, 120);
      return item;
    });
  } catch (err) {
    console.warn("[brief] GCal live fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Live Slack fetch via SLACK_BOT_TOKEN ─────────────────────────────────────
// Returns null on missing token or any API/auth failure.
// Returns [] when connected but no relevant messages found.
// Checks ok flag on every Slack API response; throws on failure to trigger seed fallback.

async function fetchLiveSlack(): Promise<SlackItem[] | null> {
  if (!process.env.SLACK_BOT_TOKEN) return null;
  try {
    const token = process.env.SLACK_BOT_TOKEN;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const oldest = String(Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000));

    // Fetch DMs
    const imRes = await fetch("https://slack.com/api/conversations.list?types=im&limit=10", { headers }).then(r => r.json()) as {
      ok: boolean; error?: string; channels?: { id: string }[];
    };
    if (!imRes.ok) throw new Error(`Slack conversations.list(im) failed: ${imRes.error}`);

    // Fetch public channels
    const chanRes = await fetch("https://slack.com/api/conversations.list?types=public_channel&limit=50", { headers }).then(r => r.json()) as {
      ok: boolean; error?: string; channels?: { id: string; name: string }[];
    };
    if (!chanRes.ok) throw new Error(`Slack conversations.list(public) failed: ${chanRes.error}`);

    const targetChannelNames = ["engineering", "leadership", "general", "sales"];
    const targetChannels = (chanRes.channels || []).filter(c => targetChannelNames.includes(c.name || ""));

    const items: SlackItem[] = [];
    const toLevel = (text: string) =>
      /urgent|asap/i.test(text) ? "urgent" : /when you get/i.test(text) ? "low" : "mid";

    // Scan DMs
    for (const dm of (imRes.channels || []).slice(0, 5)) {
      const histRes = await fetch(
        `https://slack.com/api/conversations.history?channel=${dm.id}&oldest=${oldest}&limit=5`,
        { headers }
      ).then(r => r.json()) as { ok: boolean; error?: string; messages?: { text: string; user: string }[] };
      if (!histRes.ok) throw new Error(`Slack history(DM) failed: ${histRes.error}`);
      for (const m of (histRes.messages || []).slice(0, 2)) {
        items.push({ from: m.user || "DM", message: (m.text || "").slice(0, 120), level: toLevel(m.text || ""), channel: "DM" });
      }
    }

    // Scan channels for @mentions
    for (const ch of targetChannels) {
      const histRes = await fetch(
        `https://slack.com/api/conversations.history?channel=${ch.id}&oldest=${oldest}&limit=20`,
        { headers }
      ).then(r => r.json()) as { ok: boolean; error?: string; messages?: { text: string; user: string }[] };
      if (!histRes.ok) throw new Error(`Slack history(#${ch.name}) failed: ${histRes.error}`);
      const mentions = (histRes.messages || []).filter(m =>
        m.text?.includes("@tony") || m.text?.includes("@here") || m.text?.includes("@channel")
      );
      for (const m of mentions.slice(0, 2)) {
        items.push({ from: m.user || "Unknown", message: (m.text || "").slice(0, 120), level: toLevel(m.text || ""), channel: `#${ch.name}` });
      }
    }

    return items;
  } catch (err) {
    console.warn("[brief] Slack live fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Live Linear fetch via LINEAR_API_KEY ─────────────────────────────────────
// Returns null on missing token, HTTP error, or GraphQL errors.
// Returns [] when connected but no assigned open issues.

async function fetchLiveLinear(): Promise<LinearItem[] | null> {
  if (!process.env.LINEAR_API_KEY) return null;
  try {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: process.env.LINEAR_API_KEY,
      },
      body: JSON.stringify({
        query: `query {
          viewer {
            assignedIssues(filter: { state: { name: { nin: ["Done", "Cancelled"] } } }, first: 10) {
              nodes { identifier title priority assignee { name } }
            }
          }
        }`,
      }),
    });

    if (!res.ok) throw new Error(`Linear HTTP error: ${res.status} ${res.statusText}`);

    const data = await res.json() as {
      errors?: { message: string }[];
      data?: {
        viewer?: {
          assignedIssues?: {
            nodes: { identifier: string; title: string; priority: number; assignee?: { name: string } }[];
          };
        };
      };
    };

    if (data.errors?.length) throw new Error(`Linear GraphQL error: ${data.errors[0].message}`);

    const nodes = data?.data?.viewer?.assignedIssues?.nodes ?? [];
    const priorityToLevel = (p: number) => p <= 1 ? "urgent" : p === 2 ? "mid" : "low";

    return nodes.map(n => ({
      who: n.assignee?.name || "You",
      task: n.title,
      id: n.identifier,
      level: priorityToLevel(n.priority),
    }));
  } catch (err) {
    console.warn("[brief] Linear live fetch failed:", err instanceof Error ? err.message : err);
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

  // Tasks come from DB (no live API source for tasks)
  const [brief] = await db
    .select()
    .from(dailyBriefsTable)
    .where(eq(dailyBriefsTable.date, today));

  // All live fetches in parallel — null = error/missing creds (use seed), array/object = live result
  const [liveEmails, liveCal, liveSlack, liveLinear] = await Promise.all([
    fetchLiveEmails(),
    fetchLiveCalendar(),
    fetchLiveSlack(),
    fetchLiveLinear(),
  ]);

  // Calendar: live → seed
  const calendarData = liveCal ?? DEFAULT_CAL;
  const calSource = liveCal !== null ? "live" : "seed";

  // Emails: live → seed
  const emailsImportant = liveEmails !== null ? liveEmails.important : DEFAULT_EMAILS_IMPORTANT;
  const emailsFyi = liveEmails !== null ? liveEmails.fyi : DEFAULT_EMAILS_FYI;
  const emailSource = liveEmails !== null ? "live" : "seed";

  // Slack: live → seed
  const slackItems = liveSlack ?? DEFAULT_SLACK;
  const slackSource = liveSlack !== null ? "live" : "seed";

  // Linear: live → seed
  const linearItems = liveLinear ?? DEFAULT_LINEAR;
  const linearSource = liveLinear !== null ? "live" : "seed";

  // Tasks: DB → seed
  const tasks = (brief?.tasks as typeof DEFAULT_TASKS | null) ?? DEFAULT_TASKS;

  console.log(
    `[brief] calendar: ${calSource} | emails: ${emailSource} | slack: ${slackSource} | linear: ${linearSource}`
  );

  res.json({
    date: today,
    calendarData,
    emailsImportant,
    emailsFyi,
    slackItems,
    linearItems,
    tasks,
  });
}

router.get("/brief/today", briefTodayHandler);
router.get("/morning-brief", briefTodayHandler);

export default router;

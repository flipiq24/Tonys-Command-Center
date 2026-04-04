# TCC — Remaining 3 Items for Replit
## Based on QA Results · April 4, 2026
## Copy-paste ready. No interpretation needed.

---

# ITEM 1: LIVE DATA (Replace Seed Data)

## The Problem
The brief route returns seed/hardcoded data. It needs to pull LIVE data from Gmail, Calendar, Slack, and Linear.

## The Solution: Route Through Claude API with MCP

You already have ANTHROPIC_API_KEY set and Claude Chat works. Use the SAME approach for the brief — send a structured prompt to Claude, Claude pulls real data via MCP, returns JSON.

### Replace your `/api/brief` route with this:

```typescript
// /api/brief/route.ts (or wherever your brief endpoint lives)

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET() {
  const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
  const todayISO = new Date().toISOString().split("T")[0];

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: `You are a data extraction assistant. Return ONLY valid JSON. No markdown. No backticks. No explanation. Just the JSON object.`,
      messages: [{
        role: "user",
        content: `Today is ${today} (${todayISO}), timezone America/Los_Angeles.

Pull Tony Diaz's data from his connected services and return a JSON object with this EXACT structure:

{
  "calendar": [
    {"time": "8:00 AM", "title": "Event Name", "location": "optional or null", "note": "optional or null", "real": true}
  ],
  "emails_important": [
    {"id": 1, "from": "Sender Name", "subject": "Subject", "why": "One sentence why this matters", "time": "Today/Yesterday/date", "priority": "high/medium/low"}
  ],
  "emails_fyi": [
    {"id": 100, "from": "Sender Name", "subject": "Subject", "why": "One sentence context"}
  ],
  "slack_items": [
    {"from": "Person Name", "message": "Preview text", "level": "low/mid/high", "channel": "#channel-name"}
  ],
  "linear_items": [
    {"who": "Assignee", "task": "Issue title", "id": "PROJ-123", "level": "low/mid/high"}
  ],
  "tasks": [
    {"id": "t1", "text": "10 Sales Calls", "category": "SALES", "locked": true, "routes_to": "sales"},
    {"id": "t2", "text": "Task from Linear or OAP", "category": "OPS"}
  ]
}

CALENDAR RULES:
- Get ALL events from Google Calendar for today
- "real": true = has multiple attendees OR has a video/conference link
- "real": false = self-created reminders, task-notes (only 1 attendee who is Tony)
- Include ALL items, not just meetings
- Format time as "8:00 AM" not ISO format

EMAIL RULES (check last 48 hours of unread):
- IMPORTANT = from @flipiq.com team, known contacts (ethan@flipiq.com, chris.wesser@gmail.com, ramy@flipiq.com), family (marisol, cesar@eoslab.io), OR contains keywords: urgent, contract, payment, demo, equity, funding, deal
- FYI = everything else worth knowing (medical, receipts, notifications from real people)
- Skip: newsletters, marketing, automated notifications, social media
- Max 8 important, max 5 FYI
- "why" should be a specific, useful one-sentence explanation

SLACK RULES (check last 24 hours):
- Only DMs to Tony, @mentions of Tony, or questions in channels where Tony's input is clearly needed
- Skip: general chatter, bot messages, status updates nobody asked Tony about
- "level": "high" = someone blocked waiting on Tony for 2+ days. "mid" = needs attention today. "low" = FYI
- Max 5 items

LINEAR RULES:
- Issues assigned to Tony that are: overdue, due today, or In Progress
- Issues where Tony is mentioned in recent comments
- "level": "high" = overdue or blocking someone. "mid" = due soon. "low" = in progress, on track
- Max 5 items

TASKS:
- Task 1 is ALWAYS: {"id":"t1","text":"10 Sales Calls","category":"SALES","locked":true,"routes_to":"sales"}
- Pull Tony's assigned Linear issues from Management team as additional tasks
- Category: SALES for revenue/outreach, OPS for internal/admin, BUILD for product/tech
- Max 10 tasks total`
      }],
      mcp_servers: [
        { type: "url", url: "https://gmail.mcp.claude.com/mcp", name: "gmail" },
        { type: "url", url: "https://gcal.mcp.claude.com/mcp", name: "gcal" },
        { type: "url", url: "https://mcp.slack.com/mcp", name: "slack" },
        { type: "url", url: "https://mcp.linear.app/mcp", name: "linear" }
      ]
    });

    // Extract text from response (skip tool_use and tool_result blocks)
    const textContent = response.content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("");

    // Clean and parse JSON
    const cleaned = textContent.replace(/```json\n?|```\n?/g, "").trim();
    
    let data;
    try {
      data = JSON.parse(cleaned);
    } catch (parseErr) {
      // If Claude returned extra text, try to extract JSON
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse Claude response as JSON");
      }
    }

    // Cache to Supabase for faster subsequent loads
    await supabase.from("daily_briefs").upsert({
      date: todayISO,
      calendar_data: data.calendar,
      emails_important: data.emails_important,
      emails_fyi: data.emails_fyi,
      slack_items: data.slack_items,
      linear_items: data.linear_items,
      tasks: data.tasks
    }, { onConflict: "date" });

    return NextResponse.json(data);

  } catch (error: any) {
    console.error("Brief error:", error.message);
    
    // Fall back to cached Supabase data
    const { data: cached } = await supabase
      .from("daily_briefs")
      .select("*")
      .eq("date", todayISO)
      .single();

    if (cached) {
      return NextResponse.json({
        calendar: cached.calendar_data || [],
        emails_important: cached.emails_important || [],
        emails_fyi: cached.emails_fyi || [],
        slack_items: cached.slack_items || [],
        linear_items: cached.linear_items || [],
        tasks: cached.tasks || [],
        _cached: true
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### Why this works:
- Uses the ANTHROPIC_API_KEY that's already set
- MCP servers handle Gmail, Calendar, Slack, Linear authentication
- Tony's Claude.ai account already has all these services connected
- No separate GMAIL_TOKEN, CALENDAR_TOKEN, SLACK_BOT_TOKEN, or LINEAR_API_KEY needed
- Caches result to Supabase so subsequent loads are instant
- Falls back to cached data if API call fails

### If MCP doesn't work from Replit's servers:
The MCP auth tokens are tied to Tony's Claude.ai session. If they don't transfer to API calls from Replit, then you DO need the direct tokens. In that case, set these secrets in Replit:

```
GMAIL_TOKEN — OAuth refresh token from Google Cloud Console
GOOGLE_CALENDAR_TOKEN — Same as Gmail (both Google APIs, same OAuth)
SLACK_BOT_TOKEN — From api.slack.com/apps → FlipIQ → OAuth (xoxb-...)
LINEAR_API_KEY — From linear.app/flipiq/settings/api → Personal key
```

---

# ITEM 2: AUTO-REFRESH (15-minute interval)

Add this to your main App component (App.tsx or wherever the root component lives).

### Find the main useEffect that loads initial data. Add this SEPARATE useEffect:

```typescript
// AUTO-REFRESH: Pull fresh data every 15 minutes
const [lastRefresh, setLastRefresh] = useState<string>(
  new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
);

useEffect(() => {
  const refreshBrief = async () => {
    try {
      const res = await fetch("/api/brief");
      if (!res.ok) return; // Silent fail — don't crash
      
      const data = await res.json();
      if (data.error) return; // Silent fail
      
      // Update ONLY the data arrays — NEVER reset view state
      if (data.calendar) setCalendar(data.calendar);
      if (data.emails_important) setEmailsImportant(data.emails_important);
      if (data.emails_fyi) setEmailsFyi(data.emails_fyi);
      if (data.slack_items) setSlackItems(data.slack_items);
      if (data.linear_items) setLinearItems(data.linear_items);
      if (data.tasks) setTasks(data.tasks);
      
      setLastRefresh(
        new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      );
      
      console.log(`[TCC] Auto-refresh complete: ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      console.error("[TCC] Auto-refresh failed (will retry next cycle):", err);
      // Do NOT show error to user. Do NOT crash. Just skip this cycle.
    }
  };

  // Run every 15 minutes (900,000 ms)
  const interval = setInterval(refreshBrief, 900000);

  // Cleanup
  return () => clearInterval(interval);
}, []); // Empty deps — runs once, interval handles the rest
```

### Add "Last updated" to the header:

Find the header component. Add this next to the clock:

```tsx
<span style={{ fontSize: 10, color: "#A3A3A3", marginLeft: 8 }}>
  Updated: {lastRefresh}
</span>
```

### Also add a manual refresh button in the header:

```tsx
<button
  onClick={async () => {
    const res = await fetch("/api/brief");
    const data = await res.json();
    if (data.calendar) setCalendar(data.calendar);
    if (data.emails_important) setEmailsImportant(data.emails_important);
    // ... same as above
    setLastRefresh(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
  }}
  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#A3A3A3" }}
  title="Refresh data now"
>
  🔄
</button>
```

### CRITICAL RULES:
1. NEVER change `view` state during refresh (no setView calls)
2. NEVER reset checkin.done, journalDone, emailsDone (gates stay done)
3. NEVER close open modals (attempt, ideas, instructions)
4. ONLY update: calendar, emails_important, emails_fyi, slack_items, linear_items, tasks
5. If fetch fails → console.log and move on. No error UI. No crash.

---

# ITEM 3: BULK CONTACT IMPORT (5,284 contacts)

The CSV file `TCC_Contacts_Full.csv` has 5,284 contacts ready to import.

### Option A: Supabase Dashboard (Fastest, no code)

1. Go to Supabase Dashboard → Table Editor → `contacts`
2. Click the dropdown arrow next to "Insert row" → "Import data from CSV"
3. Upload `TCC_Contacts_Full.csv`
4. Map columns:
   - name → name
   - company → company
   - phone → phone
   - email → email
   - type → type
   - status → status
   - next_step → next_step
   - source → source
   - notes → notes
5. Click Import
6. Verify: SELECT count(*) FROM contacts → should be ~5,300 (5,284 + 15 seed)

### Option B: Script (if CSV import has issues)

```typescript
// scripts/import-contacts.ts
// Run with: npx tsx scripts/import-contacts.ts

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const csv = readFileSync("TCC_Contacts_Full.csv", "utf-8");
const records = parse(csv, { columns: true, skip_empty_lines: true });

console.log(`Parsed ${records.length} contacts`);

// Insert in batches of 200
const BATCH_SIZE = 200;
for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE).map((r: any) => ({
    name: r.name || null,
    company: r.company || null,
    phone: r.phone || null,
    email: r.email || null,
    type: r.type || "Other",
    status: r.status || "New",
    next_step: r.next_step || "Initial outreach",
    source: r.source || "Import",
    notes: r.notes || null,
  }));

  const { error } = await supabase.from("contacts").insert(batch);
  if (error) {
    console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message);
  } else {
    console.log(`Batch ${i / BATCH_SIZE + 1}: ${batch.length} contacts imported`);
  }
}

console.log("Done.");
```

### After import, update Sales Mode to handle pagination:

With 5,284 contacts, Sales Mode needs to load in pages, not all at once.

```typescript
// In your contacts query, add pagination:
const { data: contacts } = await supabase
  .from("contacts")
  .select("*")
  .order("status", { ascending: false }) // Hot first, then Warm, New, Cold
  .order("last_contact_date", { ascending: true, nullsFirst: true }) // Longest since contact first
  .range(0, 49); // First 50 contacts

// Add "Load More" button at bottom of Sales Mode:
// <button onClick={() => loadMore()}>Load 50 more contacts</button>
```

### Contact priority sort order for the query:

```sql
-- This sorts contacts in Tony's priority order:
-- 1. Broker-Investor (Hot first)
-- 2. Wholesaler
-- 3. Independent
-- 4. Affiliate
-- 5. Other
-- Within each type: Hot → Warm → New → Cold
-- Within each status: longest since last contact first

SELECT * FROM contacts
ORDER BY
  CASE type
    WHEN 'Broker-Investor' THEN 1
    WHEN 'Wholesaler' THEN 2
    WHEN 'Independent' THEN 3
    WHEN 'Affiliate' THEN 4
    ELSE 5
  END,
  CASE status
    WHEN 'Hot' THEN 1
    WHEN 'Warm' THEN 2
    WHEN 'New' THEN 3
    WHEN 'Cold' THEN 4
    ELSE 5
  END,
  last_contact_date ASC NULLS FIRST
LIMIT 50;
```

---

# VERIFICATION AFTER ALL 3 ITEMS

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 1 | Open app, get past gates, see Schedule | Calendar shows REAL Google Calendar events, not seed data | ☐ |
| 2 | Check email count | Important emails reflect REAL unread Gmail, not seed | ☐ |
| 3 | Open Sales Mode | Shows 50 contacts from the 5,284 imported, sorted by priority | ☐ |
| 4 | Wait 15 minutes | "Updated: [time]" changes in header. Data refreshes. View doesn't reset. | ☐ |
| 5 | Click 🔄 refresh | Data updates immediately | ☐ |
| 6 | Send Tony a new email, wait 15 min | Badge count increases on next refresh | ☐ |
| 7 | Contact count in Supabase | SELECT count(*) FROM contacts → ~5,300 | ☐ |

**When all 7 pass → the app is production-ready.**

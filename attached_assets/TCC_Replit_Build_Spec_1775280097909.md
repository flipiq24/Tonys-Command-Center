# TONY'S COMMAND CENTER — Replit Build Spec
## For Developer · v1.0 · April 4, 2026

---

# ARCHITECTURE: ONE API

The entire system uses **ONE external API: Anthropic (Claude)**. Claude connects to all other services (Gmail, Calendar, Slack, Linear, AgentMail) via MCP servers. The Replit app never talks to Google, Slack, or Linear directly.

```
┌─────────────────────────────────────────────────────────┐
│                    REPLIT APP                             │
│  Next.js 14 + Tailwind + shadcn/ui + Supabase           │
│                                                          │
│  FRONTEND (React)          BACKEND (API Routes)          │
│  ┌──────────────┐         ┌──────────────────────┐      │
│  │ Sequential UI │ ──→    │ /api/claude           │      │
│  │ (the JSX file)│ ←──    │ Calls Anthropic API   │      │
│  └──────────────┘         │ with MCP servers      │      │
│                            └─────────┬────────────┘      │
│                                      │                    │
│  ┌──────────────┐                    │                    │
│  │ Supabase DB  │ ←── reads/writes ──┘                   │
│  │ (shared with │                                        │
│  │  Cowork)     │                                        │
│  └──────────────┘                                        │
└──────────────────────────────────────────────────────────┘
                               │
                    Anthropic API (one key)
                               │
              ┌────────────────┼────────────────┐
              │                │                │
         MCP Servers      MCP Servers      MCP Servers
              │                │                │
    ┌─────────┴──┐    ┌───────┴───┐    ┌───────┴───┐
    │ Gmail      │    │ Slack     │    │ Linear    │
    │ Calendar   │    │           │    │           │
    │ Drive      │    └───────────┘    └───────────┘
    └────────────┘

┌─────────────────────────────────────────────────────────┐
│                    COWORK (Claude Desktop)                │
│  Runs scheduled tasks on Tony's computer                 │
│  Uses SAME Anthropic API + SAME MCP servers              │
│  Writes to SAME Supabase database                        │
│                                                          │
│  5:00 AM  → Morning Brief → writes to Supabase           │
│  Every 30m → Email sort → writes to Supabase              │
│  5:00 PM  → EOD Report Tony → sends via AgentMail         │
│  5:15 PM  → EOD Report Ethan → sends via AgentMail        │
│  On-demand → Check-in → Google Sheet                      │
│  On-demand → Journal → Google Doc                         │
└─────────────────────────────────────────────────────────┘
```

---

# STEP 1: CREATE REPLIT PROJECT

```bash
# Create Next.js 14 project
npx create-next-app@14 tonys-command-center \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd tonys-command-center

# Install dependencies
npm install @supabase/supabase-js    # Database
npm install @anthropic-ai/sdk         # Claude API (THE one API)
```

### Tech Stack
- **Next.js 14** (App Router)
- **Tailwind CSS** + **shadcn/ui** for components
- **Supabase** (Postgres + Auth + Realtime)
- **Anthropic SDK** (Claude API with MCP)
- **Vercel** or **Replit** for deployment

---

# STEP 2: ENVIRONMENT VARIABLES

Create `.env.local`:

```env
# THE ONE API — this is the only external API key needed
ANTHROPIC_API_KEY=sk-ant-...

# Database (shared between Replit app and Cowork)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_KEY=eyJhbGci...

# AgentMail (for sending emails)
# AgentMail works through Claude MCP — no separate key needed
# System inbox: flipiq@agentmail.to
# Tony's inbox: tony-diaz@agentmail.to

# App config
NEXT_PUBLIC_APP_URL=https://tonys-command-center.replit.app
TONY_EMAIL=tony@flipiq.com
ETHAN_EMAIL=ethan@flipiq.com
```

**IMPORTANT:** The Anthropic API key is the ONLY external API key. Gmail, Calendar, Slack, Linear, and AgentMail are all accessed through Claude's MCP servers — no separate OAuth or API keys needed from the app side. Claude handles authentication through MCP.

---

# STEP 3: SUPABASE DATABASE SCHEMA

Run this SQL in Supabase:

```sql
-- Check-in data (one row per day)
CREATE TABLE checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  bedtime TEXT,
  waketime TEXT,
  sleep_hours NUMERIC(3,1),
  bible BOOLEAN DEFAULT FALSE,
  workout BOOLEAN DEFAULT FALSE,
  journal BOOLEAN DEFAULT FALSE,
  nutrition TEXT CHECK (nutrition IN ('Good', 'OK', 'Bad')),
  unplug BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Journal entries
CREATE TABLE journals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  raw_text TEXT,
  formatted_text TEXT, -- AI-formatted version
  mood TEXT,
  key_events TEXT,
  reflection TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ideas parking lot
CREATE TABLE ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  text TEXT NOT NULL,
  category TEXT NOT NULL, -- Tech, Sales, Marketing, etc.
  urgency TEXT NOT NULL,  -- Now, This Week, This Month, Someday
  tech_type TEXT,         -- Bug, Feature, Idea (only if category=Tech)
  priority_position INT,  -- Auto-assigned by system
  status TEXT DEFAULT 'parked', -- parked, in_progress, done, rejected
  override BOOLEAN DEFAULT FALSE, -- Did Tony override priority?
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales contacts (master list)
CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  status TEXT DEFAULT 'New', -- Hot, Warm, New, Cold
  phone TEXT,
  email TEXT,
  type TEXT, -- Broker-Investor, Wholesaler, Independent, Affiliate
  next_step TEXT,
  last_contact_date DATE,
  notes TEXT,
  source TEXT, -- which sheet they came from
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call log
CREATE TABLE call_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id),
  contact_name TEXT NOT NULL,
  type TEXT NOT NULL, -- attempt, connected
  notes TEXT,
  follow_up_sent BOOLEAN DEFAULT FALSE,
  follow_up_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email importance training log
CREATE TABLE email_training (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender TEXT NOT NULL,
  subject TEXT,
  action TEXT NOT NULL, -- thumbs_up, thumbs_down
  reason TEXT, -- Tony's explanation (required for thumbs_down)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- System instructions (the MD file in database form)
CREATE TABLE system_instructions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  section TEXT NOT NULL, -- e.g., "Email Rules", "Sales Mode", "Check-in"
  element TEXT NOT NULL, -- e.g., "Snooze Button", "Morning Protection"
  instructions TEXT NOT NULL,
  tooltip TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily brief (pre-built by Cowork at 5 AM)
CREATE TABLE daily_briefs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  calendar_data JSONB, -- All calendar items
  emails_important JSONB, -- Pre-sorted important emails
  emails_fyi JSONB, -- Pre-sorted FYI emails
  slack_items JSONB, -- Relevant Slack notifications
  linear_items JSONB, -- Relevant Linear items
  tasks JSONB, -- Today's tasks from OAP v4
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task completions
CREATE TABLE task_completions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_text TEXT NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Demo tracking
CREATE TABLE demos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_name TEXT,
  scheduled_date DATE,
  status TEXT DEFAULT 'scheduled', -- scheduled, completed, no_show
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meeting history (for context in future meetings)
CREATE TABLE meeting_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  person_name TEXT NOT NULL,
  person_email TEXT,
  meeting_date TIMESTAMPTZ NOT NULL,
  duration_minutes INT,
  notes TEXT,
  action_items TEXT,
  follow_up_scheduled BOOLEAN DEFAULT FALSE,
  transcript_url TEXT, -- Link to Plaud transcript
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EOD reports archive
CREATE TABLE eod_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  recipient TEXT NOT NULL, -- tony or ethan
  report_json JSONB NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# STEP 4: BACKEND — THE ONE API ROUTE

Create `src/app/api/claude/route.ts`:

This is the ONLY backend route the frontend needs. It sends messages to Claude with MCP servers attached. Claude handles all external service connections.

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// System prompt includes the full System Brain MD file
const SYSTEM_PROMPT = `You are Tony Diaz's Command Center AI.
You have access to all of Tony's tools via MCP:
- Gmail (read, search, draft replies)
- Google Calendar (read events, create events, check availability)
- Slack (read messages, send messages, search)
- Linear (read issues, create issues, update)
- AgentMail (send emails from flipiq@agentmail.to or tony-diaz@agentmail.to)
- Google Drive (read documents, search)

[INSERT FULL TCC_System_Brain_v1.md CONTENT HERE]

Current date: ${new Date().toLocaleDateString()}
Respond with structured JSON when the frontend requests data.
For conversational requests, respond naturally.`;

export async function POST(req: NextRequest) {
  const { messages, action } = await req.json();

  // MCP servers — Claude connects to ALL services through these
  const mcp_servers = [
    { type: "url", url: "https://gmail.mcp.claude.com/mcp", name: "gmail" },
    { type: "url", url: "https://gcal.mcp.claude.com/mcp", name: "gcal" },
    { type: "url", url: "https://mcp.slack.com/mcp", name: "slack" },
    { type: "url", url: "https://mcp.linear.app/mcp", name: "linear" },
    { type: "url", url: "https://server.smithery.ai/agentmail?", name: "agentmail" },
  ];

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: messages,
      mcp_servers: mcp_servers,
    });

    // Extract text and tool results from response
    const result = {
      text: response.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("\n"),
      toolResults: response.content
        .filter((block: any) => block.type === "mcp_tool_result")
        .map((block: any) => ({
          content: block.content?.[0]?.text || "",
        })),
      raw: response.content,
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Claude API error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

### Pre-built Action Routes

Create specific action routes that wrap common operations:

```typescript
// src/app/api/morning-brief/route.ts
// Called when Tony opens the app — fetches pre-built brief from Supabase
// If no brief exists (Cowork hasn't run), calls Claude live

// src/app/api/checkin/route.ts
// Saves check-in to Supabase
// Sends data to AgentMail for Cowork to write to Google Sheet

// src/app/api/journal/route.ts
// Sends raw text to Claude for formatting
// Saves both raw + formatted to Supabase
// Sends formatted entry to AgentMail for Cowork to append to Google Doc

// src/app/api/email-action/route.ts
// Handles: suggest reply, snooze, thumbs up/down
// Writes training data to Supabase
// For suggest reply: calls Claude to draft, returns draft

// src/app/api/call-log/route.ts
// Logs call attempt or connection to Supabase
// For attempts with follow-up instructions: calls Claude to draft email
// Sends draft to Gmail via Claude MCP

// src/app/api/idea/route.ts
// Saves idea to Supabase
// Calls Claude to auto-prioritize against business plan
// If Tech: calls Claude to post to correct Slack channel
// Returns priority position and any pushback

// src/app/api/eod-report/route.ts
// Pulls day's data from Supabase
// Calls Claude to generate formatted report
// Sends to Tony + Ethan via AgentMail

// src/app/api/instructions/route.ts
// Receives custom instruction from Tony
// Calls Claude to evaluate (can/can't do)
// Updates system_instructions table in Supabase
// Returns confirmation
```

---

# STEP 5: FRONTEND — THE JSX FILE

Copy the `tonys-command-center.jsx` artifact as the starting point.

Convert to TypeScript and wire up to the API routes:

```typescript
// Replace sample data with API calls:

// On mount:
const brief = await fetch('/api/morning-brief').then(r => r.json());
// brief.calendar_data → CAL array
// brief.emails_important → EI array
// brief.emails_fyi → EF array
// brief.slack_items → SLACK array
// brief.linear_items → LINEAR array

// On check-in submit:
await fetch('/api/checkin', {
  method: 'POST',
  body: JSON.stringify(checkinData)
});

// On journal submit:
const formatted = await fetch('/api/journal', {
  method: 'POST',
  body: JSON.stringify({ raw_text: journalText })
}).then(r => r.json());

// On email action:
await fetch('/api/email-action', {
  method: 'POST',
  body: JSON.stringify({ action: 'thumbs_down', emailId, reason })
});

// On call attempt:
await fetch('/api/call-log', {
  method: 'POST',
  body: JSON.stringify({ contactId, type: 'attempt', notes, instructions })
});

// On idea park:
const result = await fetch('/api/idea', {
  method: 'POST',
  body: JSON.stringify(ideaData)
}).then(r => r.json());
// result.priority_position, result.pushback (if any)

// On EOD:
await fetch('/api/eod-report', { method: 'POST' });

// On instruction update:
const response = await fetch('/api/instructions', {
  method: 'POST',
  body: JSON.stringify({ section: 'Email Rules', instruction: 'Also flag emails from...' })
}).then(r => r.json());
// response.ok, response.message
```

---

# STEP 6: COWORK SETUP

Cowork runs on Tony's desktop (Claude Desktop app). It connects to the SAME Supabase database and uses the SAME Anthropic API with the SAME MCP servers.

### Cowork Project: "FlipIQ Daily Ops"

### Scheduled Task 1: Morning Brief (5:00 AM PT)
```
INSTRUCTIONS FOR COWORK:

Every day at 5:00 AM Pacific:

1. Pull today's Google Calendar events using gcal_list_events
2. Pull unread Gmail using gmail_search_messages (is:unread)
3. Sort emails into Important vs FYI using these rules:
   - Check system_instructions table in Supabase for latest email rules
   - Apply keyword + sender rules from TCC_System_Brain_v1.md Section 7
4. Pull relevant Slack items (DMs, mentions of Tony)
5. Pull Linear issues (assigned to Tony, due today, overdue, blockers)
6. Write structured JSON to Supabase daily_briefs table

The Replit app reads this table when Tony opens it.
No waiting, no live scraping — data is already there.
```

### Scheduled Task 2: Email Sorting (Every 30 min, 6 AM - 10 PM)
```
Check for new emails since last check.
Apply importance rules.
Update daily_briefs.emails_important and emails_fyi in Supabase.
If URGENT email arrives → also send push notification via AgentMail.
```

### Scheduled Task 3: Check-in Writer (On-demand via AgentMail trigger)
```
When AgentMail inbox flipiq@agentmail.to receives an email with
subject starting with "CHECKIN:":

1. Parse the check-in data from email body (JSON)
2. Open Google Sheets: https://docs.google.com/spreadsheets/d/1DVys4rDcntlb3NmuKk4O2TRLV1YgkbtXLvuz4Xx2QBI/edit
3. Find today's column
4. Write values in exact row format matching existing spreadsheet
```

### Scheduled Task 4: Journal Writer (On-demand via AgentMail trigger)
```
When AgentMail inbox flipiq@agentmail.to receives an email with
subject starting with "JOURNAL:":

1. Parse the formatted journal entry from email body
2. Open Google Doc: https://docs.google.com/document/d/1Rm2FGbA5m02QuSxhsZUE0TyOuHSVa7AFW02zp4Wj2Y4/edit
3. Append formatted entry to END of document
4. Maintain exact formatting of existing entries
```

### Scheduled Task 5: EOD Report — Tony (5:00 PM PT)
```
1. Pull from Supabase: checkins, call_log, task_completions,
   ideas (today), demos, meeting_history (today)
2. Generate Tony's report (format from System Brain Section 19)
3. Send to tony@flipiq.com via AgentMail (tony-diaz@agentmail.to)
```

### Scheduled Task 6: EOD Report — Ethan (5:15 PM PT)
```
1. Pull same data as Tony's report
2. Add: override flags, framework building alerts, drift detection
3. Pull Ethan's activity from Slack and Linear
4. Generate Ethan's report (format from System Brain Section 19)
5. Send to ethan@flipiq.com via AgentMail (tony-diaz@agentmail.to)
```

---

# STEP 7: HOW THE ONE API WORKS IN PRACTICE

### Example: Tony clicks "Suggest Reply" on an email

```
1. Frontend sends POST /api/claude with:
   {
     messages: [{
       role: "user",
       content: "Draft a reply to Ethan Jolly's email about 'My Amended Contract'.
                 The email asks what I think is fair for additional equity stake.
                 Keep it professional, suggest we discuss on a call."
     }]
   }

2. Backend calls Anthropic API with MCP servers attached

3. Claude reads the email via Gmail MCP to get full context:
   → gmail_read_message(messageId: "...")

4. Claude drafts a reply

5. Claude creates Gmail draft via Gmail MCP:
   → gmail_create_draft(to: "ethan@flipiq.com", subject: "Re: ...", body: "...")

6. Response returns to frontend: { text: "Draft created. Subject: Re: My Amended Contract..." }
```

### Example: Tony says "Schedule a meeting with Chris Wesser"

```
1. Frontend sends POST /api/claude with:
   {
     messages: [{
       role: "user",
       content: "Schedule a 30-minute meeting with Chris Wesser
                 (chris.wesser@gmail.com) about the capital raise docs.
                 Find an afternoon slot this week."
     }]
   }

2. Claude checks Tony's calendar via Calendar MCP:
   → gcal_find_my_free_time(...)

3. Claude creates the event via Calendar MCP:
   → gcal_create_event(event: { summary: "FlipIQ Capital Raise — Chris Wesser", ... })

4. Response returns: { text: "Meeting created: Thursday 2:00 PM with Chris Wesser" }
```

### Example: Cowork's 5 AM Morning Brief

```
1. Cowork triggers scheduled task
2. Cowork's Claude instance calls:
   → gcal_list_events(timeMin: "today 00:00", timeMax: "today 23:59")
   → gmail_search_messages(q: "is:unread", maxResults: 50)
   → slack_search_public(query: "to:me after:yesterday")
   → linear_list_issues(assignee: "me", state: "In Progress")
3. Claude processes and sorts everything
4. Writes structured JSON to Supabase daily_briefs table
5. When Tony opens the app at 6:30 AM → data loads instantly from Supabase
```

---

# STEP 8: FILE STRUCTURE

```
tonys-command-center/
├── src/
│   ├── app/
│   │   ├── page.tsx              ← Main UI (from JSX artifact)
│   │   ├── layout.tsx            ← Root layout
│   │   └── api/
│   │       ├── claude/
│   │       │   └── route.ts      ← THE one API route
│   │       ├── morning-brief/
│   │       │   └── route.ts      ← Read pre-built brief from Supabase
│   │       ├── checkin/
│   │       │   └── route.ts      ← Save check-in + trigger Cowork
│   │       ├── journal/
│   │       │   └── route.ts      ← Format + save journal
│   │       ├── email-action/
│   │       │   └── route.ts      ← Snooze/reply/train
│   │       ├── call-log/
│   │       │   └── route.ts      ← Log calls + follow-ups
│   │       ├── idea/
│   │       │   └── route.ts      ← Park + prioritize ideas
│   │       ├── eod-report/
│   │       │   └── route.ts      ← Generate + send EOD
│   │       └── instructions/
│   │           └── route.ts      ← Update system instructions
│   ├── lib/
│   │   ├── supabase.ts           ← Supabase client
│   │   ├── claude.ts             ← Anthropic client + MCP config
│   │   └── system-brain.ts       ← System Brain MD as string constant
│   └── components/
│       ├── Tip.tsx               ← Tooltip component
│       ├── Gear.tsx              ← Instructions gear icon
│       ├── Header.tsx            ← Persistent header
│       ├── CheckinGate.tsx       ← Step 1
│       ├── JournalGate.tsx       ← Step 2
│       ├── EmailsView.tsx        ← Step 3
│       ├── ScheduleView.tsx      ← Step 4
│       ├── SalesMode.tsx         ← Step 5a
│       ├── TaskMode.tsx          ← Step 5b
│       ├── CalendarSidebar.tsx   ← Collapsible sidebar
│       ├── IdeasModal.tsx        ← Ideas overlay
│       └── AttemptModal.tsx      ← Call attempt popup
├── public/
│   └── system-brain.md           ← TCC_System_Brain_v1.md (reference copy)
├── .env.local                    ← API keys
└── package.json
```

---

# STEP 9: KEY DOCUMENTS TO UPLOAD TO REPLIT

The developer needs these files from this Claude project:

1. **TCC_System_Brain_v1.md** — The complete system instructions (21 sections, 911 lines). This gets embedded in the Claude API system prompt. It's the brain.

2. **tonys-command-center.jsx** — The complete UI artifact. Convert to TSX components.

3. **FlipIQ_Cowork_Setup_Spec.md** — The Cowork automation specification.

4. **FlipIQ_Combined_Investor_List.xlsx** — The 4,363+ contacts. Import into Supabase contacts table.

5. **FlipIQ_OAP_v4_final.docx** — The operational alignment plan. Extract text and include in system prompt for priority enforcement.

---

# STEP 10: DEPLOYMENT CHECKLIST

| # | Task | Status |
|---|------|--------|
| 1 | Create Replit project with Next.js 14 | |
| 2 | Install dependencies (supabase, anthropic) | |
| 3 | Set up Supabase project + run schema SQL | |
| 4 | Add environment variables to Replit | |
| 5 | Create /api/claude route with MCP servers | |
| 6 | Convert JSX artifact to TSX components | |
| 7 | Wire frontend to API routes | |
| 8 | Import contacts from Excel to Supabase | |
| 9 | Embed System Brain MD in system prompt | |
| 10 | Test check-in → journal → emails → schedule → sales flow | |
| 11 | Test tooltip hover + edit on every element | |
| 12 | Test gear icon instructions on every element | |
| 13 | Test email suggest reply (Claude → Gmail draft) | |
| 14 | Test call attempt → follow-up email | |
| 15 | Test idea parking + Slack posting | |
| 16 | Test EOD report generation | |
| 17 | Set up Cowork project "FlipIQ Daily Ops" | |
| 18 | Configure Cowork scheduled tasks | |
| 19 | Test Cowork morning brief → Supabase | |
| 20 | Test Cowork check-in writer → Google Sheet | |
| 21 | Test Cowork journal writer → Google Doc | |
| 22 | Deploy to production URL | |

---

# CRITICAL NOTES FOR DEVELOPER

1. **ONE API KEY.** The Anthropic API key is the only external key. Gmail, Calendar, Slack, Linear, AgentMail, and Google Drive are all accessed through Claude's MCP servers in the API call. Do NOT create separate OAuth flows for Google, Slack, or Linear.

2. **MCP servers handle authentication.** When you pass `mcp_servers` in the Anthropic API call, Claude authenticates with each service using the MCP protocol. The user (Tony) has already connected these services in his Claude.ai account. The API inherits those connections.

3. **Supabase is the shared brain.** Both the Replit app and Cowork read/write to the same Supabase database. This is how they communicate. Cowork pre-builds the morning brief, the app reads it. The app logs calls, Cowork includes them in EOD reports.

4. **AgentMail is the bridge for async actions.** When the app needs Cowork to do something (write to Google Sheet, append to Google Doc), it sends a structured email to flipiq@agentmail.to. Cowork monitors that inbox and acts on messages.

5. **The System Brain MD file IS the system prompt.** Embed the entire TCC_System_Brain_v1.md (911 lines) in the system prompt for every Claude API call. This is how Claude knows all the rules, tooltips, email importance logic, accountability triggers, etc.

6. **Every element needs tooltip + gear.** The `Tip` and `Gear` components from the JSX artifact wrap every interactive element. Tooltip content comes from the system_instructions table in Supabase (loaded on mount). Gear icon changes write back to that table.

7. **Sequential views only.** The app shows ONE view at a time. Never show multiple panels. The view state controls which full-screen component renders. Calendar sidebar is the only exception (collapses to side panel in Sales/Tasks mode).

8. **State persistence.** Use Supabase for persistence, NOT localStorage. Every state change (check-in, journal, snoozed emails, completed tasks, call log, ideas) writes to Supabase immediately. On reload, the app reads from Supabase and resumes where Tony left off.

---

# AGENTMAIL INBOXES (Already Created)

| Inbox | Address | Purpose |
|-------|---------|---------|
| System | flipiq@agentmail.to | Automated emails, Cowork triggers, data bridge |
| Tony | tony-diaz@agentmail.to | Display name "Tony Diaz \| FlipIQ" — for human-facing emails |

---

# MCP SERVER URLS (For Anthropic API Calls)

| Service | MCP URL | What It Does |
|---------|---------|-------------|
| Gmail | https://gmail.mcp.claude.com/mcp | Read/search/draft emails |
| Google Calendar | https://gcal.mcp.claude.com/mcp | Read/create/update events |
| Slack | https://mcp.slack.com/mcp | Read/send messages, search |
| Linear | https://mcp.linear.app/mcp | Read/create/update issues |
| AgentMail | https://server.smithery.ai/agentmail? | Send emails from system/Tony inboxes |
| Google Drive | (use google_drive_search/fetch tools) | Read documents |

---

# ESTIMATED BUILD TIME

| Phase | Time | What |
|-------|------|------|
| 1. Project setup + Supabase schema | 2-3 hours | Create project, run SQL, env vars |
| 2. API route + Claude integration | 3-4 hours | /api/claude with MCP, test connections |
| 3. Convert JSX to TSX components | 4-6 hours | Split artifact into 12 components |
| 4. Wire frontend to backend | 4-6 hours | Replace sample data with API calls |
| 5. Tooltip + Gear on every element | 2-3 hours | Wrap all elements, load from Supabase |
| 6. Import contacts to Supabase | 1-2 hours | Parse Excel, clean data, bulk insert |
| 7. Test full flow | 2-3 hours | Check-in through EOD report |
| 8. Cowork setup | 2-3 hours | Scheduled tasks, test each one |
| **Total** | **~20-30 hours** | **1 developer, ~1 week** |

---

# HAND THIS TO THE DEVELOPER WITH:

1. This document (Replit_Build_Spec.md)
2. TCC_System_Brain_v1.md (the brain — 911 lines)
3. tonys-command-center.jsx (the UI — working artifact)
4. FlipIQ_Cowork_Setup_Spec.md (Cowork automation)
5. FlipIQ_Combined_Investor_List.xlsx (contacts)
6. FlipIQ_OAP_v4_final.docx (business priorities)

The developer reads this spec, sets up the project, and builds. Tony does NOT need to be involved in the build — he needs to be making sales calls.

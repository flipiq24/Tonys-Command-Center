# Developer Handoff: Tony's Command Center (TCC)

**Repo:** https://github.com/flipiq24/Tonys-Command-Center.git
**Live:** https://TonysCommandCenter.replit.app
**Stack:** React 19 + Vite | Express 5 | Drizzle ORM | PostgreSQL (Supabase) | Claude AI (Anthropic) | Google Workspace | Slack | Linear

---

## What This App Is

A **single-dashboard operating system** for FlipIQ's 3-person team (Tony CEO, Ethan COO, Ramy CSM). Instead of jumping between Gmail, Calendar, Slack, Linear, Google Sheets, and CRM — everything is pulled into one app with a smart AI layer (Claude) that can read/write to all connected services.

**Goal:** Keep Tony focused on sales calls. Every feature either helps him sell or keeps him accountable.

**How it works:**
```
Tony opens app
  → Morning Check-In (sleep, Bible, workout — MANDATORY gate)
  → Journal (brain dump, AI formats it — MANDATORY gate)
  → Dashboard (emails + calendar + tasks + calls in one view)
  → Free navigation: Emails | Sales | Tasks | Schedule | AI Chat
```

**Ethan & Ramy** never open the app. They see data via:
- Google Sheets (Business Master — 3 tabs auto-synced every 5 min)
- EOD email report (auto-sent 4:30 PM Pacific)

---

## Architecture (How It Connects)

```
FRONTEND (artifacts/tcc/src/)
  39 React components → fetch() with x-tcc-token header
    ↓
BACKEND (artifacts/api-server/src/)
  25 route files, 85+ endpoints, 16 lib files
    ↓
┌──────────────┬────────────┬──────────┬────────┬──────────┬───────────┐
│ PostgreSQL   │ Gmail API  │ Google   │ Slack  │ Linear   │ Claude AI │
│ 27 tables    │ Calendar   │ Drive    │ Bot    │ GraphQL  │ 35 tools  │
│ (Supabase)   │ Sheets     │ Docs     │ Token  │          │ 4 models  │
│              │ People     │ Tasks    │        │          │           │
└──────────────┴────────────┴──────────┴────────┴──────────┴───────────┘
                                                      ↕
                                                 MacroDroid
                                              (phone call/SMS
                                               auto-logging)
```

---

## Section-by-Section: What It Does, What to Verify

### 1. AUTH
**File:** `api-server/src/middlewares/auth.ts`
**How:** Bearer token in `x-tcc-token` header, validated against `TCC_AUTH_TOKEN` env var.
**Frontend:** `AuthGate.tsx` — login screen, stores token in sessionStorage.

**Verify:**
- [ ] Login with valid token works
- [ ] Invalid token shows error
- [ ] `/phone-log` and `/auth/verify` are exempted from auth (webhooks need open access)

---

### 2. MORNING CHECK-IN
**Files:** `CheckinGate.tsx` → `POST /checkin` → `checkin.ts`
**Database:** `checkins` table (date, sleep_hours, bible, workout, journal, nutrition, unplug)
**Connected to:** Google Sheets (appends row to Personal Check-in Sheet)
**AI:** 
- **Guilt Trip** — If workout/journal unchecked, Claude generates a confrontational message quoting Tony's personal commitment doc. Prompt is in `TONY_PERSONAL_DOC` constant (~2500 words) + system prompt in `checkin.ts` ~line 200.
- **Pattern Alerts** — Rule-based (NOT AI): detects sleep debt (<6h avg over 3 days), missed Bible streaks, bedtime after 11PM. Thresholds are hardcoded in if/else logic ~line 126.

**Verify:**
- [ ] Check-in form saves to DB and Google Sheet
- [ ] Sleep hours auto-calculate from bed/wake times
- [ ] Guilt trip fires when workout OR journal unchecked (test by submitting with both off)
- [ ] Pattern alerts show after 3+ days of data (populate checkins table with test data)
- [ ] Cannot proceed to Journal without completing check-in

**Google Sheet:** `1rMLE_RhdRDsC2dqRs8eIiF6bySCAkMvy1k4JlHKkRMw` — Confirm rows append with correct columns

---

### 3. JOURNAL
**Files:** `JournalGate.tsx` → `POST /journal` → `journal.ts`
**Database:** `journals` table (date, raw_text, formatted_text, mood, key_events, reflection)
**Connected to:** Google Docs (prepends formatted entry to Daily Journal Doc)
**AI:**
- **Spiritual Anchor** (`GET /brief/spiritual-anchor` in `brief.ts` ~line 614) — Claude generates a 3-4 sentence morning message. NOW includes **Bible engagement escalation**: queries last 5 check-ins, counts missed Bible days, injects engagement level into prompt (low = urgent wake-up call, moderate = gentle, strong = celebrate).
- **Journal Formatting** (`journal.ts` ~line 50) — Claude takes raw brain dump text and structures it into: Mood, Key Events, Health Notes, Reflection, Cleaned Original.

**Verify:**
- [ ] Spiritual anchor loads on journal page
- [ ] Bible escalation changes tone based on recent misses (test by setting last 3 check-ins to bible=false)
- [ ] Voice input works (microphone button)
- [ ] Raw text → AI formats → saves to DB
- [ ] Formatted entry prepends to Google Doc `1kQjIFa903luN-62HkUD0tPGAmeQPC7JMN6rfnbvXYRE`
- [ ] Cannot proceed to Dashboard without completing journal

---

### 4. DASHBOARD
**Files:** `DashboardView.tsx` → `GET /brief/today` → `brief.ts`
**What it shows:** Day timeline, tasks (checkboxes), important emails, Linear items, sales call list, Slack mentions
**Data sources (all fetched in parallel by brief.ts):**
- Gmail → unread emails, classified into Important/FYI/Promotions by AI
- Google Calendar → today's events
- Slack → recent messages from key channels
- Linear → active issues
- DB → contacts, tasks, call log

**AI in brief.ts:**
- **Email Classification** (~line 100): Claude classifies each email as Important/FYI/Promotions based on FlipIQ context
- **Attendee Brief** (~line 278): For the next meeting within 10 min, looks up attendee emails in contacts table, builds context string ("Fernando Perez (Keller Williams) — Engaged, last contact 3 days ago")

**Verify:**
- [ ] Dashboard loads with real data from all sources (or graceful fallback if API unavailable)
- [ ] Calendar events show in timeline
- [ ] Tasks are checkable (toggle saves via `POST /tasks/completed`)
- [ ] Email tiers show correctly (Important has reply buttons, FYI is condensed, Promotions collapsed)
- [ ] Meeting warning banner appears 5 min before next meeting with attendee brief
- [ ] 15-minute auto-refresh timer works (check "Updated X ago" in Header)
- [ ] Linear items display with status and priority

---

### 5. EMAILS
**Files:** `EmailsView.tsx` → `emails.ts`, `email-send.ts`, `email-poll.ts`
**Database:** `email_training`, `email_snoozes`, `system_instructions` (email_brain section)
**AI:**
- **Reply Suggestion** (`emails.ts` ~line 120): Claude drafts reply in Tony's voice — "direct, warm, action-oriented"
- **Email Brain Training**: Thumbs up/down on emails → training data → Claude compiles into "Tony's Email Priority Rules" stored in system_instructions
- **Compose AI Draft** (`email-send.ts` ~line 80): Generates email subject + body from context

**Verify:**
- [ ] 3 tiers display: Important (with action buttons), FYI, Promotions
- [ ] "Suggest Reply" → AI drafts reply → preview → can edit → send via Gmail
- [ ] Snooze works: 1h, 2h, tomorrow, next week, date picker
- [ ] Thumbs up/down saves to email_training table
- [ ] Email Brain regenerates when enough training data exists
- [ ] 5-min email poll (`GET /emails/poll`) detects new emails
- [ ] Compose modal: autocomplete recipients (Google People API), AI draft button, voice input on all fields
- [ ] Snoozed count shows in Header hamburger menu next to "Emails"
- [ ] Sent emails log to communication_log table

---

### 6. SALES CRM
**Files:** `SalesView.tsx` + `SalesMorning.tsx` → `contacts.ts`, `sales-morning.ts`, `contacts-score.ts`, `contacts-research.ts`, `contacts-brief.ts`
**Database:** `contacts` (3,400+ records), `contact_intelligence`, `contact_briefs`, `communication_log`

#### 6a. Sales Morning (3-Tier View)
**Endpoint:** `GET /sales/morning`
**Tiers:**
1. **Urgent Responses** — Contacts who emailed/called/texted in last 48h needing response
2. **Follow-Ups Due** — Contacts with follow_up_date = today (strict: `< today`, not `<= today`)
3. **Top 10 New** — Highest AI-scored prospects (broker/investor types prioritized)

**Cross-tier dedup:** Uses `seenContactIds` Set so a contact only appears in their highest-priority tier.
**Brief line:** Each contact card shows a 120-char italic AI brief-line from `contact_briefs` table (LEFT JOIN).

**Verify:**
- [ ] All 3 tiers load with correct contacts
- [ ] No duplicate contacts across tiers
- [ ] Brief-line shows on cards (needs contact_briefs populated — run batch score + brief first)
- [ ] Stage dropdown (new → outreach → engaged → meeting_scheduled → negotiating → closed → dormant)
- [ ] Status dropdown (New, Hot, Warm, Cold, Inactive)
- [ ] Call/Text/Email/Brief buttons work per contact
- [ ] Pipeline summary stats at top

#### 6b. AI Scoring
**Endpoint:** `POST /contacts/score` → `contacts-score.ts`
**NOT AI — rule-based.** Scores 0-100 based on: contact type (+5-25), comm volume, recency, status temp, pipeline stage, weekly activity. Saves score + reasoning to `contact_intelligence`.

**Verify:**
- [ ] Batch "Score" button scores selected contacts
- [ ] Score + reason saves to contact_intelligence.ai_score and ai_score_reason

#### 6c. AI Research
**Endpoint:** `POST /contacts/research` → `contacts-research.ts`
**Model:** claude-sonnet-4-6 with `web_search_20250305` tool
**What it does:** Internet search for LinkedIn, company info, news, personality notes, communication style
**Cost:** ~$0.15/contact

**Verify:**
- [ ] Cost check (`POST /contacts/research/check`) returns estimate
- [ ] Research runs, saves to contact_intelligence (linkedin_url, company_info, personality_notes)
- [ ] 7-day cache — doesn't re-research within 7 days

#### 6d. Pre-Call Brief
**Endpoint:** `POST /contacts/brief` → `contacts-brief.ts`
**AI:** Generates scannable brief: Quick Summary, Communication Style, Personality Assessment, Key Action

**Verify:**
- [ ] Brief modal opens, shows AI-generated brief
- [ ] Brief caches to contact_briefs table
- [ ] Includes open tasks and recent communications

#### 6e. Contact Drawer
**File:** `ContactDrawer.tsx` → `PATCH /contacts/:id`
**Auto-saves on 1.5s debounce.** Tabs: Details, Notes, Activity, Meetings.

**Verify:**
- [ ] All fields editable, auto-save works
- [ ] Notes tab: can add notes
- [ ] Activity tab: shows communication_log entries
- [ ] Meetings tab: shows meeting_history records

#### 6f. Business Card Scanner
**Endpoint:** `POST /contacts/scan-card` → `contacts.ts`
**AI:** Claude Vision (haiku) extracts name, company, phone, email from photo

**Verify:**
- [ ] Upload/take photo → AI extracts fields → pre-fills contact form

---

### 7. CALLS & PHONE
**Files:** `calls.ts`, `phone-log.ts`, `send-sms.ts`
**Database:** `call_log`, `phone_log`, `communication_log`, `contact_intelligence`

**Call Attempt Flow:**
1. Tony clicks "Attempt" on a contact
2. `AttemptModal.tsx` → types follow-up instructions (voice or text)
3. `POST /calls` → saves to call_log → Claude drafts follow-up email → logs to communication_log → updates contact_intelligence (total_calls++)
4. Modal shows AI draft preview → Tony can send or skip

**Connected Call Flow:**
1. Tony clicks "Connected" → `ConnectedCallModal.tsx`
2. Enters: outcome notes, next step, follow-up date
3. `POST /calls/connected-outcome` → saves all + creates calendar reminder for follow-up date

**Phone Bridge (MacroDroid):**
- `POST /phone-log` — webhook from Android, auto-logs outbound calls/SMS
- `POST /phone-log/incoming` — logs inbound calls/SMS
- Auto-matches phone numbers to contacts (normalized digits)
- Auto-creates contacts for unknown FlipIQ-tagged numbers
- `POST /send-sms` — triggers MacroDroid webhook to send SMS from Tony's phone

**Verify:**
- [ ] Attempt modal → AI drafts follow-up → can preview/send
- [ ] Connected modal → saves outcome, next step, follow-up date → calendar reminder created
- [ ] MacroDroid webhooks log correctly (test with POST to /phone-log)
- [ ] Phone number matching works (normalizes to digits only)
- [ ] All calls/texts log to communication_log

---

### 8. TASKS
**Files:** `TasksView.tsx` → `tasks.ts`
**Database:** `local_tasks`, `task_completions`, `task_work_notes`
**Connected to:** Linear (issues), Google Tasks (bidirectional sync)

**Features:**
- 90-day pillar filters: Adaptation, Sales, Foundation, COO Dashboard
- Work notes with progress % tracking
- Google Drive file picker (attach files to task notes)
- Task alerts: out-of-sequence priority, missing due dates (from Linear)

**AI:**
- **Priority Check** (`POST /tasks/create-with-check`): Before creating a task, Claude evaluates against existing queue and pushes back if lower priority

**Verify:**
- [ ] Pillar filters work
- [ ] Local tasks: create, complete, uncomplete
- [ ] Work note: saves progress %, notes, next steps, attached Drive file
- [ ] Google Tasks sync (`POST /tasks/sync-google`)
- [ ] Task alerts show out-of-sequence and missing-due-date items
- [ ] AI priority check fires on task creation

---

### 9. AI CHAT (The Brain)
**Files:** `ClaudeChatView.tsx` → `chat-threads.ts` + `claude.ts`
**Database:** `chat_threads`, `chat_messages`
**Model:** claude-sonnet-4-6

**35 Tools Available (claude.ts):**

| Category | Tools |
|----------|-------|
| **Slack** | send_slack_message, read_slack_channel, list_slack_channels, search_slack |
| **Email** | send_email, list_recent_emails, draft_gmail_reply, get_email_brain, read_email_thread, search_emails, read_email_message |
| **Calendar** | get_today_calendar, create_calendar_event, get_calendar_range, create_calendar_reminder, update_calendar_event, delete_calendar_event |
| **Contacts** | search_contacts, get_contact_brief, update_contact_stage, research_contact |
| **Tasks** | create_linear_issue, create_task, get_all_tasks |
| **Data** | query_database (read-only SQL), get_business_context, get_communication_log, get_daily_checkin_history |
| **Google** | read_google_sheet, read_google_doc, search_google_drive |
| **Internet** | web_search, browse_url |
| **Other** | get_meeting_history, log_meeting_context, analyze_transcript, send_eod_report, schedule_meeting |

**System Prompt Location:** `buildSystemPrompt()` function in `claude.ts` ~line 686
**To change AI personality/rules:** Edit that function.
**To add/remove tools:** Edit `TOOLS` array (line 14-268) and `executeTool()` (line 271-900+).

**Verify:**
- [ ] Create thread, send message, response streams via SSE
- [ ] Tool activity shows in real-time ("Using: search_contacts")
- [ ] Test each tool category:
  - [ ] "What's on my calendar today?" → get_today_calendar fires
  - [ ] "Search for Fernando in my contacts" → search_contacts fires
  - [ ] "Send a Slack message to #general saying hello" → send_slack_message fires
  - [ ] "Draft a reply to the last email from Fernando" → list_recent_emails + draft_gmail_reply
  - [ ] "What's my pipeline look like?" → query_database fires
  - [ ] "Look up Keller Williams online" → web_search fires
  - [ ] "Read my 90-day plan" → read_google_doc fires
  - [ ] "What's in my Business Master Sheet?" → read_google_sheet fires
- [ ] Thread persistence (reload page → threads still there)
- [ ] Auto-title generation for new threads
- [ ] Scope gatekeeper warns (doesn't block) on non-sales activities

---

### 10. IDEAS (Parking Lot)
**Files:** `IdeasModal.tsx` → `ideas.ts`
**Database:** `ideas`, `business_context`
**AI:**
- **Classification**: Claude classifies idea into category/urgency/tech type, checks business fit against 90-day plan
- **Pushback**: If idea conflicts with priorities, AI warns and suggests parking it
- **Types available:** Bug, Feature, Note, Task, Strategic

**Connected to:** Linear (creates issue for tech ideas), Slack (notifies team), Gmail (notifies assignee)

**Verify:**
- [ ] Type idea → AI classifies → shows business fit analysis
- [ ] Pushback fires if idea is off-strategy
- [ ] Can override classification (category, urgency, type)
- [ ] Assign to team member → notify via email/Slack
- [ ] "Escalate to Ethan" flow works
- [ ] Linear issue created for tech ideas

---

### 11. EOD REPORT
**Files:** `Header.tsx` (modal) → `eod.ts`
**Database:** `eod_reports`, reads from: `call_log`, `demos`, `task_completions`, `task_work_notes`, `communication_log`, `ideas`
**AI:** Claude generates two reports:
1. **Tony's Report** → emailed to tony@flipiq.com — performance summary
2. **Ethan's Report** → emailed to ethan@flipiq.com — accountability brief with out-of-sequence alerts, missing due dates, override tracking

**Auto-send:** Server-side scheduler fires at 4:30 PM Pacific (`api-server/src/index.ts`)

**Verify:**
- [ ] "Send EOD Report" in hamburger menu → preview generates
- [ ] Can edit preview text before sending
- [ ] Sends to both Tony and Ethan via Gmail
- [ ] Won't double-send same day
- [ ] Auto-EOD timer fires at 4:30 PM Pacific (check server logs)
- [ ] Ethan's report includes: activity summary, Linear alerts, override tracking

---

### 12. GOOGLE SHEETS SYNC
**Files:** `sheets-sync.ts`
**Auto-sync:** Every 5 minutes (started in `index.ts`)

**Business Master Sheet** (`1WGuJwCoWbwyFamXXP79yxnPmYhdFPgOGhOR8_V-EQyw`):
| Tab | Source | Columns |
|-----|--------|---------|
| **Master Task List** | local_tasks + task_completions + task_work_notes | Task, Due Date, Status, Progress %, Notes |
| **Contact Master** | contacts + contact_intelligence | Name, Company, Status, Stage, AI Score, Phone, Email, Last Contact |
| **Communication Log** | communication_log | Date, Contact, Channel, Direction, Subject, Summary |

**Personal Check-in Sheet** (`1rMLE_RhdRDsC2dqRs8eIiF6bySCAkMvy1k4JlHKkRMw`):
- Appended on each check-in with dedup (won't double-write same date)

**90-Day Plan Ingestion** (`POST /sheets/ingest-90-day-plan`):
- Reads Google Doc `1b1Ejf6Tim1gevq0BoMeV7XZ2KuXrgP2E` → Claude summarizes → saves to `business_context` table
- Runs daily at 4 AM Pacific

**Verify:**
- [ ] Business Master Sheet has all 3 tabs
- [ ] Data in tabs matches app data
- [ ] Auto-sync runs (check timestamps in sheet)
- [ ] Personal check-in appends correctly
- [ ] 90-day plan ingestion works (check business_context table)

---

### 13. HEADER / NAVIGATION
**File:** `Header.tsx`
**Features:** Hamburger menu (all nav items), Slack bell with popover, meeting warning banner, EOD modal, refresh button, clock

**Verify:**
- [ ] Slack bell shows count badge, popover shows message previews with "Open" link
- [ ] Meeting warning banner appears 5 min before next meeting
- [ ] Attendee brief shows in meeting banner (populated by brief.ts)
- [ ] Hamburger menu: all nav items work
- [ ] Refresh button reloads all data
- [ ] "Updated X ago" timestamp updates

**Known gap:** Linear items prop is accepted but has NO separate badge/popover (only Slack has one). This is the **one remaining UI gap** — needs a Linear icon with count badge and popover similar to Slack.

---

### 14. VOICE INPUT
**Files:** `VoiceField.tsx`, `VoiceInput.tsx`
**Uses:** Browser Web Speech API (SpeechRecognition)

**Present on:** Journal, check-in fields, idea input, email compose (to/subject/body), email reply, call notes, connected call outcome, task creation, SMS compose, AI chat

**Verify:**
- [ ] Mic button appears on all listed fields
- [ ] Click to record, click again to stop
- [ ] Transcription appends to field value
- [ ] Works in Chrome (required for Web Speech API)

---

### 15. PRINT VIEW
**File:** `PrintView.tsx`
**Accessible from:** Hamburger menu → "Print Daily Sheet"
**What it shows:** Newspaper-style layout with schedule, tasks, emails, Linear items, Slack mentions, call list — designed for physical printing (Ctrl+P)

**Verify:**
- [ ] Opens as full-screen overlay
- [ ] Includes all daily data
- [ ] Prints cleanly (Ctrl+P)

---

## AI Training Summary

Every AI feature is **prompt-engineered** (no fine-tuning). To change any output, edit the prompt string in the file.

| AI Feature | File to Edit | What Controls Output |
|------------|-------------|---------------------|
| Check-in guilt trip | `checkin.ts` ~L200 | `TONY_PERSONAL_DOC` constant + system prompt |
| Pattern alerts | `checkin.ts` ~L126 | Hardcoded thresholds (rule-based, not AI) |
| Spiritual anchor | `brief.ts` ~L614 | Inline prompt + Bible engagement level logic |
| Journal formatting | `journal.ts` ~L50 | Output format template in prompt |
| Email classification | `brief.ts` ~L100 | Classification criteria in prompt |
| Email reply draft | `emails.ts` ~L120 | "Tony's voice" system prompt |
| Email compose draft | `email-send.ts` ~L80 | Drafting system prompt |
| Call follow-up draft | `calls.ts` ~L50 | Follow-up prompt template |
| Idea classification | `ideas.ts` ~L100 | Classification + pushback criteria |
| Contact research | `contacts-research.ts` ~L60 | Research prompt (what to look for) |
| Pre-call brief | `contacts-brief.ts` ~L80 | Section headers + instructions |
| Business card OCR | `contacts.ts` ~L200 | Vision extraction prompt |
| AI Chat personality | `claude.ts` L686 | `buildSystemPrompt()` function |
| AI Chat tools | `claude.ts` L14-268 | `TOOLS` array definitions |
| Streaming chat | `chat-threads.ts` | Inline system prompt |
| EOD report (Tony) | `eod.ts` ~L100 | Tony's EOD prompt |
| EOD report (Ethan) | `eod.ts` ~L150 | Ethan's accountability prompt |
| Task priority check | `tasks.ts` | Priority evaluation prompt |
| Schedule scope gate | `schedule.ts` | Classification categories |
| AI day plan | `schedule.ts` | Day plan prompt |
| Scanned sheet OCR | `sheet-scan.ts` | Vision prompt + JSON schema |

---

## Environment Variables Required

| Variable | What It Is |
|----------|-----------|
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `TCC_AUTH_TOKEN` | App login token |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Claude API key |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GOOGLE_REFRESH_TOKEN` | Google OAuth |
| `SLACK_TOKEN` | Slack bot token (xoxb-) |
| `MACRODROID_SECRET` | Phone webhook auth |
| `MACRODROID_WEBHOOK_URL` | Phone SMS trigger |
| `BUSINESS_MASTER_SHEET_ID` | `1WGuJwCoWbwyFamXXP79yxnPmYhdFPgOGhOR8_V-EQyw` |
| `CHECKIN_SHEET_ID` | `1rMLE_RhdRDsC2dqRs8eIiF6bySCAkMvy1k4JlHKkRMw` |
| `JOURNAL_DOC_ID` | `1kQjIFa903luN-62HkUD0tPGAmeQPC7JMN6rfnbvXYRE` |
| `PLAN_90_DAY_ID` | `1b1Ejf6Tim1gevq0BoMeV7XZ2KuXrgP2E` |

---

## One Known Gap

**Linear badge in Header** — `Header.tsx` accepts `linearItems` prop but does NOT render a separate badge or popover for it. Only Slack has a bell icon. Needs: a Linear icon (next to Slack bell) with count badge and click-to-expand popover listing items with priority, title, due date, and overdue flag. Use the same pattern as the Slack popover.

---

## Database: 27 Tables

See `lib/db/src/schema/tcc.ts` (16 tables) and `lib/db/src/schema/tcc-v2.ts` (11 tables) for full column definitions. No migrations — uses `drizzle-kit push` to sync schema directly.

**Most critical tables to verify have data:**
- `contacts` — Should have ~3,400 records (imported from Excel)
- `checkins` — Populated daily by morning check-in
- `communication_log` — Populated by calls, emails, phone-log
- `contact_intelligence` — Populated by scoring + research
- `business_context` — Populated by 90-day plan ingestion
- `system_instructions` — Populated by email brain + SmartTip edits

---

*Questions → tony@flipiq.com or check the repo. Full wireframe HTML is at `docs/TCC-Technical-Handoff.html`.*

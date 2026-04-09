# Tony's Command Center (TCC) — Complete Technical Handoff Document

**Version:** 2.0
**Last Updated:** April 5, 2026
**Author:** Tony Diaz (CEO, FlipIQ) + Claude AI Architecture Review
**Live App:** https://TonysCommandCenter.replit.app
**GitHub:** https://github.com/flipiq24/Tonys-Command-Center
**Replit:** https://replit.com (search "Tonys-Command-Center")

---

## Table of Contents

1. [What Is This App?](#1-what-is-this-app)
2. [Who Uses It?](#2-who-uses-it)
3. [Architecture Overview](#3-architecture-overview)
4. [Morning Sequence Flow](#4-morning-sequence-flow)
5. [Every Component — What It Does, What It Connects To](#5-every-component)
6. [Every API Route — Endpoint Map](#6-every-api-route)
7. [Every Database Table](#7-every-database-table)
8. [All AI-Powered Features — Prompts & How to Change Them](#8-all-ai-powered-features)
9. [External Service Connections](#9-external-service-connections)
10. [Environment Variables](#10-environment-variables)
11. [Frontend → Backend → API Connection Map](#11-connection-map)
12. [What Still Needs Work](#12-what-still-needs-work)
13. [Testing Checklist](#13-testing-checklist)
14. [File Index](#14-file-index)

---

## 1. What Is This App?

Tony's Command Center (TCC) is a **single point of entry** for the FlipIQ leadership team (Tony, Ethan, Ramy) to manage their entire daily operation without jumping between 8+ different tools.

### The Problem It Solves
Tony (CEO), Ethan (COO), and Ramy (CSM) were using Gmail, Google Calendar, Slack, Linear, Google Sheets, Google Docs, and their phones separately — losing context, missing follow-ups, and wasting time switching between apps. Tony has ADHD, which makes scattered tools especially harmful to productivity.

### What It Does
- **One dashboard** that pulls data from Gmail, Calendar, Slack, Linear, Google Drive, Google Sheets, and Supabase/PostgreSQL into a single view
- **Smart AI overlay** (Claude) trained on FlipIQ's business logic that can read/write to ALL connected services
- **Sequential morning ritual** that ensures Tony completes habits before accessing email/sales
- **Sales CRM** with AI scoring, research, pre-call briefs, and call tracking
- **Auto-EOD reports** emailed at 4:30 PM Pacific summarizing the day
- **Scope gatekeeper** that keeps the team focused on sales-first priorities
- **Two-way Google Sheets sync** so Ethan/Ramy can see data in familiar spreadsheets
- **Print-ready daily action sheet** so Tony can go analog during call blocks
- **MacroDroid phone bridge** that auto-logs every call and SMS from Tony's Android

### The Goal
Every Acquisition Associate closes **2 deals/month** at $2,500/acquisition. Revenue targets: $50K break-even → $100K Phase 1 → $250K Scale. This app keeps the team executing against that North Star instead of getting distracted.

---

## 2. Who Uses It?

| Person | Role | Access Level | What They See |
|--------|------|-------------|---------------|
| **Tony Diaz** | CEO | Full app access | All views, AI chat, sales, emails, schedule, tasks, check-in |
| **Ethan** | COO | Google Sheets + EOD email | Business Master Sheet (3 tabs), daily accountability report |
| **Ramy** | CSM | Google Sheets | Business Master Sheet, task visibility |

Tony accesses TCC directly. Ethan and Ramy get data via:
- **Business Master Google Sheet** (`1WGuJwCoWbwyFamXXP79yxnPmYhdFPgOGhOR8_V-EQyw`) — 3 tabs synced every 5 minutes
- **EOD Email** — Ethan gets a daily accountability brief at 4:30 PM

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                          │
│         React 19 + Vite + TypeScript                 │
│         Inline CSS (constants: C, F, FS)             │
│         artifacts/tcc/src/                            │
└──────────────────────┬──────────────────────────────┘
                       │ fetch() with x-tcc-token header
                       ▼
┌─────────────────────────────────────────────────────┐
│                   BACKEND                            │
│        Express 5 + TypeScript                        │
│        artifacts/api-server/src/                     │
│        85+ API endpoints                             │
└───────┬──────┬──────┬──────┬──────┬──────┬─────────┘
        │      │      │      │      │      │
        ▼      ▼      ▼      ▼      ▼      ▼
   Supabase  Gmail  GCal  Slack  Linear  Claude AI
   Postgres  Drive  Sheets People Tasks   (Anthropic)
             Docs                          MacroDroid
```

### Monorepo Structure (pnpm workspaces)
```
Tonys-Command-Center/
├── artifacts/
│   ├── tcc/                    # Frontend (React + Vite)
│   │   └── src/
│   │       ├── App.tsx         # Main app shell + routing
│   │       ├── lib/api.ts      # API client (fetch wrapper)
│   │       └── components/tcc/ # All UI components
│   └── api-server/             # Backend (Express)
│       └── src/
│           ├── index.ts        # Server entry + schedulers
│           ├── app.ts          # Express config + CORS
│           ├── routes/tcc/     # All API routes (25+ files)
│           ├── lib/            # Service connectors (15 files)
│           └── middlewares/    # Auth middleware
├── lib/
│   ├── db/                     # Database (Drizzle ORM + schema)
│   │   └── src/schema/
│   │       ├── tcc.ts          # V1 tables (16 tables)
│   │       └── tcc-v2.ts       # V2 tables (11 tables)
│   ├── api-zod/                # Shared Zod validation schemas
│   └── integrations/           # External SDK wrappers
│       ├── anthropic-ai/       # Claude API client
│       └── linear/             # Linear SDK client
├── docs/v2-build/              # Build phase documentation
├── scripts/                    # Import scripts, seeds
└── PRD.md                      # Product Requirements
```

---

## 4. Morning Sequence Flow

The app enforces a strict morning sequence. Tony CANNOT skip to emails or sales until completing each gate.

```
App Launch
    │
    ▼
[1] CHECK-IN GATE (CheckinGate.tsx → POST /checkin)
    │  Sleep hours, bedtime, wake time
    │  Bible ✓/✗, Workout ✓/✗, Journal ✓/✗
    │  Nutrition rating, Unplug ✓/✗
    │  → AI detects patterns (sleep debt, missed Bible streak)
    │  → AI guilt-trip if workout/journal skipped
    │  → Logs to Google Sheet (Personal Check-in)
    │
    ▼
[2] JOURNAL GATE (JournalGate.tsx → POST /journal)
    │  Spiritual anchor displayed (AI-generated)
    │  Voice or type brain dump
    │  → AI formats into structured entry
    │  → Saves to Google Doc (Daily Journal)
    │
    ▼
[3] DASHBOARD (DashboardView.tsx → GET /brief/today)
    │  Day timeline, tasks, emails, Linear items, call list
    │  Tony can now navigate freely to:
    │
    ├──→ [4] EMAILS (EmailsView.tsx)
    │       Important / FYI / Promotions tiers
    │       AI reply suggestions, snooze, train brain
    │
    ├──→ [5] SCHEDULE (ScheduleView.tsx)
    │       Full calendar view, add events, meeting prep
    │
    ├──→ [6] SALES (SalesView.tsx + SalesMorning.tsx)
    │       CRM, 3-tier morning view, AI scoring/research
    │       Call/text/email actions per contact
    │
    ├──→ [7] TASKS (TasksView.tsx)
    │       90-day pillars, work notes, Google Tasks sync
    │
    └──→ [8] AI CHAT (ClaudeChatView.tsx)
            Threaded Claude chat with 21 tools
            Can read/write to ALL connected services
```

---

## 5. Every Component — What It Does, What It Connects To

### 5.1 App Shell

| Component | File | Purpose | API Calls | AI? |
|-----------|------|---------|-----------|-----|
| **App** | `App.tsx` | Main shell. Routes views, manages global state, runs timers (15-min refresh, 5-min email poll, 4:30 PM EOD). | `GET /brief/today`, `GET /emails/poll`, `GET /linear/live`, `POST /eod-report/auto`, `GET /checkin/today`, `GET /journal/today`, `GET /calls`, `GET /ideas`, `GET /emails/snoozed`, `GET /tasks/completed`, `GET /system-instructions`, `GET /contacts` | No (delegates to children) |
| **AuthGate** | `AuthGate.tsx` | Token login screen. Validates `x-tcc-token`. | `POST /auth/verify` | No |
| **ErrorBoundary** | `ErrorBoundary.tsx` | Catches React crashes, shows "Try again" | None | No |

### 5.2 Morning Sequence

| Component | File | Purpose | API Calls | AI? |
|-----------|------|---------|-----------|-----|
| **CheckinGate** | `CheckinGate.tsx` | Morning habit form (sleep, Bible, workout, etc). Guilt-trip if skipping. Pattern alerts after submit. | `POST /checkin`, `POST /checkin/guilt-trip` | **YES** — Guilt trip uses Claude to pull quotes from Tony's personal commitment doc. Pattern alerts analyze 7-day trends. |
| **JournalGate** | `JournalGate.tsx` | Brain dump form with spiritual anchor. | `GET /brief/spiritual-anchor`, `POST /journal` | **YES** — Spiritual anchor is AI-generated. Journal text is AI-formatted into structured entry. |

### 5.3 Main Views

| Component | File | Purpose | API Calls | AI? |
|-----------|------|---------|-----------|-----|
| **DashboardView** | `DashboardView.tsx` | Newspaper-style daily overview: timeline, tasks, emails, Linear items, call list, Slack mentions. | `GET /contacts`, `PATCH /contacts/:id` | No (displays AI-scored data from brief) |
| **EmailsView** | `EmailsView.tsx` | 3-tier email triage (Important/FYI/Promotions). Train brain, snooze, reply. | `POST /emails/action` (snooze, thumbs_up, thumbs_down) | **YES** — Email brain training. AI classifies importance. |
| **ScheduleView** | `ScheduleView.tsx` | Full-day calendar timeline. Color-coded events. Meeting links. | None (uses data from App) | No |
| **SalesView** | `SalesView.tsx` | Full CRM with filters, search, contact actions (call/text/email/attempt). | `GET /contacts?filters` | No |
| **SalesMorning** | `SalesMorning.tsx` | 3-tier morning call list: Urgent Responses, Follow-Ups Due, Top 10 New. Pipeline summary. Batch scoring/research. | `GET /sales/morning`, `POST /contacts/score`, `POST /contacts/research`, `POST /contacts/brief`, `PATCH /contacts/:id` | **YES** — AI scoring, AI research (web search), AI pre-call briefs. |
| **TasksView** | `TasksView.tsx` | Task management with 90-day pillars, work notes, Google Tasks sync, drive file picker. | `GET /tasks/local`, `GET /tasks/refresh`, `GET /tasks/work-notes-today`, `GET /tasks/alerts`, `POST /tasks/work-note`, `PATCH /tasks/local/:id`, `GET /drive/search`, `GET /drive/folder` | **YES** — AI priority checking on task creation. |
| **ClaudeChatView** | `ClaudeChatView.tsx` | Full threaded chat with Claude. SSE streaming. Shows tool usage in real-time. | `GET /chat/threads`, `POST /chat/threads`, `GET /chat/threads/:id/messages`, `POST /chat/threads/:id/messages` (SSE), `DELETE /chat/threads/:id` | **YES** — This IS the AI chat. 21 tools. |

### 5.4 Modals & Overlays

| Component | File | Purpose | API Calls | AI? |
|-----------|------|---------|-----------|-----|
| **Header** | `Header.tsx` | Sticky top bar. Hamburger menu. Slack bell + popover. Meeting warning banner. EOD modal. | `POST /eod-report/preview`, `POST /eod-report` | **YES** — EOD report is AI-generated. |
| **IdeasModal** | `IdeasModal.tsx` | Multi-step idea capture wizard. AI classifies, pushback if off-plan, escalate to Ethan. | `POST /ideas/classify`, `POST /ideas`, `POST /ideas/notify-assignee`, `POST /ideas/escalate-to-ethan`, `GET /ideas/team-members` | **YES** — AI classifies ideas. Checks business fit. Pushback system. |
| **AttemptModal** | `AttemptModal.tsx` | Log a call attempt. AI drafts follow-up email. Preview before send. | `POST /calls` | **YES** — AI drafts follow-up email. |
| **EmailCompose** | `EmailCompose.tsx` | Full email compose with autocomplete, voice, AI draft. | `GET /contacts/autocomplete`, `GET /email/signature`, `POST /email/suggest-draft`, `POST /email/send` | **YES** — "AI Draft" generates email body + subject. |
| **EmailReplyModal** | `EmailReplyModal.tsx` | Reply to an email with AI-drafted reply. Thread viewer. Snooze. | `POST /emails/action` (suggest_reply, fetch_thread, send_reply, snooze) | **YES** — Auto-generates reply draft in Tony's voice. |
| **ConnectedCallModal** | `ConnectedCallModal.tsx` | Log a connected call (outcome, next step, follow-up date). | `POST /calls/connected-outcome` | No |
| **ContactDrawer** | `ContactDrawer.tsx` | Slide-out contact detail panel. Edit fields, notes, activity, meetings. Auto-saves on 1.5s debounce. | `GET /contacts/:id`, `PATCH /contacts/:id`, `POST /contacts/:id/notes`, `DELETE /contacts/:id`, `GET /meeting-history` | No |
| **AddContactModal** | `AddContactModal.tsx` | Create contact with business card scanner. | `POST /contacts/scan-card`, `POST /contacts` | **YES** — Business card OCR via Claude Vision. |
| **AddScheduleItemWizard** | `AddScheduleItemWizard.tsx` | Create calendar event with guest autocomplete and guilt trip. | `GET /contacts/autocomplete`, `GET /contacts/email-history`, `POST /schedule/add` | **YES** — Guilt trip if scheduling during call hours. Scope gatekeeper. |
| **CreateTaskModal** | `CreateTaskModal.tsx` | Create task with AI priority check. | `POST /tasks/create-with-check` | **YES** — AI checks if higher-priority items should be done first. |
| **CalendarSidebar** | `CalendarSidebar.tsx` | Right sidebar showing today's events with current-time highlight. | None (uses CalItem[] prop) | No |
| **PrintView** | `PrintView.tsx` | Print-optimized daily action sheet. Newspaper layout. | None (uses prop data) | No |
| **ClaudeModal** | `ClaudeModal.tsx` | Simple single-prompt AI chat (not threaded). | `POST /claude` | **YES** — Direct Claude call. |
| **SmsModal** | `SmsModal.tsx` | Send SMS via MacroDroid webhook. | `POST /send-sms` | No |

### 5.5 Utility Components

| Component | File | Purpose |
|-----------|------|---------|
| **VoiceField** | `VoiceField.tsx` | Input/textarea with inline microphone for speech-to-text |
| **VoiceInput** | `VoiceInput.tsx` | Standalone mic button for speech-to-text |
| **SmartTip** | `SmartTip.tsx` | Ctrl+hover to edit tooltip text (saves to system_instructions) |
| **Tip** | `Tip.tsx` | Simple hover tooltip |
| **DeepLink** | `DeepLink.tsx` | One-click link to Gmail/Calendar/Slack/Linear |
| **HoverCard** | `HoverCard.tsx` | Dark tooltip showing key-value rows on hover |
| **FontLink** | `FontLink.tsx` | Google Fonts loader |
| **TimeRoutingBanner** | `TimeRoutingBanner.tsx` | Shows current time block (Calls/Emails/Admin/Unplug) |

---

## 6. Every API Route — Endpoint Map

### Authentication
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| POST | `/auth/verify` | `auth.ts` | Verify access token |

### Morning Sequence
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| GET | `/checkin/today` | `checkin.ts` | Get today's check-in |
| POST | `/checkin` | `checkin.ts` | Save check-in, returns pattern alerts |
| POST | `/checkin/guilt-trip` | `checkin.ts` | AI guilt-trip message for skipped habits |
| GET | `/journal/today` | `journal.ts` | Get today's journal |
| POST | `/journal` | `journal.ts` | Save journal (AI formats it) |
| GET | `/brief/today` | `brief.ts` | Morning brief (all data aggregated) |
| GET | `/morning-brief` | `brief.ts` | Alias for /brief/today |
| GET | `/brief/spiritual-anchor` | `brief.ts` | AI spiritual morning message |

### Emails
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| GET | `/emails/brain` | `emails.ts` | Get email priority rules |
| GET | `/emails/snoozed` | `emails.ts` | Get snoozed emails |
| POST | `/emails/action` | `emails.ts` | Actions: thumbs_up, thumbs_down, snooze, fetch_thread, suggest_reply, send_reply |
| GET | `/emails/poll` | `email-poll.ts` | Poll Gmail for new emails |
| GET | `/email/signature` | `email-send.ts` | Get Gmail signature |
| POST | `/email/send` | `email-send.ts` | Send email via Gmail |
| POST | `/email/suggest-draft` | `email-send.ts` | AI draft suggestion |

### Contacts & CRM
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| GET | `/contacts` | `contacts.ts` | List contacts with filters/search/pagination |
| GET | `/contacts/:id` | `contacts.ts` | Get single contact with notes/calls |
| POST | `/contacts` | `contacts.ts` | Create contact |
| PATCH | `/contacts/:id` | `contacts.ts` | Update contact fields |
| DELETE | `/contacts/:id` | `contacts.ts` | Delete contact |
| GET | `/contacts/:id/notes` | `contacts.ts` | Get contact notes |
| POST | `/contacts/:id/notes` | `contacts.ts` | Add contact note |
| POST | `/contacts/scan-card` | `contacts.ts` | AI business card scanner |
| GET | `/contacts/autocomplete` | `contacts-autocomplete.ts` | Google People autocomplete |
| GET | `/contacts/email-history` | `contacts-autocomplete.ts` | Gmail history for email |
| POST | `/contacts/score` | `contacts-score.ts` | Rule-based AI contact scoring |
| POST | `/contacts/research/check` | `contacts-research.ts` | Cost check before AI research |
| POST | `/contacts/research` | `contacts-research.ts` | Full AI web research on contact |
| POST | `/contacts/brief` | `contacts-brief.ts` | Generate AI pre-call brief |
| GET | `/contacts/:contactId/brief` | `contacts-brief.ts` | Get cached brief |

### Sales
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| GET | `/sales/morning` | `sales-morning.ts` | 3-tier morning call list |
| POST | `/contacts/:contactId/stage` | `sales-morning.ts` | Update pipeline stage |
| POST | `/contacts/:contactId/status` | `sales-morning.ts` | Update contact status |
| POST | `/contacts/:contactId/call-outcome` | `sales-morning.ts` | Log connected call result |

### Calls & Phone
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| GET | `/calls` | `calls.ts` | Get today's call log |
| POST | `/calls` | `calls.ts` | Log call attempt (AI follow-up draft) |
| POST | `/calls/connected-outcome` | `calls.ts` | Log connected call outcome |
| POST | `/phone-log` | `phone-log.ts` | MacroDroid webhook (outbound calls/SMS) |
| POST | `/phone-log/incoming` | `phone-log.ts` | MacroDroid webhook (inbound) |
| GET | `/phone-log` | `phone-log.ts` | Get phone log |
| GET | `/phone-log/today` | `phone-log.ts` | Get today's phone log |
| POST | `/send-sms` | `send-sms.ts` | Send SMS via MacroDroid |

### Tasks
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| GET | `/tasks/completed` | `tasks.ts` | Get completed tasks |
| POST | `/tasks/completed` | `tasks.ts` | Mark task complete |
| DELETE | `/tasks/completed/:taskId` | `tasks.ts` | Un-complete task |
| POST | `/tasks/work-note` | `tasks.ts` | Save work note with progress |
| GET | `/tasks/work-notes/:taskId` | `tasks.ts` | Get work notes for task |
| GET | `/tasks/work-notes-today` | `tasks.ts` | Get today's work notes |
| GET | `/tasks/linear` | `tasks.ts` | Get Linear issues |
| GET | `/tasks/local` | `tasks.ts` | Get local tasks |
| PATCH | `/tasks/local/:id` | `tasks.ts` | Update local task |
| POST | `/tasks/create-with-check` | `tasks.ts` | Create task with AI priority check |
| POST | `/tasks/sync-google` | `tasks.ts` | Sync with Google Tasks |
| GET | `/tasks/refresh` | `tasks.ts` | Refresh all tasks |
| GET | `/tasks/alerts` | `tasks.ts` | Get out-of-sequence/missing-due-date alerts |

### AI Chat
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| POST | `/claude` | `claude.ts` | Single-turn Claude prompt (21 tools) |
| GET | `/chat/threads` | `chat-threads.ts` | List chat threads |
| POST | `/chat/threads` | `chat-threads.ts` | Create chat thread |
| DELETE | `/chat/threads/:threadId` | `chat-threads.ts` | Delete thread |
| GET | `/chat/threads/:threadId/messages` | `chat-threads.ts` | Get messages |
| POST | `/chat/threads/:threadId/messages` | `chat-threads.ts` | Send message (SSE streaming) |

### Calendar & Schedule
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| POST | `/schedule/add` | `schedule.ts` | Smart schedule (guilt trip + scope gate) |
| POST | `/schedule/ai-plan` | `schedule.ts` | AI-generated day plan |
| GET | `/time-routing` | `time-routing.ts` | Current time block |

### Ideas
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| GET | `/ideas` | `ideas.ts` | List ideas |
| POST | `/ideas` | `ideas.ts` | Save idea |
| POST | `/ideas/classify` | `ideas.ts` | AI classify idea |
| GET | `/ideas/team-members` | `ideas.ts` | Linear+Slack merged team |
| POST | `/ideas/notify-assignee` | `ideas.ts` | Notify via email/Slack |
| POST | `/ideas/notify-override` | `ideas.ts` | Notify leadership of override |
| POST | `/ideas/escalate-to-ethan` | `ideas.ts` | Escalate to Ethan |

### EOD Report
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| GET | `/eod-report/today` | `eod.ts` | Get today's report |
| POST | `/eod-report/preview` | `eod.ts` | Generate preview |
| POST | `/eod-report` | `eod.ts` | Send report |
| POST | `/eod-report/auto` | `eod.ts` | Auto-send (scheduler) |

### Google Services
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| POST | `/sheets/checkin-append` | `sheets-sync.ts` | Append to check-in sheet |
| POST | `/sheets/sync-master` | `sheets-sync.ts` | Sync Business Master Sheet |
| POST | `/sheets/ingest-90-day-plan` | `sheets-sync.ts` | Ingest 90-day plan doc |
| GET | `/business-context` | `sheets-sync.ts` | Get business context |
| POST | `/business-context` | `sheets-sync.ts` | Save business context |
| GET | `/drive/folder` | `drive.ts` | Browse Drive folders |
| GET | `/drive/search` | `drive.ts` | Search Drive files |
| POST | `/drive/setup-folders` | `drive.ts` | Create standard folder structure |
| GET | `/sheet-scan/inbox` | `sheet-scan.ts` | Check AgentMail for scanned sheets |
| POST | `/sheet-scan/process` | `sheet-scan.ts` | Process scanned daily sheet (AI Vision) |

### Communication Log
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| GET | `/communication-log/recent` | `communication-log.ts` | Recent activity |
| GET | `/communication-log/:contactId/stats` | `communication-log.ts` | Contact comm stats |
| GET | `/communication-log/:contactId` | `communication-log.ts` | Contact comm history |

### Other
| Method | Endpoint | File | Purpose |
|--------|----------|------|---------|
| GET | `/healthz` | `health.ts` | Health check |
| GET | `/system-instructions` | `system-instructions.ts` | Get config/instructions |
| POST | `/system-instructions` | `system-instructions.ts` | Save config/instructions |
| GET | `/meeting-history` | `meeting-history.ts` | Get meeting records |
| POST | `/meeting-history` | `meeting-history.ts` | Save meeting record |
| DELETE | `/meeting-history/:id` | `meeting-history.ts` | Delete meeting record |
| GET | `/demos/count` | `demos.ts` | Demo count |
| POST | `/demos/increment` | `demos.ts` | Add demo |
| POST | `/demos/decrement` | `demos.ts` | Remove demo |
| GET | `/linear/live` | `linear.ts` | Live Linear issues |
| GET | `/linear/me` | `linear.ts` | Current Linear user |
| GET | `/linear/teams` | `linear.ts` | Linear teams |
| GET | `/linear/issues` | `linear.ts` | Linear issues |
| POST | `/linear/issues` | `linear.ts` | Create Linear issue |
| PATCH | `/linear/issues/:id` | `linear.ts` | Update Linear issue |
| GET | `/notes/scratch` | `notes-scratch.ts` | Get scratch notes |
| POST | `/notes/scratch` | `notes-scratch.ts` | Create scratch note |
| PATCH | `/notes/scratch/:id` | `notes-scratch.ts` | Update scratch note |
| DELETE | `/notes/scratch/:id` | `notes-scratch.ts` | Delete scratch note |

---

## 7. Every Database Table

### 27 total tables (16 v1 + 11 v2) in Supabase/PostgreSQL via Drizzle ORM

#### Core Tables

| Table | Purpose | Key Columns | Written By | Read By |
|-------|---------|-------------|------------|---------|
| **contacts** | All CRM contacts (~3,400 records) | id, name, company, status, phone, email, type, category, pipeline_stage, follow_up_date, deal_value, lead_source | contacts.ts, phone-log.ts | 10+ routes |
| **contact_intelligence** | AI scores, comm stats, personality notes per contact | contact_id (FK→contacts), ai_score, stage, total_calls/emails/texts, personality_notes, next_action | contacts-score.ts, contacts-research.ts, calls.ts, phone-log.ts | claude.ts, sales-morning.ts, contacts-brief.ts |
| **contact_briefs** | Cached AI pre-call briefings | contact_id, brief_text, open_tasks, recent_communications | contacts-brief.ts | claude.ts |
| **contact_notes** | Timestamped notes per contact | contact_id (FK→contacts), text, kind | contacts.ts | contacts.ts |
| **communication_log** | Unified log of ALL communications (email, call, SMS, meeting) | contact_id, channel, direction, subject, summary, gmail_thread_id | calls.ts, email-poll.ts, phone-log.ts, email-send.ts | 8+ routes |

#### Daily Workflow

| Table | Purpose | Key Columns | Written By | Read By |
|-------|---------|-------------|------------|---------|
| **checkins** | Daily morning habit check-in | date (unique), sleep_hours, bible, workout, journal, nutrition, unplug | checkin.ts | brief.ts, journal.ts |
| **journals** | Journal entries (raw + AI-formatted) | date (unique), raw_text, formatted_text, mood, reflection | journal.ts | journal.ts |
| **daily_briefs** | Cached morning brief data | date (unique), calendar_data, emails_important, emails_fyi, slack_items, tasks | brief.ts | brief.ts |
| **daily_suggestions** | AI morning sales suggestions | date (unique), urgent_responses, follow_ups, top_10_new, pipeline_summary | (internal) | (internal) |

#### Tasks & Work

| Table | Purpose | Key Columns | Written By | Read By |
|-------|---------|-------------|------------|---------|
| **task_completions** | Completed task tracking | task_id, task_text, completed_at | tasks.ts | eod.ts, sheets-sync.ts |
| **task_work_notes** | Progress notes per task | task_id, date, note, progress (0-100%), next_steps, drive_file_id | tasks.ts | eod.ts, sheets-sync.ts |
| **local_tasks** | Locally-managed tasks | text, due_date, priority, status, google_task_id, task_type, size | tasks.ts | sheets-sync.ts |

#### Calls & Phone

| Table | Purpose | Key Columns | Written By | Read By |
|-------|---------|-------------|------------|---------|
| **call_log** | Sales call attempts + outcomes | contact_id, contact_name, type, notes, follow_up_sent, follow_up_text | calls.ts, sheet-scan.ts | eod.ts, brief.ts |
| **phone_log** | MacroDroid auto-logged calls/SMS | contact_id, phone_number, type, duration_seconds, sms_body, matched | phone-log.ts | phone-log.ts |

#### Email

| Table | Purpose | Key Columns | Written By | Read By |
|-------|---------|-------------|------------|---------|
| **email_training** | Thumbs up/down email training data | sender, subject, action, reason | emails.ts | emails.ts |
| **email_snoozes** | Snoozed email tracking | date, email_id, snooze_until | emails.ts | emails.ts |

#### AI & Chat

| Table | Purpose | Key Columns | Written By | Read By |
|-------|---------|-------------|------------|---------|
| **chat_threads** | Claude chat thread metadata | title, context_type, context_id | chat-threads.ts, claude.ts | chat-threads.ts |
| **chat_messages** | Chat messages per thread | thread_id (FK→chat_threads), role, content, tool_calls | chat-threads.ts, claude.ts | chat-threads.ts |
| **business_context** | AI-queryable business docs (plan, 90-day plan) | document_type (unique), content, summary | sheets-sync.ts | claude.ts, ideas.ts, eod.ts |
| **system_instructions** | Config key-values (email brain, active view, tips) | section (unique), content | system-instructions.ts, emails.ts | claude.ts, App.tsx |

#### Other

| Table | Purpose | Key Columns | Written By | Read By |
|-------|---------|-------------|------------|---------|
| **ideas** | Ideas parking lot with classification | text, category, urgency, tech_type, status, override, assignee_name | ideas.ts | eod.ts |
| **demos** | Demo count tracking | contact_name, scheduled_date, status | demos.ts | eod.ts |
| **eod_reports** | End-of-day reports | date (unique), calls_made, demos_booked, tasks_completed, report_text | eod.ts | eod.ts |
| **meeting_history** | Meeting records | date, contact_name, summary, next_steps, outcome | meeting-history.ts, claude.ts | claude.ts |
| **scratch_notes** | Quick scratch pad | text, checked, position | notes-scratch.ts | notes-scratch.ts |
| **manual_schedule_events** | Manually-added calendar events | date, time, title, type, category, importance, forced_override | schedule.ts | schedule.ts |

---

## 8. All AI-Powered Features — Prompts & How to Change Them

This is every place where Claude AI is called. **To change any AI behavior, edit the prompt text in the file listed.**

### 8.1 Check-in Guilt Trip
- **File:** `artifacts/api-server/src/routes/tcc/checkin.ts` (line ~200-250)
- **Model:** claude-haiku-4-5
- **What it does:** When Tony skips workout or journal, generates a confrontational accountability message using quotes from Tony's personal commitment document
- **Prompt location:** `TONY_PERSONAL_DOC` constant (~2,500 words) + system prompt starting with "You are Tony's personal accountability system"
- **To change:** Edit the system prompt or update `TONY_PERSONAL_DOC` with new commitment text
- **Inputs:** Which habits were missed, severity level
- **Output:** A direct, confrontational paragraph (~150 words)

### 8.2 Check-in Pattern Alerts
- **File:** `artifacts/api-server/src/routes/tcc/checkin.ts` (line ~126-175)
- **What it does:** Detects patterns: sleep debt (<6h avg over 3 days), Bible streak misses, bedtime after 11PM
- **NOT AI — rule-based logic.** Change the thresholds directly in the if/else code.

### 8.3 Spiritual Anchor
- **File:** `artifacts/api-server/src/routes/tcc/brief.ts` (line ~614-688)
- **Model:** claude-haiku-4-5
- **What it does:** Generates a 3-4 sentence morning coaching message using Tony's spiritual content and yesterday's performance
- **Prompt location:** Inline in the `/brief/spiritual-anchor` handler
- **To change:** Edit the system prompt to adjust tone, scripture references, or coaching style
- **Inputs:** Yesterday's calls, tasks completed, check-in data
- **Output:** 3-4 sentence motivational/spiritual message

### 8.4 Journal Formatting
- **File:** `artifacts/api-server/src/routes/tcc/journal.ts` (line ~50-80)
- **Model:** claude-sonnet-4-6
- **What it does:** Takes raw brain dump text and formats into structured journal entry (Mood, Key Events, Health Notes, Reflection, Cleaned Original)
- **Prompt location:** Inline prompt starting with "Format this journal entry"
- **To change:** Edit the output format template in the prompt
- **Inputs:** Raw text from voice/typing
- **Output:** Structured markdown journal entry

### 8.5 Email Classification (3-Tier Triage)
- **File:** `artifacts/api-server/src/routes/tcc/brief.ts` (line ~100-150)
- **Model:** claude-haiku-4-5
- **What it does:** Classifies inbox emails into Important/FYI/Promotions based on FlipIQ context
- **To change:** Edit the classification criteria in the system prompt

### 8.6 Email Brain Training
- **File:** `artifacts/api-server/src/routes/tcc/emails.ts` (line ~50-80)
- **Model:** claude-haiku-4-5
- **What it does:** Takes all thumbs up/down training data and generates "Tony's Email Priority Rules" in markdown
- **To change:** Training data is user-generated (can't change the algo, but can edit the generated rules in system_instructions)

### 8.7 Email Reply Suggestion
- **File:** `artifacts/api-server/src/routes/tcc/emails.ts` (line ~120-150)
- **Model:** claude-sonnet-4-6
- **What it does:** Drafts a reply in Tony's voice: direct, warm, action-oriented
- **Prompt:** "You are Tony Diaz's AI assistant. Draft professional, concise email replies in Tony's voice"
- **To change:** Edit the system prompt to change tone/style

### 8.8 Email Compose AI Draft
- **File:** `artifacts/api-server/src/routes/tcc/email-send.ts` (line ~80-100)
- **Model:** claude-haiku-4-5-20251001
- **What it does:** Generates email subject + body from context
- **Prompt:** "You are drafting emails on behalf of Tony Diaz, CEO of FlipIQ"
- **To change:** Edit the system prompt

### 8.9 Call Follow-Up Draft
- **File:** `artifacts/api-server/src/routes/tcc/calls.ts` (line ~50-70)
- **Model:** claude-haiku-4-5
- **What it does:** After a call attempt with no answer, drafts a 3-4 sentence follow-up email
- **Prompt:** "Tony Diaz (FlipIQ CEO) tried to call {name} but got no answer..."
- **To change:** Edit the prompt template

### 8.10 Idea Classification + Pushback
- **File:** `artifacts/api-server/src/routes/tcc/ideas.ts` (line ~100-200)
- **Model:** claude-haiku-4-5
- **What it does:** Classifies ideas (category, urgency, tech type), checks business fit against plan, provides pushback if off-strategy
- **To change:** Edit classification prompt and pushback criteria

### 8.11 Contact AI Scoring
- **File:** `artifacts/api-server/src/routes/tcc/contacts-score.ts`
- **NOT AI — purely rule-based.** Scores 0-100 based on: contact type (+5-25), comm volume, recency, status temperature, pipeline stage, weekly activity
- **To change:** Edit the scoring weights directly in the code

### 8.12 Contact AI Research
- **File:** `artifacts/api-server/src/routes/tcc/contacts-research.ts` (line ~60-100)
- **Model:** claude-sonnet-4-6 with `web_search_20250305` tool
- **What it does:** Searches the internet for LinkedIn, company info, news, personality notes
- **Prompt:** "Research this person for a sales call. Find their LinkedIn profile..."
- **To change:** Edit the research prompt to look for different info
- **Cost:** ~$0.15 per contact

### 8.13 Contact Pre-Call Brief
- **File:** `artifacts/api-server/src/routes/tcc/contacts-brief.ts` (line ~80-120)
- **Model:** claude-haiku-4-5-20251001
- **What it does:** Generates a scannable pre-call brief: Quick Summary, Communication Style, Personality Assessment, Key Action
- **To change:** Edit the section headers and instructions in the prompt

### 8.14 Business Card Scanner
- **File:** `artifacts/api-server/src/routes/tcc/contacts.ts` (line ~200-230)
- **Model:** claude-haiku-4-5-20251001 (vision)
- **What it does:** Takes a photo of a business card, extracts name, company, phone, email, etc.
- **To change:** Edit the extraction prompt

### 8.15 Full AI Chat (21 Tools)
- **File:** `artifacts/api-server/src/routes/tcc/claude.ts` (line 686-734)
- **Model:** claude-sonnet-4-6
- **What it does:** Tony's AI Chief of Staff. Can send emails, post to Slack, create tasks, search contacts, read calendar, analyze transcripts, etc.
- **System prompt location:** `buildSystemPrompt()` function (line ~667-734)
- **To change the AI's personality/rules:** Edit the system prompt in `buildSystemPrompt()`
- **To add/remove tools:** Edit the `TOOLS` array (line 14-268) and `executeTool()` function (line 271-664)
- **Tools available:** send_slack_message, create_linear_issue, send_email, get_email_brain, list_recent_emails, draft_gmail_reply, read_slack_channel, list_slack_channels, search_slack, get_today_calendar, create_calendar_event, get_meeting_history, log_meeting_context, analyze_transcript, send_eod_report, create_task, get_contact_brief, update_contact_stage, search_contacts, schedule_meeting, research_contact

### 8.16 Streaming Chat (18 Tools)
- **File:** `artifacts/api-server/src/routes/tcc/chat-threads.ts`
- **Model:** claude-sonnet-4-6 (chat), claude-haiku-4-5-20251001 (auto-title)
- **What it does:** Same as 8.15 but with SSE streaming and thread persistence
- **System prompt location:** Inline in the POST handler
- **Same editing approach as 8.15**

### 8.17 EOD Report Generation
- **File:** `artifacts/api-server/src/routes/tcc/eod.ts` (line ~100-200)
- **Model:** claude-sonnet-4-6
- **What it does:** Generates two reports: Tony's performance summary + Ethan's accountability brief
- **To change Tony's report:** Edit the "Tony's EOD" prompt
- **To change Ethan's report:** Edit the "Ethan's EOD" prompt

### 8.18 Task Priority Checking
- **File:** `artifacts/api-server/src/routes/tcc/tasks.ts`
- **Model:** claude-haiku-4-5
- **What it does:** Evaluates new task priority against existing queue
- **To change:** Edit the priority evaluation prompt

### 8.19 Schedule Scope Gatekeeper
- **File:** `artifacts/api-server/src/routes/tcc/schedule.ts`
- **Model:** claude-haiku-4-5
- **What it does:** Classifies meetings as Sales/CSM/COO/Other, warns if off-priority
- **To change:** Edit classification categories

### 8.20 AI Day Plan
- **File:** `artifacts/api-server/src/routes/tcc/schedule.ts`
- **Model:** claude-opus-4-5
- **What it does:** Generates a time-blocked daily schedule with coaching tips
- **To change:** Edit the day plan prompt

### 8.21 Demo Feedback Analysis
- **File:** `artifacts/api-server/src/lib/demo-feedback.ts`
- **Model:** claude-haiku-4-5
- **What it does:** Analyzes demo recordings for coaching: talk/listen ratio, questions, engagement, objections
- **To change:** Edit the analysis prompt

### 8.22 Plaud Recording Analysis
- **File:** `artifacts/api-server/src/lib/plaud-processor.ts`
- **Model:** claude-haiku-4-5
- **What it does:** Analyzes sales call recordings for interest level, objections, follow-up recommendations
- **To change:** Edit the analysis prompt and JSON schema

### 8.23 Scanned Sheet OCR
- **File:** `artifacts/api-server/src/routes/tcc/sheet-scan.ts`
- **Model:** claude-opus-4-5 (vision)
- **What it does:** Reads a photographed daily action sheet to extract checkboxes, call names, outcomes
- **To change:** Edit the vision prompt and JSON schema

### 8.24 90-Day Plan Summarization
- **File:** `artifacts/api-server/src/routes/tcc/sheets-sync.ts`
- **Model:** claude-haiku-4-5
- **What it does:** Summarizes the 90-day business plan for AI context window
- **To change:** Edit the summarization prompt

---

## 9. External Service Connections

### Google Workspace (via OAuth2 + Replit Connectors)
| Service | Library File | What TCC Does With It |
|---------|-------------|----------------------|
| **Gmail** | `lib/gmail.ts` | Read inbox, send emails, draft replies, search, get threads |
| **Google Calendar** | `lib/gcal.ts` | Read events, create events, create reminders, multi-day queries |
| **Google Drive** | `lib/google-drive.ts` | Browse folders, search files, read Docs, setup folder structure |
| **Google Docs** | `lib/google-docs.ts` | Append/prepend text, read full document |
| **Google Sheets** | `lib/google-sheets.ts` | Append rows, read ranges, update cells |
| **Google People** | via `contacts-autocomplete.ts` | Contact autocomplete from Google contacts |
| **Google Tasks** | `lib/gtasks.ts` | Create, complete, delete, list tasks |

### Google Sheet IDs (LOCKED — do not change)
| Sheet | ID | Tabs | Who Sees |
|-------|----|----|----------|
| Personal Check-in | `1rMLE_RhdRDsC2dqRs8eIiF6bySCAkMvy1k4JlHKkRMw` | Single tab | Tony only |
| Business Master | `1WGuJwCoWbwyFamXXP79yxnPmYhdFPgOGhOR8_V-EQyw` | Master Task List, Contact Master, Communication Log | Tony + Ethan + Ramy |
| Daily Journal Doc | `1kQjIFa903luN-62HkUD0tPGAmeQPC7JMN6rfnbvXYRE` | N/A (Google Doc) | Tony only |
| 90-Day Plan Doc | `1b1Ejf6Tim1gevq0BoMeV7XZ2KuXrgP2E` | N/A (Google Doc) | Team |
| Recordings Folder | `1g1itXWZj82oudTpMSp96HCoKk79_ZkdX` | N/A (Drive folder) | Tony |

### Slack (via Bot Token)
| Library | `lib/slack.ts` |
|---------|---------------|
| **Capabilities:** Post messages, read channel history, list channels, search messages, list users, DM users |
| **Scopes needed:** channels:history, groups:history, im:history, im:read, chat:write, channels:read, groups:read |
| **Used by:** claude.ts, chat-threads.ts, ideas.ts, schedule.ts, brief.ts |

### Linear (via Replit Connector + Direct SDK)
| Library | `lib/linear.ts` + `routes/tcc/linear.ts` |
|---------|------------------------------------------|
| **Capabilities:** Query issues (active + completed), list members, create issues, update issues |
| **Used by:** claude.ts, ideas.ts, tasks.ts, eod.ts, brief.ts |

### Anthropic Claude AI
| Library | `lib/integrations/anthropic-ai/` |
|---------|----------------------------------|
| **Models used:** claude-haiku-4-5 (quick), claude-haiku-4-5-20251001 (vision/quick), claude-sonnet-4-6 (main chat), claude-opus-4-5 (heavy: day plan, sheet scan) |
| **Features:** Tool use (21 tools), web search, vision (business cards, sheet scan), SSE streaming |

### MacroDroid (Android Phone Bridge)
| Integration | Via webhook HTTP calls |
|-------------|----------------------|
| **Inbound:** Phone calls and SMS are auto-logged to `/phone-log` webhook |
| **Outbound:** `/send-sms` triggers MacroDroid to send SMS from Tony's phone |
| **Env vars:** `MACRODROID_SECRET`, `MACRODROID_WEBHOOK_URL` |

### AgentMail (Replit Connector)
| Library | `lib/agentmail.ts` |
|---------|-------------------|
| **Used for:** Receiving scanned daily action sheet photos via email, then processing with AI Vision |

---

## 10. Environment Variables

All managed as Replit Secrets (no .env file in repo).

| Variable | Purpose | Where Used |
|----------|---------|-----------|
| `DATABASE_URL` | PostgreSQL connection string | `lib/db/src/index.ts` |
| `PORT` | Server port | `api-server/src/index.ts` |
| `FRONTEND_URL` | CORS origin | `api-server/src/app.ts` |
| `TCC_AUTH_TOKEN` | App access token | `middlewares/auth.ts` |
| `NODE_ENV` | dev/production | `lib/logger.ts` |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Claude API key | Anthropic integration |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Claude API base URL | Anthropic integration |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | `lib/google-auth.ts` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | `lib/google-auth.ts` |
| `GOOGLE_REFRESH_TOKEN` | Google OAuth refresh token | `lib/google-auth.ts` |
| `REPLIT_CONNECTORS_HOSTNAME` | Replit connector host | `lib/google-auth.ts` |
| `REPL_IDENTITY` | Replit identity | `lib/google-auth.ts` |
| `WEB_REPL_RENEWAL` | Replit renewal | `lib/google-auth.ts` |
| `SLACK_TOKEN` | Slack bot token (xoxb-) | `lib/slack.ts` |
| `LINEAR_TEAM_ID` | Linear team ID (optional) | `lib/linear.ts` |
| `MACRODROID_SECRET` | MacroDroid webhook auth | `phone-log.ts` |
| `MACRODROID_WEBHOOK_URL` | MacroDroid SMS trigger URL | `send-sms.ts` |
| `MEETING_RECORDINGS_FOLDER_ID` | Google Drive folder for recordings | `lib/demo-feedback.ts` |
| `CHECKIN_SHEET_ID` | Personal check-in Google Sheet | `sheets-sync.ts` |
| `BUSINESS_MASTER_SHEET_ID` | Business Master Google Sheet | `sheets-sync.ts` |
| `JOURNAL_DOC_ID` | Daily Journal Google Doc | `sheets-sync.ts` |
| `PLAN_90_DAY_ID` | 90-Day Plan Google Doc | `sheets-sync.ts` |

---

## 11. Frontend → Backend → API Connection Map

### How Data Flows: A Complete Example

**Tony opens the app in the morning:**

```
Browser loads App.tsx
  → GET /checkin/today (is today's check-in done?)
  → No → Show CheckinGate.tsx
    → Tony fills in sleep/Bible/workout
    → POST /checkin → Backend:
      1. Saves to checkins table
      2. Queries last 7 check-ins for patterns
      3. Detects sleep debt / missed Bible / late bedtime
      4. Returns patternAlerts[]
      5. Appends row to Google Sheet (Personal Check-in)
    → If workout/journal missed → POST /checkin/guilt-trip → Claude AI generates message
    → Tony completes → onComplete() fires

  → Show JournalGate.tsx
    → GET /brief/spiritual-anchor → Claude AI generates morning anchor
    → Tony types/voices brain dump
    → POST /journal → Backend:
      1. Claude AI formats raw text into structured entry
      2. Saves to journals table
      3. Updates checkins.journal = true
      4. Prepends to Google Doc (Daily Journal)
    → onComplete() fires

  → Show DashboardView.tsx
    → GET /brief/today → Backend:
      1. Fetches Gmail (unread, classifies Important/FYI/Promos)
      2. Fetches Google Calendar (today's events)
      3. Fetches Slack (#general, #sales, etc.)
      4. Fetches Linear (active issues)
      5. Enriches email senders with contact DB info
      6. Caches to daily_briefs table
      7. Returns DailyBrief object
    → App displays dashboard with all data
    → 15-min auto-refresh timer starts
    → 5-min email poll timer starts
    → 4:30 PM EOD timer starts
```

**Tony makes a sales call:**

```
SalesMorning.tsx or SalesView.tsx
  → Tony clicks phone icon → tel: link opens dialer
  → Tony clicks "Attempt" → AttemptModal.tsx
    → Tony types "left voicemail, send follow-up"
    → POST /calls → Backend:
      1. Saves to call_log table
      2. Claude AI drafts follow-up email
      3. Logs to communication_log table
      4. Updates contact_intelligence (total_calls++)
      5. Returns { followUpText }
    → Modal shows AI draft preview
    → Tony reviews and clicks "Send Follow-up"
    → POST /email/send → Gmail sends email
```

---

## 12. What Still Needs Work

### 4 Remaining PRD Gaps (as of April 5, 2026)

| # | Gap | Priority | File | Description |
|---|-----|----------|------|-------------|
| 1 | Bible engagement escalation | MEDIUM | `brief.ts` | Spiritual anchor should detect multi-day Bible misses and escalate tone |
| 2 | Contact brief-line on cards | MEDIUM | `sales-morning.ts` + `SalesMorning.tsx` | Show AI brief-line on contact cards (LEFT JOIN contact_briefs) |
| 3 | Meeting attendee brief | MEDIUM | `brief.ts` + `App.tsx` | Backend should populate attendeeBrief field for meeting warning banner |
| 4 | Separate Linear badge | LOW | `Header.tsx` | Linear items need their own badge/popover (currently accepted but not rendered) |

### AI Expansion Needed
The AI chat currently has 21 tools but is missing:
- Internet search (web_search, browse_url)
- Direct database queries (read-only SQL)
- Google Drive/Sheets/Docs reading
- Full email thread reading + search
- Calendar range queries + update/delete events
- Communication log reading
- Check-in history reading
- Business context reading

A Replit prompt has been prepared to add 17 new tools to make the AI fully unrestricted.

---

## 13. Testing Checklist

Use this checklist to verify every component is working correctly.

### Morning Sequence
- [ ] App loads, shows auth gate if no token
- [ ] Enter valid token → enters app
- [ ] If no check-in today → CheckinGate shows
- [ ] Fill in sleep (bed/wake), toggle Bible/workout/journal → Submit
- [ ] If workout OR journal missed → guilt-trip message appears (AI-generated)
- [ ] After submit → pattern alerts show (sleep debt, Bible streak, late bedtime)
- [ ] Check-in row appears in Personal Google Sheet
- [ ] Journal gate shows next → spiritual anchor loads (AI-generated)
- [ ] Type/voice brain dump → Save → AI formats entry
- [ ] Formatted journal prepended to Google Doc
- [ ] Dashboard loads with real data

### Dashboard
- [ ] Calendar timeline shows today's events
- [ ] Current time marker ("NOW") visible
- [ ] Tasks display from brief data, checkboxes toggle
- [ ] Important emails section shows
- [ ] Linear items display with status
- [ ] Sales contacts show with actions
- [ ] Auto-refresh fires every 15 minutes (check "Updated" timestamp)

### Emails
- [ ] 3 tiers display: Important, FYI, Promotions
- [ ] Clicking "Suggest Reply" opens EmailReplyModal → AI drafts reply
- [ ] Can edit reply, add notes, regenerate
- [ ] "Send Reply" sends via Gmail
- [ ] Snooze works (1h, 2h, tomorrow, next week, date picker)
- [ ] Thumbs up/down training logs to email_training table
- [ ] 5-min email poll fetches new emails
- [ ] Snoozed count shows in Header menu

### Sales
- [ ] SalesView shows all contacts with filters (status, stage, type, category)
- [ ] Search works
- [ ] Phone icon → opens dialer (tel: link)
- [ ] Text icon → SmsModal → sends via MacroDroid
- [ ] Email icon → EmailCompose modal
- [ ] "Attempt" → AttemptModal → AI drafts follow-up → can send
- [ ] "Connected" → ConnectedCallModal → logs outcome, next step, follow-up date
- [ ] ContactDrawer opens on row click → auto-saves on edit

### Sales Morning (3-Tier)
- [ ] Tier 1: Urgent Responses (inbound in last 48h)
- [ ] Tier 2: Follow-Ups Due Today
- [ ] Tier 3: Top 10 New (by AI score)
- [ ] Pipeline summary shows at top
- [ ] Batch "Score" button → scores selected contacts
- [ ] Batch "Research" button → shows cost check → runs AI research
- [ ] "Brief" button → generates AI pre-call brief
- [ ] Stage/status dropdowns work inline

### Tasks
- [ ] 90-day pillar filters work (Adaptation, Sales, Foundation, COO)
- [ ] Local tasks display, can check off
- [ ] "Work Note" modal → progress %, notes, next steps, Drive file picker
- [ ] Create task → AI priority check → pushback if low priority
- [ ] Google Tasks sync works
- [ ] Task alerts show (out-of-sequence, missing due dates)

### AI Chat
- [ ] Thread list loads in sidebar
- [ ] Create new thread → type message → response streams via SSE
- [ ] Tool usage shows in real-time ("Using: search contacts")
- [ ] Can delete threads
- [ ] Context-aware threads work (open from contact, email)

### Schedule
- [ ] Full-day timeline with events
- [ ] Add event wizard → guest autocomplete → category selection
- [ ] Guilt trip if scheduling during call hours without enough calls
- [ ] Scope gatekeeper warns on non-sales events
- [ ] Join Meet button for video calls

### Ideas
- [ ] Type idea → AI classifies (category, urgency, tech type, business fit)
- [ ] Pushback if off-strategy → can override or park
- [ ] Team assignment → notify via email/Slack
- [ ] Escalate to Ethan flow works

### EOD Report
- [ ] Click "Send EOD Report" in Header menu
- [ ] Preview generates (AI-written)
- [ ] Can edit preview text
- [ ] Send → emails Tony + Ethan
- [ ] Auto-EOD fires at 4:30 PM Pacific (check server logs)
- [ ] "EOD Sent ✓" shows green in menu after sent

### Google Sheets Sync
- [ ] Business Master Sheet has 3 tabs: Master Task List, Contact Master, Communication Log
- [ ] Auto-sync runs every 5 minutes (check sheet timestamps)
- [ ] Data matches what's in the app

### Phone Integration
- [ ] MacroDroid POST to /phone-log logs calls
- [ ] Auto-matches phone numbers to contacts
- [ ] SMS logging works both directions

### Header & Navigation
- [ ] Hamburger menu opens with all items
- [ ] Slack bell shows with count
- [ ] Slack popover shows message previews
- [ ] Meeting warning banner shows 5 min before meeting
- [ ] "Join" button for video meetings
- [ ] Refresh button works, "Updated" timestamp updates
- [ ] Print Daily Sheet generates printable view

### Voice Input
- [ ] Microphone button appears on: journal, check-in fields, idea input, email compose (to/subject/body), email reply, call notes, connected call outcome, task creation, SMS compose, Claude chat
- [ ] Speech-to-text works (browser must support Web Speech API)

---

## 14. File Index

### Frontend (artifacts/tcc/src/)
| File | Lines | Purpose |
|------|-------|---------|
| `App.tsx` | ~637 | Main app shell, routing, global state |
| `main.tsx` | ~10 | React root mount |
| `lib/api.ts` | ~40 | API client (fetch wrapper with auth) |
| `lib/utils.ts` | ~5 | Tailwind cn() utility |
| `components/tcc/constants.ts` | ~100 | Design tokens, business constants |
| `components/tcc/types.ts` | ~80 | All TypeScript interfaces |
| `components/tcc/AuthGate.tsx` | ~60 | Token login |
| `components/tcc/ErrorBoundary.tsx` | ~30 | Error screen |
| `components/tcc/FontLink.tsx` | ~10 | Google Fonts |
| `components/tcc/Header.tsx` | ~497 | Top bar, menu, Slack bell, EOD modal |
| `components/tcc/CheckinGate.tsx` | ~301 | Morning check-in form |
| `components/tcc/JournalGate.tsx` | ~94 | Journal brain dump |
| `components/tcc/DashboardView.tsx` | ~1100 | Main dashboard |
| `components/tcc/EmailsView.tsx` | ~421 | Email triage |
| `components/tcc/EmailCompose.tsx` | ~296 | Compose email |
| `components/tcc/EmailReplyModal.tsx` | ~407 | Reply to email |
| `components/tcc/ScheduleView.tsx` | ~421 | Calendar view |
| `components/tcc/AddScheduleItemWizard.tsx` | ~530 | Add calendar event |
| `components/tcc/SalesView.tsx` | ~347 | CRM contact list |
| `components/tcc/SalesMorning.tsx` | ~411 | 3-tier morning view |
| `components/tcc/ContactDrawer.tsx` | ~500 | Contact detail panel |
| `components/tcc/AddContactModal.tsx` | ~290 | Add contact form |
| `components/tcc/ConnectedCallModal.tsx` | ~161 | Connected call logging |
| `components/tcc/AttemptModal.tsx` | ~107 | Call attempt logging |
| `components/tcc/TasksView.tsx` | ~550 | Task management |
| `components/tcc/CreateTaskModal.tsx` | ~350 | Create task with priority check |
| `components/tcc/ClaudeChatView.tsx` | ~395 | Threaded AI chat |
| `components/tcc/ClaudeModal.tsx` | ~49 | Simple AI prompt |
| `components/tcc/IdeasModal.tsx` | ~595 | Idea capture wizard |
| `components/tcc/PrintView.tsx` | ~900 | Printable daily sheet |
| `components/tcc/CalendarSidebar.tsx` | ~157 | Calendar sidebar |
| `components/tcc/VoiceField.tsx` | ~50 | Input with mic |
| `components/tcc/VoiceInput.tsx` | ~40 | Standalone mic button |
| `components/tcc/SmartTip.tsx` | ~80 | Editable tooltip |
| `components/tcc/Tip.tsx` | ~20 | Simple tooltip |
| `components/tcc/DeepLink.tsx` | ~30 | External app links |
| `components/tcc/HoverCard.tsx` | ~102 | Key-value hover tooltip |
| `components/tcc/TimeRoutingBanner.tsx` | ~60 | Time block indicator |
| `components/tcc/SmsModal.tsx` | ~93 | SMS compose |

### Backend Routes (artifacts/api-server/src/routes/tcc/)
| File | Endpoints | Purpose |
|------|-----------|---------|
| `auth.ts` | 1 | Token verification |
| `checkin.ts` | 3 | Morning check-in + guilt trip |
| `journal.ts` | 2 | Journal save + retrieve |
| `brief.ts` | 3 | Morning brief + spiritual anchor |
| `emails.ts` | 3 | Email brain, snooze, actions |
| `email-poll.ts` | 1 | Gmail polling |
| `email-send.ts` | 3 | Email send, signature, AI draft |
| `contacts.ts` | 8 | Contact CRUD + card scanner |
| `contacts-autocomplete.ts` | 2 | Google People autocomplete |
| `contacts-score.ts` | 1 | Contact scoring |
| `contacts-research.ts` | 2 | AI web research |
| `contacts-brief.ts` | 2 | Pre-call briefs |
| `sales-morning.ts` | 4 | 3-tier morning view + updates |
| `calls.ts` | 3 | Call logging + AI follow-up |
| `phone-log.ts` | 4 | MacroDroid webhook + logs |
| `send-sms.ts` | 1 | SMS via MacroDroid |
| `tasks.ts` | 13 | Full task management |
| `claude.ts` | 1 | Single-turn AI (21 tools) |
| `chat-threads.ts` | 5 | Streaming AI chat |
| `schedule.ts` | 2 | Smart scheduling + AI day plan |
| `ideas.ts` | 6 | Ideas + classification + assign |
| `eod.ts` | 4 | EOD reports |
| `sheets-sync.ts` | 5 | Google Sheets sync |
| `sheet-scan.ts` | 2 | Scanned sheet OCR |
| `drive.ts` | 3 | Google Drive browser |
| `linear.ts` | 7 | Linear API proxy |
| `communication-log.ts` | 3 | Comm log queries |
| `meeting-history.ts` | 3 | Meeting records |
| `system-instructions.ts` | 2 | Config CRUD |
| `time-routing.ts` | 1 | Current time block |
| `demos.ts` | 3 | Demo counting |
| `notes-scratch.ts` | 4 | Scratch notes |
| `demo-feedback.ts` | 1 | Demo feedback scan |

### Backend Libraries (artifacts/api-server/src/lib/)
| File | Purpose |
|------|---------|
| `google-auth.ts` | Google OAuth2 + Replit Connectors |
| `gmail.ts` | Gmail API wrapper |
| `gcal.ts` | Google Calendar wrapper |
| `gtasks.ts` | Google Tasks wrapper |
| `google-drive.ts` | Google Drive wrapper |
| `google-docs.ts` | Google Docs wrapper |
| `google-sheets.ts` | Google Sheets wrapper |
| `slack.ts` | Slack API wrapper |
| `linear.ts` | Linear GraphQL wrapper |
| `agentmail.ts` | AgentMail wrapper |
| `contact-comms.ts` | Comm counter updater |
| `dates.ts` | Pacific timezone helper |
| `demo-feedback.ts` | Demo recording analyzer |
| `plaud-processor.ts` | Plaud recording analyzer |
| `logger.ts` | Pino logger config |
| `schema-v2.ts` | V2 schema re-exports |

### Database Schema (lib/db/src/schema/)
| File | Tables |
|------|--------|
| `tcc.ts` | 16 tables (checkins, journals, contacts, call_log, etc.) |
| `tcc-v2.ts` | 11 tables (contact_intelligence, communication_log, chat_threads, etc.) |

---

*This document was generated from a complete code audit of 69 files (27 frontend, 25 routes, 15 libs, 2 schemas) on April 5, 2026. For questions, refer to the GitHub repo or the live app.*

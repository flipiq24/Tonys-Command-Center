# Tony's Command Center — Product Requirements Document

**Owner**: Tony Diaz, CEO FlipIQ  
**Last Updated**: April 2026  
**Purpose**: Full-stack personal daily operating system. One screen, one focus, zero context-switching.

---

## North Star

> 2 deals/month/AA at $2,500 per acquisition. Every system decision serves this number.

---

## Core Philosophy

- **ADHD-first UX**: One view at a time. No multi-panel chaos. Sequential flow.
- **Paper + Digital**: Daily Action Sheet prints and scans back in. No data entry friction.
- **Live data always**: No stale snapshots. Real Gmail, Calendar, Linear, Slack.
- **System updates itself**: EOD auto-generates, scanned sheets auto-update DB.

---

## Daily Flow (Sequential Gates)

```
Morning Check-in → Journal → [Dashboard] → Emails / Sales / Tasks / Chat
```

| Step | View | Purpose |
|------|------|---------|
| 1 | Check-In | Gate. Sleep/habits logged to DB. Required once per day. |
| 2 | Journal | Brain dump. Claude formats: Mood / Events / Reflection. |
| 3 | Dashboard | Live FlipIQ Daily Action Sheet. Sales calls, Top 3, emails, schedule. |
| 4 | Emails | Priority inbox with reply/snooze/thumbs training. |
| 5 | Sales Morning | 3-tier: Urgent (48h) → Follow-Ups Due → Top 10 New. AI score/research/brief. |
| 6 | Tasks | Task checklist + 90 Day Focus pillars. |
| 7 | Chat | Full-screen Claude with persistent threads. Context from any view. |

---

## Features

### Dashboard (Home)
- **Sales Calls — 10 Today**: Live contacts sorted by priority (Hot/Warm/New). ✓ checkboxes.
- **Top 3 — Do These First**: Highest-priority uncompleted tasks from DB.
- **Slack Mentions**: Red/amber bell badge, cross-referenced with Linear tasks.
- **Priority Emails**: Compact 5-column table (FROM/SUBJECT/WHY/ACTION).
- **Schedule**: Day timeline with "NOW" indicator, real calendar events.
- **Hover popover**: Email thread preview on row hover.

### Print Sheet (Daily Action Sheet)
**Front page:**
1. 📞 Sales Calls — 10 Today (full-width table, OUTCOME/NOTES column for handwriting)
2. ★ Top 3 — Do These First (each with a handwriting notes line)
3. 📅 Appointments | ✏ Additional Tasks (side-by-side)
4. Scan footer: inbox email, instructions

**Back page:**
- ⚡ Linear Engineering Issues (with owner and priority)
- ⚠ Flags & Blockers | Soft Sequence
- 📧 Priority Emails | 💬 Slack Attention
- 📝 Scratch Notes (22 lined rows)
- 🏆 3 Wins for Today

### Scan-to-Update (Paper → Digital)
1. Tony fills and signs the sheet by hand
2. Photos it → emails to AgentMail inbox (shown on sheet footer)
3. Clicks "📷 Process Scanned Sheet" in TCC
4. Claude Vision reads photo: identifies checked boxes + handwritten notes
5. Auto-updates DB: call outcomes → `call_log`, checked tasks → `task_completions`

### Sales Morning (3-Tier)
- **Tier 1 — Urgent**: Contacts who replied to outreach within 48h. Must respond today.
- **Tier 2 — Follow-Ups**: Contacts with follow-up date = today or overdue.
- **Tier 3 — Top 10 New**: AI-scored pipeline candidates. Batch score / research / brief.
- Inline status/stage updates. Pre-call brief generation via Claude + web research.

### Ideas Parking Lot
- Claude instantly classifies idea (category, urgency, ROI, risk)
- Business context from `business_context` table gives Claude grounding
- Assign to team member (from Linear + Slack roster)
- Notify via Email + Slack for "Now" urgency ("Post and Deliver")
- "Park It" for non-urgent ideas

### Claude Chat (17 Tools)
- Persistent threads with sidebar navigation
- SSE streaming responses
- Tools: email, calendar, contacts, Slack, tasks, Linear issues, EOD, CRM, SMS, notes, etc.
- Can be opened with contact context from Sales view

### EOD Report
- Auto-fires at 4:30 PM Pacific (guarded against duplicates)
- Pulls: completed tasks, calls logged, emails handled, Linear closed, Slack sent
- Sends via AgentMail to tony@flipiq.com + ethan@flipiq.com

---

## Data Model

| Table | Purpose |
|-------|---------|
| `contacts` | 3,396 sales contacts (status, stage, deal value, LinkedIn) |
| `contact_notes` | Timestamped notes per contact |
| `call_log` | Every outbound/inbound call logged (including scanned sheets) |
| `task_completions` | Checked tasks with source (manual, scan, AI) |
| `ideas` | Ideas with classification + assignee |
| `checkins` | Daily morning check-in data |
| `journals` | Journal entries + AI-formatted output |
| `email_training` | Thumbs up/down training data for email prioritization |
| `daily_briefs` | Cached morning brief (calendar, emails, tasks, slack, linear) |
| `communication_log` | Unified log of ALL comms (email/call/SMS/meeting) |
| `contact_intelligence` | AI scores, stage, next actions, comm summaries |
| `business_context` | AI-queryable docs (90-day plan, etc.) |
| `chat_threads` / `chat_messages` | Claude persistent chat |
| `phone_log` | MacroDroid bridge: calls/SMS from Android |
| `eod_reports` | End-of-day report storage |

---

## Integrations

| Service | Purpose |
|---------|---------|
| **Gmail** | Live email inbox, send/reply, People API autocomplete |
| **Google Calendar** | Real-time schedule, meeting creation |
| **Linear** | Engineering issue tracking, sprint board |
| **Slack** | Team comms, Claude can read/write, idea alerts |
| **AgentMail** | EOD reports outbound + scanned sheet inbound |
| **MacroDroid** | Android bridge: log calls/SMS, trigger outbound SMS |
| **Anthropic Claude** | AI brain: classify, draft, research, score, chat |
| **Google Drive/Sheets/Docs** | 90-day plan ingestion, check-in appends |

---

## 90-Day Focus Pillars

| # | Pillar | Description |
|---|--------|-------------|
| 01 | Adaptation | Systems, processes & team alignment |
| 02 | Sales | Pipeline growth & 10-call daily cadence |
| 03 | Foundation | Data integrity, infra & FlipIQ core |
| 04 | COO Dashboard | Ethan & Ramy accountability loop |

---

## Color System

```typescript
C = { bg, card, brd, tx, sub, mut, red, grn, amb, blu, redBg, grnBg, ambBg, bluBg }
// Red ONLY for urgent/important. White/black/gray throughout. No colored badges.
```

---

## Auth

Session-based auth token stored in `sessionStorage` under `tcc_auth_token`.  
Sent as `x-tcc-token` header on every API request.

---

## Key Routes

| Route | Description |
|-------|-------------|
| `GET /api/brief/today` | Morning brief (all live data) |
| `GET /api/sheet-scan/inbox` | AgentMail inbox email for sheet returns |
| `POST /api/sheet-scan/process` | Process scanned sheet photo → update DB |
| `GET /api/sales/morning` | 3-tier sales morning data |
| `GET /api/contacts` | CRM contacts (filter/search/paginate) |
| `POST /api/ideas` | Classify + save idea |
| `POST /api/claude` | Claude agentic loop (17 tools, SSE) |
| `POST /api/eod-report` | Generate + send EOD report |
| `POST /api/phone-log` | MacroDroid phone webhook |

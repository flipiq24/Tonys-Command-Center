# Tony's Command Center (TCC)

A full-stack personal daily operating system for Tony Diaz, CEO of FlipIQ.

## Architecture

**Monorepo** (pnpm workspaces):
- `artifacts/tcc/` — React + Vite frontend (previewPath: `/`)
- `artifacts/api-server/` — Express 5 backend (port 8080)
- `lib/db/` — Drizzle ORM + PostgreSQL schema
- `lib/api-spec/` — OpenAPI 3.1 spec + orval codegen
- `lib/api-zod/` — Generated Zod validators (from orval)
- `lib/api-client-react/` — Generated React Query hooks (from orval)
- `lib/integrations-anthropic-ai/` — Anthropic AI client (via Replit AI Integrations proxy)

## Database

**Replit PostgreSQL** (DATABASE_URL env var)

**Core tables** (`lib/db/src/schema/tcc.ts`):
- `checkins` — Daily morning check-in data (sleep, habits)
- `journals` — Journal entries + AI-formatted output
- `ideas` — Ideas parking lot with priority
- `contacts` — Sales CRM contacts (status, pipeline stage, deal value, lead source, title, LinkedIn, website, tags)
- `contact_notes` — Timestamped notes per contact
- `call_log` — Sales call tracking
- `email_training` — Email thumbs up/down training data
- `daily_briefs` — Cached morning brief data
- `task_completions` — Task completion tracking
- `demos` — Demo count per day
- `eod_reports` — End-of-day reports
- `phone_log` — Phone call/SMS log from MacroDroid
- `task_work_notes` — Work notes per task (v2)

**v2 tables** (`lib/db/src/schema/tcc-v2.ts`):
- `communication_log` — Unified log of ALL communications (email/call/SMS/meeting)
- `contact_intelligence` — AI scores, stage, next actions, comm summaries per contact
- `contact_briefs` — Cached pre-call briefing documents per contact
- `business_context` — AI-queryable business documents (90-day plan, etc.)
- `daily_suggestions` — AI daily workflow suggestions
- `chat_threads` — Claude chat thread metadata
- `chat_messages` — Claude chat messages per thread
- `task_work_notes` — Task working notes

## Print Sheet + Scan-to-Update Workflow

**Daily Action Sheet** — printable 2-page document (front + back) generated from live TCC data:
- **Front page**: Sales Calls 10 Today (full-width, OUTCOME/NOTES column for handwriting) → Top 3 → Appointments + Additional Tasks
- **Back page**: Linear issues, Flags & Blockers, Priority Emails, Slack, Scratch Notes, 3 Wins

**Scan-to-Update** — closed-loop paper → digital flow:
1. Tony prints, fills out sheet by hand (checks boxes, writes call outcomes/notes)
2. Takes a photo, emails it to the TCC AgentMail inbox (shown in footer of printed sheet)
3. Clicks "📷 Process Scanned Sheet" in the print toolbar (or triggers automatically)
4. Claude Vision reads the photo, identifies checked boxes and handwritten notes
5. System updates: completed calls logged to `call_log` table, checked top-3 tasks logged to `task_completions`

**Routes**: `GET /api/sheet-scan/inbox`, `POST /api/sheet-scan/process`
**File**: `artifacts/api-server/src/routes/tcc/sheet-scan.ts`

## API Routes

All routes under `/api/` (defined in `artifacts/api-server/src/routes/`):

| Route | Description |
|-------|-------------|
| `GET /api/healthz` | Health check |
| `GET/POST /api/checkin` | Daily check-in |
| `GET/POST /api/journal` | Journal entry |
| `GET /api/brief/today` | Morning brief (calendar, emails, tasks, slack, linear) |
| `POST /api/emails/action` | Email actions (snooze, suggest_reply, thumbs) |
| `GET /api/emails/poll` | Poll Gmail for new received emails |
| `POST /api/emails/send` | Send email via Gmail OAuth |
| `GET /api/contacts` | Sales contacts (filter: status, stage, search, pagination) |
| `GET /api/contacts/:id` | Single contact with notes + call history |
| `POST /api/contacts` | Create contact |
| `PATCH /api/contacts/:id` | Update contact fields |
| `DELETE /api/contacts/:id` | Delete contact |
| `GET/POST /api/contacts/:id/notes` | Contact notes |
| `GET /api/contacts/autocomplete` | Gmail People API autocomplete |
| `GET/POST /api/calls` | Call log |
| `POST /api/calls/connected-outcome` | Log connected call outcome, draft follow-up |
| `GET/POST /api/ideas` | Ideas parking lot + Claude classifier (w/ business_context) |
| `POST /api/ideas/classify` | Pre-classify idea without saving |
| `POST /api/claude` | Claude AI proxy (8 tools, agentic loop) |
| `GET/POST /api/demos/count|increment|decrement` | Demo counter |
| `GET/POST /api/tasks/completed` | Task tracking |
| `POST /api/eod-report` | Manual EOD report generation + send |
| `POST /api/eod-report/auto` | Auto-EOD (guarded, once per day) |
| `GET /api/eod-report/today` | Retrieve today's EOD report |
| `GET /api/system-instructions` | Get all system instructions |
| `POST /api/system-instructions` | Upsert a system instruction |
| `POST /api/phone-log` | MacroDroid phone webhook (calls/SMS) |
| `POST /api/send-sms` | Send SMS via MacroDroid |
| `GET /api/time-routing` | Current time-of-day routing |
| `GET /api/meeting-history` | Meeting history |
| `GET /api/communication-log` | Unified communication log |
| `GET/POST /api/chat/threads` | Claude chat threads |
| `DELETE /api/chat/threads/:id` | Delete chat thread |
| `GET /api/chat/threads/:id/messages` | Messages for a thread |
| `POST /api/chat/threads/:id/messages` | Send message (SSE streaming) |
| `GET /api/sales/morning` | 3-tier morning sales data (urgent/followups/top10) |
| `POST /api/contacts/score` | Batch AI score contacts |
| `POST /api/contacts/research` | Batch AI research contacts (web search) |
| `POST /api/contacts/research/check` | Pre-check research cost/count |
| `POST /api/contacts/brief` | Generate pre-call brief for a contact |
| `POST /api/sheets/checkin-append` | Append check-in row to Google Sheet |
| `POST /api/sheets/ingest-90-day-plan` | Ingest 90-Day Plan doc into business_context |
| `GET /api/business-context` | Retrieve all business context documents |
| `POST /api/business-context` | Upsert a business context document |
| `GET /api/sheet-scan/inbox` | Returns AgentMail inbox email for scanned sheet returns |
| `POST /api/sheet-scan/process` | Process scanned daily sheet photo → Claude Vision → update DB |

## Frontend Flow (Sequential)

1. **Morning Check-in** — Gate. Saves to DB. Goes away once done.
2. **Journal** — Brain dump. Claude formats it (Mood, Events, Reflection).
3. **Emails** — Important emails with reply/snooze/thumbs. FYI section.
4. **Schedule** — Today's calendar items with live "NOW" timeline indicator. Entry to Sales or Tasks.
5. **Sales Morning** — 3-tier view: Urgent Responses (48h), Follow-Ups Due, Top 10 New. Batch score/research/brief actions. Stage/status inline updates.
6. **Tasks** — Task checklist. Toggle between Sales/Tasks modes.
7. **Claude Chat** — Full-screen AI chat with persistent threads. Can open with contact context.

## View Types
```typescript
type View = "checkin" | "journal" | "emails" | "schedule" | "sales" | "tasks" | "chat";
```

## AI Integration

- Uses Replit AI Integrations Anthropic proxy (no direct API key needed)
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` and `AI_INTEGRATIONS_ANTHROPIC_API_KEY` env vars set
- Model: `claude-sonnet-4-6` (main chat, EOD), `claude-haiku-4-5` (quick tasks, scoring)
- System prompt: Tony Diaz persona (FlipIQ, ADHD-aware, sales-first)
- **Chat Threads**: 17-tool SSE streaming agentic loop (email, calendar, contacts, Slack, tasks, etc.)
- **Ideas pushback**: Business context from `business_context` table injected into idea classifier
- **Auto-EOD**: Fires at 4:30 PM Pacific, guarded against duplicates

## Key Design Decisions

- Sequential one-view-at-a-time UX (no multi-panel) — matches Tony's ADHD-friendly workflow
- All state persists to DB (not localStorage) — resume where Tony left off on reload
- Calendar sidebar is the only floating panel (collapsible)
- **Communication Log**: Every email, call, and SMS mirrored to `communication_log` table and `contact_intelligence` updated
- **3-Tier Sales Morning**: Urgent (48h replies) → Follow-Ups (due today/overdue) → Top 10 New (AI-scored)
- **Claude Chat**: Full persistent threads with SSE streaming, thread sidebar, context from any view

## External Integrations

- **Slack**: `SLACK_TOKEN` secret. Used for Claude tools (send, read, search) and Tech idea alerts.
- **MacroDroid (Android phone bridge)**: `MACRODROID_SECRET` and `MACRODROID_WEBHOOK_URL` secrets. Webhook receives call/SMS logs, triggers outbound SMS.
- **AgentMail**: Connected via Replit connector. EOD reports sent to tony@flipiq.com and ethan@flipiq.com.
- **Google Calendar**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` secrets. Live calendar events in brief. Create reminders from connected calls.
- **Gmail**: Same Google OAuth credentials. Send/read emails, poll inbox, contacts autocomplete.
- **Google Drive/Sheets/Docs**: Same Google OAuth. `lib/google-drive.ts`, `lib/google-sheets.ts`, `lib/google-docs.ts` helpers. Check-in appends to Sheet, 90-Day Plan ingested to business_context.
- **Linear**: Replit connector. Tech ideas auto-create Linear issues. Brief fetches open issues.

## Google OAuth Libraries (`artifacts/api-server/src/lib/`)
- `google-auth.ts`: `getGoogleAuth()`, `getGmail()`, `getCalendar()`, `getDrive()`, `getSheets()`, `getPeople()`, `getDocs()`
- `google-sheets.ts`: `appendToSheet()`, `getSheetValues()`, `updateCell()`
- `google-docs.ts`: `appendToDoc()`, `getDocText()`
- `google-drive.ts`: `createFolderIfNotExists()`, `searchFiles()`, `readGoogleDoc()`, `listDriveFiles()`

## Color Constants (frontend)
```typescript
C = { bg, card, brd, tx, sub, mut, red, grn, amb, blu, redBg, grnBg, ambBg, bluBg }
// NO C.txt (use C.tx), NO C.acc (use C.blu)
```

## View Persistence

Tony resumes exactly where he left off on page refresh. The `active_view` key is stored in `system_instructions` table and restored on boot. Gates (checkin, journal) are always re-evaluated from DB records.

## Contacts DB

3,396 contacts total (3,381 imported + 15 seed). Import script: `lib/db/import-contacts.mjs`. Contacts API supports `?search=`, `?limit=`, `?offset=` with Hot→Warm→New priority ordering.

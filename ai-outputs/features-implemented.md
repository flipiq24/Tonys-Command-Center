# Features Implemented — Sprint Session (April 15, 2026)

## Workflow
- Implement features one by one
- Document each feature here with: files changed, ideal behavior
- Commit & push after each feature
- Testing phase comes AFTER all features are implemented

---

## Feature 1: New Email Alert Banner + Manual Reclassify
**Status:** Implemented
**Files Changed:**
- `artifacts/tcc/src/App.tsx` — Added `newEmailCount`, `pendingNewEmails`, `reclassifying` state. Modified email poll to capture new email data. Added `handleReclassify()` and `dismissNewEmails()`. Renders blue banner on Dashboard and Emails views.
- `artifacts/api-server/src/routes/tcc/email-poll.ts` — Added `POST /emails/reclassify-new` endpoint. Uses Claude Haiku to classify only the new emails, merges results into existing `daily_briefs` cache in DB.

**Ideal Behavior:**
1. Email poll runs every 5 minutes, checks Gmail for new unread emails
2. If new emails found → blue banner appears: "N new email(s) arrived"
3. "Classify & Update" button → sends ONLY new emails to Claude Haiku → classifies into important/fyi/promotions → merges into existing cached brief (new emails appear at TOP) → banner disappears
4. "Dismiss" button → hides banner, clears pending emails
5. No auto-reclassify (saves API cost) — user controls when to classify
6. Banner shows on Dashboard and Emails views only
7. Classification result is persisted in `daily_briefs` table so it survives page refresh

**API Endpoint:** `POST /emails/reclassify-new`
- Input: `{ newEmails: [{ from, subject, snippet, messageId }] }`
- Output: `{ ok, added, emailsImportant, emailsFyi, emailsPromotions }`

---

## Feature 2: Dashboard Calendar Shows ALL Events
**Status:** Implemented
**Files Changed:**
- `artifacts/tcc/src/components/tcc/DashboardView.tsx` — Removed `filter(c => c.real)` from both the meetings variable (line 593) and DayTimeline prop (line 637). Now passes ALL calendar events including solo blocks.

**Ideal Behavior:**
- Dashboard timeline strip shows ALL 24+ events from Google Calendar, not just meetings with 2+ attendees
- Same events visible in both Dashboard view and Schedule (detail) view
- Solo calendar blocks (call reminders, personal blocks) are now visible on dashboard
- Events display smaller/compressed to fit more in the strip

---

## Feature 3: Force Pacific Timezone Everywhere + PT Label
**Status:** Implemented
**Files Changed:**
- `artifacts/tcc/src/components/tcc/Header.tsx` — Added " PT" suffix after clock display
- `artifacts/tcc/src/components/tcc/DashboardView.tsx` — Added `timeZone: "America/Los_Angeles"` to DATE_STR
- `artifacts/tcc/src/components/tcc/PrintView.tsx` — Added `timeZone: "America/Los_Angeles"` to DATE_STR
- `artifacts/tcc/src/components/tcc/CheckinGate.tsx` — Added `timeZone: "America/Los_Angeles"` to clock
- `artifacts/tcc/src/components/tcc/ClaudeChatView.tsx` — Added `timeZone: "America/Los_Angeles"` to thread timestamps
- `artifacts/tcc/src/components/tcc/ContactDrawer.tsx` — Added `timeZone: "America/Los_Angeles"` to 4 timestamp displays (notes, calls, comms, activity)
- `artifacts/tcc/src/components/tcc/SalesView.tsx` — Added `timeZone: "America/Los_Angeles"` to 2 call time displays

**Ideal Behavior:**
- No matter where the user logs in from (Pakistan, California, anywhere), all times show in Pacific Time
- Header shows time with "PT" suffix, e.g. "Tuesday, April 15, 2026 · 7:28 PM PT"
- All timestamps in ContactDrawer, SalesView, ClaudeChat, CheckinGate, PrintView use Pacific
- Calendar events correctly align with Tony's California schedule

---

## Feature 4: Ideas → Auto-Create Task via AI
**Status:** Implemented
**Files Changed:**
- `artifacts/api-server/src/routes/tcc/ideas.ts` — Added `POST /ideas/generate-task` endpoint. Takes ideaText, category, urgency, techType → sends to Claude Haiku with full category/subcategory/owner/priority schema → returns structured task fields. Auto-maps urgency to due date (Now=today, This Week=Friday, This Month=end of month). Source always set to "TCC".
- `artifacts/tcc/src/App.tsx` — Modified IdeasModal `onSave` callback. After saving idea, calls `/ideas/generate-task`, then navigates to Business Brain Master Task tab, dispatches `tcc:prefill-task` CustomEvent with AI-generated fields.
- `artifacts/tcc/src/components/tcc/BusinessView.tsx` — MasterTaskTab now listens for `tcc:prefill-task` event, stores prefill data, auto-opens AddTaskModal. AddTaskModal accepts new `prefill` prop and initializes form fields from it.

**Ideal Behavior:**
1. User submits idea in IdeasModal
2. AI classifies idea (existing flow)
3. User reviews classification, optionally overrides
4. User approves/saves the idea (existing flow — notifications sent)
5. **NEW**: After save, AI generates structured task fields (title, category, subcategory, owner, priority, executionTier, atomicKpi, dueDate, weekNumber, workNotes)
6. App navigates to Business Brain → Master Task tab
7. AddTaskModal opens pre-filled with AI-generated fields
8. User can review/edit any field before final "Add task & place in 411 plan"
9. If user accepts, task is created in planItemsTable with proper placement

**API Endpoint:** `POST /ideas/generate-task`
- Input: `{ ideaText, category, urgency, techType? }`
- Output: `{ ok, taskFields: { title, category, subcategoryName, owner, priority, executionTier, atomicKpi, source, workNotes, weekNumber, dueDate } }`

---

## Feature 5: Check-in & Journal — Fix Google Sync + Add Row/URL Tracking
**Status:** Implemented
**Files Changed:**
- `lib/db/src/schema/tcc.ts` — Added `sheetRowNumber` (integer) to checkinsTable, `docsPageUrl` (text) to journalsTable
- `artifacts/api-server/src/lib/google-sheets.ts` — Added `upsertSheetRow()` function: finds row by column A value (date), updates if exists, appends if new. Returns 1-based row number.
- `artifacts/api-server/src/routes/tcc/checkin.ts` — Replaced `appendToSheet` with `upsertSheetRow`. Saves row number to DB after sheet write. No more duplicate rows on edit.
- `artifacts/api-server/src/routes/tcc/journal.ts` — Added check for existing journal before upsert. Only prepends to Google Doc on FIRST entry (skips on edits). Saves docsPageUrl to DB after Doc write.
- Database: Added columns via SQL `ALTER TABLE checkins ADD COLUMN sheet_row_number INTEGER` and `ALTER TABLE journals ADD COLUMN docs_page_url TEXT`

**Ideal Behavior:**
1. **Check-in first submit** → inserts row in Google Sheet + DB, saves sheet row number
2. **Check-in edit** → finds existing row by date in Sheet, updates in-place (no new row), updates DB
3. **Journal first submit** → AI formats, saves to DB, prepends to Google Doc, saves docs URL
4. **Journal edit** → updates DB only, does NOT prepend duplicate to Google Doc
5. `sheetRowNumber` in DB tells which row in Google Sheet has this check-in
6. `docsPageUrl` in DB provides direct link to the journal Google Doc

---

## Feature 6: Fix Sidebar Menu Hidden Behind Business Brain Pages
**Status:** Implemented
**Files Changed:**
- `artifacts/tcc/src/components/tcc/Header.tsx` — Changed menu dropdown from `position: absolute` with `zIndex: 200` to `position: fixed` with `zIndex: 9999`. Fixed top/right positioning to anchor below header.

**Ideal Behavior:**
- Sidebar hamburger menu always renders on top of ALL page content
- Works correctly on Dashboard, Business Brain (411 Plan, Master Task, Team Roster, Business Plan), Sales Mode, and all other views
- No more menu hiding behind z-indexed content like tables, modals, or overlays

---

## Feature 7: Task Real-Time Google Sheets Sync
**Status:** Implemented
**Files Changed:**
- `artifacts/api-server/src/routes/tcc/plan.ts` — Added `import { syncTasksTab }` and `triggerSheetsSync()` helper. Called after: task create, task complete, task uncomplete, task patch/update, task delete, task reorder. All fire-and-forget (non-blocking).

**Ideal Behavior:**
- When a task is created → Google Sheet "Master Task List" tab updates immediately
- When a task is completed/uncompleted → Sheet updates immediately
- When a task is edited (title, owner, priority, etc.) → Sheet updates immediately
- When a task is deleted → Sheet updates immediately
- When tasks are reordered (drag-drop or AI Organize) → Sheet updates immediately
- Sync is fire-and-forget — does not block the API response

---

## Feature 8: Dynamic Week Dropdown in Task Creation
**Status:** Implemented
**Files Changed:**
- `artifacts/tcc/src/components/tcc/BusinessView.tsx` — Added `getWeeksForDate()` helper function. Renamed label from "April week" to "Week". Dropdown now generates 4 weeks dynamically starting from the due date's week.

**Ideal Behavior:**
- If due date is set (e.g. Aug 18, 2026) → dropdown shows Wk 3 (Aug 18-22), Wk 4 (Aug 25-29), Wk 1 (Sep 1-5), Wk 2 (Sep 8-12)
- If due date is NOT set → dropdown shows current month's weeks starting from this week
- Label says "Week" not "April week"
- Weeks auto-recalculate when due date changes

---

## Feature 9: Full Contacts Google Sheets Sync + Last Comm Date + Draft Auto-Load
**Status:** Implemented
**Files Changed:**
- `artifacts/api-server/src/routes/tcc/sheets-sync.ts` — Enhanced `syncContactsTab()` with 25 columns including all contact fields, formatted notes (numbered), activity log (last 10 communications with timestamps), tags, LinkedIn, website, deal value, probability, follow-up/close dates. Bulk-loads notes and comms for performance.
- `artifacts/api-server/src/routes/tcc/contacts.ts` — Added `import { syncContactsTab }` and `triggerContactSync()`. Called after: contact create, update, delete, note add. Added `GET /contacts/:id/draft` endpoint for draft auto-load.
- `artifacts/api-server/src/lib/contact-comms.ts` — Now also updates `contacts.lastContactDate` and `updatedAt` when any communication occurs (email/call/text).
- `artifacts/tcc/src/components/tcc/EmailCompose.tsx` — Auto-loads draft from `GET /contacts/:id/draft` when opening compose for a contact without prefill body. Only loads if draft is newer than last communication date.

**Ideal Behavior:**
1. **Contact create** → Google Sheet "Contact Master" tab updates immediately with all 25 fields
2. **Contact update** (any field change) → Sheet updates immediately
3. **Contact delete** → Sheet updates immediately
4. **Note added** → Sheet updates (notes column shows numbered list)
5. **Email/call/text sent** → `lastContactDate` updates on contacts table + contact_intelligence
6. **Draft auto-load**: When opening email compose for a contact:
   - Checks `GET /contacts/:id/draft` for most recent unsent follow-up
   - Only loads if draft is newer than lastContactDate (stale drafts ignored)
   - Pre-fills email body with the saved draft
7. **Google Sheet columns**: ID, Name, Company, Status, Pipeline Stage, Phone, Email, Type, Category, Title, Lead Source, Source, Deal Value, Probability, Follow-Up Date, Expected Close, Next Step, LinkedIn, Website, Tags, Last Contact Date, Notes, Activity Log, Created At, Updated At

---

## Feature 10: Fix Empty Email Body (MIME encoding)
**Status:** Pending
**Files:** `email-send.ts`
**Behavior:** When manually typing email body and sending, the body text must appear in the received email (not just signature).

---

## Feature 11: Comprehensive AI Token Usage Logging System
**Status:** Implemented
**Date:** April 16, 2026

**New Files Created:**
- `lib/integrations-anthropic-ai/src/usage-logger.ts` — Core logging utility with `createTrackedMessage()` (drop-in wrapper for `anthropic.messages.create()`) and `logStreamedUsage()` (for streaming chat calls). Auto-calculates token cost using provider-specific pricing map. Fire-and-forget DB logging (never blocks AI features).
- `artifacts/api-server/src/routes/tcc/ai-usage.ts` — API endpoint with `GET /ai-usage` (logs + summary aggregations by day/week/month/feature/model/provider) and `GET /ai-usage/:id` (full detail with request/response). Includes `POST /ai-usage/migrate` for table creation.
- `artifacts/tcc/src/components/tcc/AiUsageView.tsx` — Frontend dashboard page with summary cards (Today/Week/Month cost), horizontal bar charts by feature and model, provider breakdown, and clickable log table with full request/response detail modal.

**Files Modified (21 backend files migrated):**
- `lib/db/src/schema/tcc-v2.ts` — Added `aiUsageLogsTable` with 19 columns (id, timestamp, feature_name, provider, model, input/output/total tokens, input/output/total cost USD, request/response summaries, full_request/full_response JSONB, duration_ms, status, error_message, metadata)
- `lib/integrations-anthropic-ai/src/index.ts` — Exported `createTrackedMessage` and `logStreamedUsage`
- `lib/integrations-anthropic-ai/package.json` — Added `@workspace/db` dependency
- `artifacts/api-server/src/routes/index.ts` — Registered `aiUsageRouter`
- `artifacts/tcc/src/App.tsx` — Added `"ai-usage"` view type and `AiUsageView` rendering
- `artifacts/tcc/src/components/tcc/Header.tsx` — Added "AI Token Usage" menu item in sidebar
- `artifacts/api-server/src/routes/tcc/brief.ts` — 3 calls migrated (brief_email_triage, brief_claude_generate, brief_spiritual_anchor)
- `artifacts/api-server/src/routes/tcc/claude.ts` — 3 calls migrated (chat_response)
- `artifacts/api-server/src/routes/tcc/chat-threads.ts` — 1 create + 1 stream migrated (chat_thread)
- `artifacts/api-server/src/routes/tcc/checkin.ts` — 1 call (checkin_accountability)
- `artifacts/api-server/src/routes/tcc/journal.ts` — 1 call (journal_format)
- `artifacts/api-server/src/routes/tcc/eod.ts` — 3 calls (eod_preview, eod_report)
- `artifacts/api-server/src/routes/tcc/emails.ts` — 2 calls (email_triage, email_action)
- `artifacts/api-server/src/routes/tcc/email-poll.ts` — 1 call (email_poll)
- `artifacts/api-server/src/routes/tcc/email-send.ts` — 1 call (email_draft)
- `artifacts/api-server/src/routes/tcc/calls.ts` — 1 call (call_follow_up)
- `artifacts/api-server/src/routes/tcc/contacts.ts` — 1 call (contact_card_ocr)
- `artifacts/api-server/src/routes/tcc/contacts-brief.ts` — 1 call (contact_brief)
- `artifacts/api-server/src/routes/tcc/contacts-research.ts` — 1 call (contact_research)
- `artifacts/api-server/src/routes/tcc/ideas.ts` — 3 calls (idea_classify)
- `artifacts/api-server/src/routes/tcc/plan.ts` — 3 calls (plan_organize)
- `artifacts/api-server/src/routes/tcc/schedule.ts` — 2 calls (schedule_optimize)
- `artifacts/api-server/src/routes/tcc/sheet-scan.ts` — 1 call (sheet_scan)
- `artifacts/api-server/src/routes/tcc/sheets-sync.ts` — 3 calls (sheets_sync)
- `artifacts/api-server/src/routes/tcc/tasks.ts` — 1 call (task_classify)
- `artifacts/api-server/src/lib/demo-feedback.ts` — 1 call (demo_feedback)
- `artifacts/api-server/src/lib/plaud-processor.ts` — 1 call (plaud_transcribe)

**Total: 35 `anthropic.messages.create()` calls + 1 streaming call migrated across 21 files**

**Ideal Behavior:**
1. Every AI API call is automatically logged to `ai_usage_logs` table — no exceptions
2. Logging is fire-and-forget — if DB write fails, the AI feature still works normally
3. Each log captures: feature name, provider, model, input/output tokens, cost in USD, request/response summaries, full request/response in JSONB, duration, success/error status
4. Cost is auto-calculated using model-specific pricing map:
   - claude-haiku-4-5: $1.00/$5.00 per 1M tokens (input/output)
   - claude-sonnet-4-6: $3.00/$15.00 per 1M tokens
   - claude-opus-4-5: $15.00/$75.00 per 1M tokens
   - OpenAI models pre-configured for future use
5. Frontend page (Menu → AI Token Usage) shows:
   - Summary cards: Today, This Week, This Month (cost + tokens + call count)
   - Bar chart: Cost by Feature (top 12 features, 30-day window)
   - Bar chart: Cost by Model with provider breakdown
   - Table: Recent API calls (timestamp, feature, model, tokens, cost, duration, status)
   - Click any row → modal with full detail including request/response JSON
6. API supports filtering by date range, feature, model, provider with pagination

**API Endpoints:**
- `GET /ai-usage?from=&to=&feature=&model=&provider=&limit=&offset=` — Returns `{ logs, summary, pagination }`
- `GET /ai-usage/:id` — Returns full log entry with `fullRequest` and `fullResponse`
- `POST /ai-usage/migrate` — Creates table if not exists (one-time setup)

---

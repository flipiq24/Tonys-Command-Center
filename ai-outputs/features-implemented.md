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

## Feature 5: Fix Empty Email Body (MIME encoding)
**Status:** Pending
**Files:** `email-send.ts`
**Behavior:** When manually typing email body and sending, the body text must appear in the received email (not just signature). Fix: ensure MIME header/body separator is preserved and body is properly encoded.

---

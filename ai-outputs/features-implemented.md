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

## Feature 4: Fix Empty Email Body (MIME encoding)
**Status:** Pending
**Files:** `email-send.ts`
**Behavior:** When manually typing email body and sending, the body text must appear in the received email (not just signature). Fix: ensure MIME header/body separator is preserved and body is properly encoded.

---

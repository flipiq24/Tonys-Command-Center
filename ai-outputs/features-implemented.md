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
2. If new emails found → blue banner appears: "📬 N new email(s) arrived"
3. "Classify & Update" button → sends ONLY new emails to Claude Haiku → classifies into important/fyi/promotions → merges into existing cached brief (new emails appear at TOP) → banner disappears
4. "Dismiss" button → hides banner, clears pending emails
5. No auto-reclassify (saves API cost) — user controls when to classify
6. Banner shows on Dashboard and Emails views only
7. Classification result is persisted in `daily_briefs` table so it survives page refresh

**API Endpoint:** `POST /emails/reclassify-new`
- Input: `{ newEmails: [{ from, subject, snippet, messageId }] }`
- Output: `{ ok, added, emailsImportant, emailsFyi, emailsPromotions }`

---

## Feature 2: Fix Empty Email Body (MIME encoding)
**Status:** Pending
**Files:** `email-send.ts`
**Behavior:** When manually typing email body and sending, the body text must appear in the received email (not just signature). Fix: ensure MIME header/body separator is preserved and body is properly encoded.

---

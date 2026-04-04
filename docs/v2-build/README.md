# TCC v2 Build Instructions for Replit Agent

## How to Use

Feed these files to Replit Agent **one at a time, in order**. Each prompt is self-contained. **Test before moving to the next prompt.**

| # | File | What It Builds | Stories Covered |
|---|------|---------------|----------------|
| 00 | `00-foundation-schema-auth.md` | Supabase 8 tables + Google OAuth helper + shared auth | 0.x foundation |
| 01 | `01-gmail-send-compose.md` | Gmail send, compose UI, autocomplete, connected call modal, email polling | 2.2, 2.4, 2.6, 4.3, 10.1 |
| 02 | `02-communication-log.md` | Unified comm log across all channels + contact intelligence sync | 10.1, 15.1 |
| 03 | `03-claude-chat-full.md` | Full-screen threaded Claude chat with SSE streaming + 16 tools | 7.1, 7.2, 7.3, 7.4 |
| 04 | `04-sales-morning-3tier.md` | 3-tier morning sales view (urgent/follow-up/top 10) + pipeline | 4.1, 4.2, 4.6, 4.7, 5.1 |
| 05 | `05-contact-scoring-research.md` | AI contact scoring + web research + contact briefs | 4.4, 4.5, 3.3 |
| 06 | `06-voice-input-everywhere.md` | Voice input component on all 12 text fields | 11.1 |
| 07 | `07-polish-refresh-deeplinks-timeline.md` | Auto-refresh, email polling, deep links, timeline, print view | 14.1, 8.3, 3.1, 3.7 |
| 08 | `08-drive-sheets-sync.md` | Google Drive folders, Sheets sync, plan ingestion, checkin/journal sync | 13.1, 13.2, 5.5, 1.4, 1.5 |
| 09 | `09-phase3-eod-ideas-protection.md` | Auto-EOD, ideas pushback, scope gatekeeper, pattern alerts, spiritual anchor, demo feedback, Ethan Cowork | 9.1, 6.1, 6.2, 3.5, 1.2, 1.6, 10.3, 12.1, 3.4, 5.2, 5.3 |

## 53 User Stories — 250 Acceptance Criteria

| Phase | Stories | Criteria | Prompts |
|-------|---------|----------|---------|
| Phase 1 (Foundation) | ~20 | ~95 | 00-02, 06-08 |
| Phase 2 (Intelligence) | ~20 | ~95 | 03-05 |
| Phase 3 (Accountability) | ~13 | ~60 | 09 |

## Rules for Replit Agent

1. **Read the ENTIRE prompt before writing any code.**
2. **Do NOT skip steps.** Each step builds on the previous.
3. **Test after each prompt.** The prompt tells you what to verify.
4. **Do NOT refactor existing working code** unless the prompt explicitly says to.
5. **Keep all existing functionality working.** v1 features must not break.
6. **All acceptance criteria must pass before moving to the next prompt.**

## Architecture Summary

- **Database:** Supabase (PostgreSQL via Drizzle ORM) — 8 new v2 tables
- **Backend:** Express 5 + TypeScript (artifacts/api-server/)
- **Frontend:** React 19 + Vite + inline styles (artifacts/tcc/)
- **AI:** Anthropic Claude API (brain only — analysis, decisions, drafting. NOT an API proxy.)
- **Google:** Single OAuth2 client for Gmail + Calendar + Drive + Sheets + People (Contacts)
- **External:** Slack (BOT_TOKEN), Linear (API_KEY), MacroDroid (webhooks)
- **Ethan Access:** Cowork project with TCC brain (NOT Claude Project)

## Key Design Decisions (Locked)

| Decision | Answer |
|----------|--------|
| Email replies | Send via Gmail only (no copy to clipboard) |
| Call follow-ups | Show draft for review, then Tony sends |
| Contact fields | Stage (pipeline) + Status (temperature) = two separate dropdowns |
| Email categories | 3 tiers: Important, FYI, Promotions (hidden by default) |
| Task completion | Two options: "Completed" or "Worked on it" (notes, stays active) |
| Task focus | Top 3 at a time, full list below |
| EOD report | Auto at 4:30 PM, no button. Claude Chat "send EOD" as fallback |
| Slack urgency | Dismissible banner at top (auto-dismiss 15s) |
| Scheduling | Intuitive (no rigid buffers). Scope gatekeeper enforces priorities |
| Tony's scope | Sales > Ramy support > everything else pushed back |
| Sheet sync | One-way: Supabase -> Sheet. Ethan changes via Cowork |
| Phone contacts | Only auto-create if tagged FlipIQ |
| Business plans | Read from Google Drive daily at 4 AM |

## Env Vars Required

```env
# Database
DATABASE_URL=

# Google OAuth (ONE credential for all Google services)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
# Scopes: gmail.send, gmail.readonly, gmail.modify, calendar.events, drive.readonly, spreadsheets, contacts.readonly

# Google Sheet / Doc IDs (LOCKED — correct URLs)
CHECKIN_SHEET_ID=1rMLE_RhdRDsC2dqRs8eIiF6bySCAkMvy1k4JlHKkRMw        # Tony ONLY — personal check-in
BUSINESS_MASTER_SHEET_ID=1WGuJwCoWbwyFamXXP79yxnPmYhdFPgOGhOR8_V-EQyw  # Tony + Ethan — tasks, contacts, comms (3 tabs)
JOURNAL_DOC_ID=1kQjIFa903luN-62HkUD0tPGAmeQPC7JMN6rfnbvXYRE           # Tony ONLY — daily journal
# DO NOT use old IDs: 1DVys4rDcntlb3NmuKk4O2TRLV1YgkbtXLvuz4Xx2QBI (archived check-in) or 1Rm2FGbA5m02QuSxhsZUE0TyOuHSVa7AFW02zp4Wj2Y4 (archived journal)

# Anthropic
ANTHROPIC_API_KEY=

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_TONY_USER_ID=

# Linear
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=

# MacroDroid
MACRODROID_SECRET=
MACRODROID_WEBHOOK_URL=

# Google Drive folder IDs
DRIVE_ROOT_FOLDER_ID=
DRIVE_RECORDINGS_FOLDER_ID=1g1itXWZj82oudTpMSp96HCoKk79_ZkdX

# App
FRONTEND_URL=https://tonys-command-center.replit.app
TCC_API_TOKEN=
```

## Reference Documents

- `TCC_v2_Replit_Build_Instructions.md` — Master architecture spec
- `TCC_v2_User_Stories_Final.md` — 53 stories with 250 acceptance criteria
- `TCC_System_Brain_v2.md` — System brain spec
- `TCC_Bug_Fix_Spec.md` — 18 v1 bugs (mostly fixed in pre-v2 cleanup)

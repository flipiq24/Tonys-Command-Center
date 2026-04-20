# TCC Project Context — Cheat Sheet for Future Sessions

> When your conversation context is summarized, read this file first. It references other files — read those for deep detail.

---

## Who & What

- **Client**: Tony Diaz — CEO of **FlipIQ** (real estate wholesaling / operator platform)
- **Developer**: Anas Aqeel (primary), Haris (developer/operator)
- **Project**: TCC = "Tony's Command Center" — a personal COO dashboard that consolidates Tony's sales pipeline, 411 plan, ideas, daily brief, email triage, Slack, Linear, etc.
- **Deadline reference**: Sprint session April 2026; demos + live migration from Replit to Vercel this month.

---

## Repo Layout (monorepo — pnpm workspaces)

```
Tonys-Command-Center/
├── artifacts/
│   ├── tcc/                  # React + Vite frontend (port 5173 dev)
│   │   └── src/components/tcc/BusinessView.tsx   # ← 99% of the sprint-in-progress UI lives here
│   └── api-server/           # Express backend (port 8080 dev, Vercel Serverless in prod)
│       ├── src/routes/tcc/plan.ts           # Task CRUD, AI organize, weekly grid, Linear webhook
│       ├── src/routes/tcc/sheets-sync.ts    # Google Sheets ⇄ DB sync + reverse-sync-from-sheet
│       ├── src/routes/tcc/ideas.ts          # Ideas flow + AI classify + generate-task
│       ├── src/routes/tcc/contacts.ts       # Contact CRUD
│       ├── src/routes/tcc/calls.ts          # Call logs + communication log
│       ├── src/routes/tcc/email-send.ts     # Gmail send + draft suggestion
│       ├── src/routes/tcc/email-poll.ts     # Inbox polling + classify
│       ├── src/lib/slack.ts                 # Slack integration (see Slack section below)
│       ├── src/lib/google-sheets.ts         # Direct fetch-based Sheets client (bypasses googleapis)
│       ├── src/lib/google-auth.ts           # Unified OAuth2 for Gmail/Cal/Drive/Sheets/Docs/People
│       └── api/index.mjs                    # Vercel serverless entry point
├── lib/db/
│   └── src/schema/
│       ├── tcc.ts            # Contacts, call logs, tasks (legacy)
│       └── tcc-v2.ts         # planItemsTable, teamRolesTable, communicationLogTable, etc.
├── ai-outputs/               # Long-form docs (THIS FILE lives here)
│   ├── context.md            # ← you are here
│   ├── instructions.md       # User's explicit instructions + design decisions
│   ├── features.md           # Every feature implemented during the sprint
│   └── DEPLOYMENT-AND-GIT-GUIDE.md   # Vercel/Git setup — READ THIS before any deploy
└── .env                      # Root env file — has Google OAuth, Slack token, DB URL, etc.
```

---

## Integrations & API Credentials

All credentials live in **root `.env`** (NOT `artifacts/api-server/.env` — that file is local overrides only).

| Service | Env var | Status / Notes |
|---|---|---|
| Neon Postgres | `DATABASE_URL` | Uses Supabase pooler on port 6543. Drizzle ORM. |
| Claude | `ANTHROPIC_API_KEY` or legacy `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Token-usage tracked via `createTrackedMessage()` |
| Google (Gmail/Cal/Drive/Sheets/Docs/People) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | **Unified OAuth2** — one refresh token for ALL Google services. `google-auth.ts` throws if any of the 3 are missing. `google-sheets.ts` uses direct fetch (not googleapis lib) because of esbuild bundling issues. |
| Slack | `SLACK_TOKEN` | Bot `tcc_bot` in workspace `FlipIQ` (team_id `T0991A2JH1Q`). **Current scopes:** `channels:history, groups:history, im:history, channels:read, groups:read, chat:write, im:read`. **Missing:** `users:read`, `users:read.email` — so we cannot auto-discover Slack IDs. Team member Slack IDs must be entered manually in `team_roles.slack_id`. |
| Linear | `LINEAR_API_KEY` | Authenticated as `tony@flipiq.com`. Uses `@linear/sdk`. |
| Resend | `RESEND_API_KEY` | System emails (replaces AgentMail after Replit migration) |
| TCC auth gate | `TCC_AUTH_TOKEN` | Required `x-tcc-token` header on all API routes except `/phone-log` and `/auth/verify` |

Testing a token quickly:
```bash
# Slack
curl -s -X POST https://slack.com/api/auth.test -H "Authorization: Bearer $SLACK_TOKEN"
# Linear
curl -s https://api.linear.app/graphql -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" --data '{"query":"{ viewer { email } }"}'
```

---

## Deployment

**See `ai-outputs/DEPLOYMENT-AND-GIT-GUIDE.md` for the full protocol.** Never skip reading this before deploying. Key points:

- **Two Git remotes** — `origin` (flipiq24/Tony's Command Center) + `vercel-origin` (anas-aqeel/Tonys-Command-Center fork, which Vercel deploys from). **ALWAYS push to both.**
- **Branch**: `dev-vercel` is the production branch. Deployment target for both Vercel projects.
- **Two Vercel projects on team `anasaqeel-projects` (team_MJfRjaxJr2JyEJifYIAzR9fA)**:
  - Frontend: `prj_b3pH0jmXrDORJ52XtZvhBZ65CyeA` → `tonys-command-center.vercel.app`
  - Backend: `prj_GLrQVGJ300TpvyEHS5G8RwvJqDAt` → `tonys-command-center-api-server.vercel.app`
- **Frontend proxies `/api/*`** to the backend via Vercel rewrite (see `artifacts/tcc/vercel.json`).
- **Known prod issue that HAS been fixed**: deployments were being created as preview (`target: null`) instead of production. Tony resolved the production-branch setting.

---

## DB Schema — Key Tables

See `lib/db/src/schema/tcc-v2.ts` for full definitions.

**`plan_items`** — everything task-related (categories, subcategories, tasks)
- `level`: `"category"` | `"subcategory"` | `"task"`
- `category`, `subcategory`: category key (lowercase: `adaptation/sales/tech/capital/team`)
- `taskType`: `"master"` | `"subtask"` | `"note"` (only for level=task)
- `parentTaskId` (uuid): links a subtask/note to its master
- `parentId` (uuid): links a task to its subcategory/category row
- `priorityOrder` (int): sort key within a tier (masters among masters, subs within parent)
- `dueDate` (date): source of truth for the week bucket — `week_number` column was **dropped**; week is always derived from `dueDate` (≤11=1, ≤18=2, ≤25=3, else 4)
- `source`: `"Linear"` | `"TCC"` | `"OAP"` | `"manual"` | `"v2"` | `"v3"`
- `linearId` (text): **comma-separated** allowed for one task spanning multiple tickets (split via `splitLinearIds()` on the frontend)

**`team_roles`** — team roster with Slack IDs
- Current known members with slackId: Tony Diaz, Ethan, Ramy, Haris, Anas, Faisal, Nate
- ⚠️ **Name mismatch**: tasks use owner `"Tony"` but team_roles has `"Tony Diaz"` — Slack lookup fails for Tony's own tasks until row is renamed or lookup is relaxed
- ⚠️ Missing: **Bondilyn** (14 tasks), **Chris** (1), **TBD PM** (1)

**`communication_log`** — every call, email, text, meeting, tied to contact + optional Linear

---

## Google Sheets Sync

Tab structure in `BUSINESS_MASTER_SHEET_ID`:
- `Master Task List` (Sprint ID, Type, Task, Source, Owner, Co-Owner, Priority, Status, Category, Subcategory, Execution Tier, Completed Date, Due Date, Notes, Atomic KPI, Linear ID)
- `411 Plan` — company goals
- `Team Roster` — team members
- `Contact Master` — CRM data
- `Communication Log` — call/email history

**⚠️ CRITICAL: auto-sync is DISABLED** (for reasons — see `instructions.md`). `startAutoSync()` is a no-op. `triggerSheetsSync()` in plan.ts and `triggerContactSync()` in contacts.ts are both no-ops. Manual sync only — via the `Refresh ▾` dropdown in the Business Brain UI or directly hitting these endpoints:

- `POST /sheets/sync-master` — DB → Sheets (all tabs)
- `POST /sheets/sync-tasks-from-sheet` — Sheets → DB (flush + full reimport of tasks using Sprint ID hierarchy)

Sprint ID hierarchy: `ADP-02` = master. `ADP-02.1`, `ADP-02.3` = subtasks of `ADP-02`. The decimal pattern tells us the parent — this is how Tony structures tasks in Sheets and how the reverse sync rebuilds hierarchy.

---

## Local Dev Commands (Windows)

```bash
# Frontend (port 5173) — needs API_PORT=8080 set so Vite proxies correctly
cd artifacts/tcc && API_PORT=8080 npx vite --port 5173

# Backend (port 8080) — load BOTH root .env AND local overrides
cd artifacts/api-server && pnpm run build
cd artifacts/api-server && node --enable-source-maps --env-file=../../.env --env-file=.env ./dist/index.mjs
```

The api-server `dev` script has Unix `export` syntax that breaks on Windows — use the commands above directly.

Node pg driver is only installed in `lib/db/node_modules/pg`, so one-off DB scripts should `cd lib/db` first.

---

## Conventions Worth Remembering

- **Never create new files unless asked.** Always prefer editing existing files.
- **Never add weekNumber back** — it's dead. Week = `weekFromDate(dueDate)`.
- **All generated docs go in `ai-outputs/`** — not the project root.
- **CAT_PREFIX_CLIENT / CAT_PREFIX** maps category key → Sprint ID prefix: `adaptation: "ADP", sales: "SLS", tech: "TCH", capital: "CAP", team: "TME"`.
- **Master Task View hierarchy**: masters flat-listed, then each master's subs (by priorityOrder), then notes (always last). Sort preserved within each tier.

---

## Frequent Pitfalls & How to Debug

| Symptom | First place to check |
|---|---|
| "Failed to load 411 plan" | Backend not running OR Vite proxy pointing at wrong port. `API_PORT=8080` when starting Vite |
| Google Sheets sync returns `invalid_client` | Wrong / expired `GOOGLE_CLIENT_ID` or `_SECRET`. Test with `auth.test`-style Google token exchange |
| Slack notification silently doesn't send | Owner name doesn't exactly match `team_roles.name` OR slackId is null. Response contains `slackNotified.error` |
| Task doesn't show on weekly board | Task has no `dueDate`, or dueDate month doesn't match the requested month (`/plan/weekly/2026-04`) |
| Master Task list empty after sync | Check `syncTasksFromSheet` response — `flushed` should be > 0 and `inserted` should match master+subs counts |
| Column changes to DB break builds | Drizzle schema (`tcc-v2.ts`) and the actual DB schema must stay in sync. Use direct `ALTER TABLE` for column drops, then update `tcc-v2.ts` in the same commit |

---

## Quick MCP Access I Have (via claude.ai)

- **Vercel MCP**: `list_deployments`, `get_deployment`, `get_project`, `get_runtime_logs` — can diagnose deployment failures directly
- **Linear MCP**: (when connected) `list_issues`, `save_issue`, etc.
- **Slack/Gmail/Calendar/Notion MCPs**: available but require user auth each session

When stuck diagnosing production, use Vercel MCP `get_runtime_logs` with `projectId` + `teamId` + query filter.

---

_Last meaningful update: 2026-04-20. If you edit this file, also update the git commit note so future-you can find it._

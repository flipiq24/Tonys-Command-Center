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

Tables (in `lib/db/src/schema/tcc.ts`):
- `checkins` — Daily morning check-in data (sleep, habits)
- `journals` — Journal entries + AI-formatted output
- `ideas` — Ideas parking lot with priority
- `contacts` — Sales contacts / CRM
- `call_log` — Sales call tracking
- `email_training` — Email thumbs up/down training data
- `daily_briefs` — Cached morning brief data
- `task_completions` — Task completion tracking
- `demos` — Demo count per day

## API Routes

All routes under `/api/` (defined in `artifacts/api-server/src/routes/`):

| Route | Description |
|-------|-------------|
| `GET /api/healthz` | Health check |
| `GET/POST /api/checkin` | Daily check-in |
| `GET/POST /api/journal` | Journal entry |
| `GET /api/brief/today` | Morning brief (calendar, emails, tasks) |
| `POST /api/emails/action` | Email actions (snooze, suggest_reply, thumbs) |
| `GET /api/contacts` | Sales contacts |
| `GET/POST /api/calls` | Call log |
| `GET/POST /api/ideas` | Ideas parking lot |
| `POST /api/claude` | Claude AI proxy |
| `GET/POST /api/demos/count|increment|decrement` | Demo counter |
| `GET/POST /api/tasks/completed` | Task tracking |

## Frontend Flow (Sequential)

1. **Morning Check-in** — Gate. Saves to DB. Goes away once done.
2. **Journal** — Brain dump. Claude formats it (Mood, Events, Reflection). 
3. **Emails** — Important emails with reply/snooze/thumbs. FYI section.
4. **Schedule** — Today's calendar items. Entry to Sales or Tasks.
5. **Sales Mode** — Contact list with call logging + demo counter. Calendar sidebar.
6. **Tasks** — Task checklist. Toggle between Sales/Tasks modes.

## AI Integration

- Uses Replit AI Integrations Anthropic proxy (no direct API key needed)
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` and `AI_INTEGRATIONS_ANTHROPIC_API_KEY` env vars set
- Model: `claude-sonnet-4-6` (main), `claude-haiku-4-5` (quick tasks)
- System prompt: Tony Diaz persona (FlipIQ, ADHD-aware, sales-first)

## Key Design Decisions

- Sequential one-view-at-a-time UX (no multi-panel) — matches Tony's ADHD-friendly workflow
- All state persists to DB (not localStorage) — resume where Tony left off on reload
- Calendar sidebar is the only floating panel (collapsible)
- Default brief data embedded in backend for day-1 experience without live integrations
- **Slack**: Integration dismissed by user during OAuth — Slack posting is implemented in `lib/slack.ts` and gracefully skips when not connected. To enable, complete the Slack OAuth flow in Replit integrations (connector ID: `ccfg_slack_01KH7W1T1D6TGP3BJGNQ2N9PEH`) or provide a `SLACK_BOT_TOKEN` secret for a direct API approach.
- **Linear**: Connected via Replit connector (`conn_linear_*`) using `@replit/connectors-sdk`. Tech ideas auto-create Linear issues.
- **AgentMail**: Connected via Replit connector (`conn_agentmail`). EOD report emails sent to tony@flipiq.com and ethan@flipiq.com.
- Gmail/Google Calendar: Available via Replit integrations — currently using default/mock brief data.

## Email Brain System

- Thumbs 👍/👎 on emails trains a persistent "brain" in PostgreSQL
- After each vote, Tony is prompted for a reason (optional)
- Claude Haiku re-generates the brain summary from all training data
- Brain stored under `system_instructions` table, section `email_brain`
- Brain is injected into Claude's system prompt for Suggest Reply calls
- `GET /api/emails/brain` exposes brain content + training stats

## Claude Tool-Use (/api/claude)

The `/api/claude` endpoint runs a full agentic loop with tools:
- `send_slack_message` — Post to any Slack channel (via Replit connector)
- `create_linear_issue` — Create Linear issues (via Replit connector)
- `send_email` — Send email via AgentMail (via Replit connector)
- `get_email_brain` — Retrieve Tony's learned email priority rules

Tech ideas auto-trigger: Linear issue creation + Slack #tech-ideas post (gracefully skipped if Slack not connected).

# Ethan Cowork Setup — FlipIQ AI Chief of Staff

Ethan accesses TCC through Claude Cowork (NOT Claude Project).

## Cowork Project Configuration

### 1. Create Cowork Project
Name: **"FlipIQ Command Center - Ethan"**

### 2. Brain / Instructions

```
You are Ethan, Tony Diaz's AI chief of staff for FlipIQ.

SCOPE PRIORITIES (same as TCC):
1. Sales (highest priority)
2. Ramy support
3. Everything else (push back or park)

PRIORITIZATION LOGIC:
- Classify all ideas against North Star + business plan + 90-day plan
- If conflicts: push back with priority rank
- If Tony overrides: post to Slack #leadership
- If unreasonable: park and schedule meeting

DATA ACCESS:
- READ: Supabase (all tables), Google Drive (FlipIQ Command Center folder)
- WRITE: Supabase (tasks, contacts, communication_log), Google Calendar

DATA FLOW:
- Ethan's changes go: Cowork → Supabase → Google Sheet (one-way sync)
- Ethan does NOT edit Google Sheets directly
- All task updates, contact changes, and notes flow through Supabase

DAILY RESPONSIBILITIES:
- Review Tony's EOD report (arrives at 4:30 PM Pacific)
- Act on dynamic action items from the EOD brief
- Ensure all tasks have due dates and assign missing ones
- Flag out-of-sequence work
- Maintain accountability score tracking
- Book meetings when ideas are escalated for review
```

### 3. Connect MCP Servers

| Server | Access |
|--------|--------|
| Supabase MCP | Read + write (all TCC tables) |
| Google Drive MCP | Read (FlipIQ Command Center folder) |
| Google Calendar MCP | Write (scheduling only) |

### 4. Data Flow Verification

After setup, verify the pipeline:

1. Ethan creates a task in Cowork
2. Verify it appears in Supabase `tasks` table (via DB query)
3. Wait for sheets-sync cycle (~5 min)
4. Verify task appears in Google Sheet master list
5. **Confirm**: Sheet edits do NOT flow back to Supabase (one-way only)

### 5. EOD Brief Format (Ethan receives at 4:30 PM Pacific)

Ethan's report includes:
- Tony's activity summary (calls, demos, tasks, emails)
- Items without due dates → Ethan assigns them
- Out-of-sequence work → Ethan flags and re-prioritizes
- Tony's overrides today → Ethan tracks and follows up
- Demo pitch feedback (if FlipIQ Demo events ran that day)
- Accountability score (%)
- Dynamic action items for Ethan to complete tomorrow

### 6. Key Database Tables

| Table | Purpose |
|-------|---------|
| `tasks` | Linear-synced tasks, top-3 focus |
| `task_completions` | Completed tasks with timestamps |
| `task_work_notes` | "Worked on it" notes with history |
| `communication_log` | All emails, calls, meetings |
| `contact_intelligence` | Contact personality + research |
| `business_context` | North Star, Business Plan, 90-Day Plan |
| `daily_suggestions` | AI-generated morning suggestions |
| `eod_reports` | EOD report history (Tony + Ethan) |

### 7. Google Drive Folder Structure

```
FlipIQ Command Center/
├── Journal Entries (Google Doc — append-only, one entry per day)
├── Check-ins (Google Sheet — one row per day)
├── Meeting Recordings/ (Folder ID: 1g1itXWZj82oudTpMSp96HCoKk79_ZkdX)
└── 90-Day Plan (Google Doc — ID: 1b1Ejf6Tim1gevq0BoMeV7XZ2KuXrgP2E)
```

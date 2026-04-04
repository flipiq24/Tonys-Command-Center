# Prompt 00: Foundation — Supabase Schema + Google OAuth

## CONTEXT

Tony's Command Center v1 uses Replit Connectors for Google auth (fragile, dual paths). v2 switches to a single Google OAuth2 refresh token for Gmail, Calendar, Drive, Sheets, and People (Contacts). The database needs 8 new tables for contact intelligence, communication logging, chat threads, task work notes, etc.

**Codebase layout:**
- Frontend: `artifacts/tcc/src/` (React 19 + Vite, inline styles)
- Backend: `artifacts/api-server/src/` (Express 5 + TypeScript)
- API wrapper: `artifacts/tcc/src/lib/api.ts` with `get<T>()` and `post<T>()`

**Database:** Supabase (PostgreSQL). If not already configured, set up a Supabase project and add the connection string as `DATABASE_URL`. All tables are created via Drizzle ORM + `drizzle-kit push`.

**Google Sheet / Doc IDs:** Hardcoded as defaults with env var override:
- Checkin sheet: `1DVys4rDcntlb3NmuKk4O2TRLV1YgkbtXLvuz4Xx2QBI`
- Journal doc: `1Rm2FGbA5m02QuSxhsZUE0TyOuHSVa7AFW02zp4Wj2Y4`

## PREREQUISITES

- Supabase project exists (or any PostgreSQL database)
- `DATABASE_URL` env var is set
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` env vars ready
- Google OAuth2 client has these scopes: `gmail.send`, `gmail.readonly`, `gmail.modify`, `calendar.events`, `drive.readonly`, `spreadsheets`, `contacts.readonly`

## WHAT TO BUILD

### Step 1: Set up environment variables

Add these to `.env` (or Replit Secrets):

```
DATABASE_URL=<your-supabase-connection-string>
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_REFRESH_TOKEN=<your-refresh-token>

# Google Sheet / Doc IDs — hardcoded defaults, override if needed
CHECKIN_SHEET_ID=1DVys4rDcntlb3NmuKk4O2TRLV1YgkbtXLvuz4Xx2QBI
JOURNAL_DOC_ID=1Rm2FGbA5m02QuSxhsZUE0TyOuHSVa7AFW02zp4Wj2Y4
```

### Step 2: Create the shared Google OAuth helper

Create this NEW file. This is the single source of truth for all Google API access.

**File: `artifacts/api-server/src/lib/google-auth.ts`**

```typescript
import { google } from "googleapis";

let _auth: InstanceType<typeof google.auth.OAuth2> | null = null;

export function getGoogleAuth() {
  if (!_auth) {
    _auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    _auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
  return _auth;
}

export function getGmail() {
  return google.gmail({ version: "v1", auth: getGoogleAuth() });
}

export function getCalendar() {
  return google.calendar({ version: "v3", auth: getGoogleAuth() });
}

export function getDrive() {
  return google.drive({ version: "v3", auth: getGoogleAuth() });
}

export function getSheets() {
  return google.sheets({ version: "v4", auth: getGoogleAuth() });
}

export function getPeople() {
  return google.people({ version: "v1", auth: getGoogleAuth() });
}
```

### Step 3: Update existing Gmail library to use shared auth

**File: `artifacts/api-server/src/lib/gmail.ts`** — REPLACE the entire file.

Remove ALL of the Replit Connectors code (the `connectionSettings` cache, the `getAccessToken()` function, the `getUncachableGmailClient()` function). Replace with:

```typescript
import { getGmail } from "./google-auth";

export async function listRecentEmails(maxResults = 10): Promise<{
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
}[]> {
  try {
    const gmail = getGmail();
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      q: "is:unread",
    });

    const messages = list.data.messages || [];
    const results = [];

    for (const msg of messages.slice(0, maxResults)) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name === name)?.value || "";

      results.push({
        id: msg.id!,
        from: getHeader("From"),
        subject: getHeader("Subject"),
        snippet: detail.data.snippet || "",
        date: getHeader("Date"),
      });
    }

    return results;
  } catch (err) {
    console.warn("[Gmail] listRecentEmails failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function draftReply(params: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}): Promise<{ ok: boolean; draftId?: string; error?: string }> {
  try {
    const gmail = getGmail();
    const raw = Buffer.from(
      [
        `To: ${params.to}`,
        `Subject: ${params.subject}`,
        `Content-Type: text/plain; charset=UTF-8`,
        "",
        params.body,
      ].join("\r\n")
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw,
          ...(params.threadId ? { threadId: params.threadId } : {}),
        },
      },
    });

    return { ok: true, draftId: draft.data.id || undefined };
  } catch (err) {
    console.warn("[Gmail] draftReply failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: String(err) };
  }
}
```

### Step 4: Update existing Google Calendar library

**File: `artifacts/api-server/src/lib/gcal.ts`** — REPLACE the entire file with the same pattern:

```typescript
import { getCalendar } from "./google-auth";

export async function listTodayEvents(): Promise<{
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}[]> {
  try {
    const calendar = getCalendar();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const events = await calendar.events.list({
      calendarId: "primary",
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });

    return (events.data.items || []).map(e => ({
      id: e.id || "",
      summary: e.summary || "Untitled",
      start: e.start?.dateTime || e.start?.date || "",
      end: e.end?.dateTime || e.end?.date || "",
      location: e.location || undefined,
      description: e.description || undefined,
    }));
  } catch (err) {
    console.warn("[Calendar] listTodayEvents failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function createEvent(params: {
  summary: string;
  start: string;
  end: string;
  attendees?: string[];
  description?: string;
  location?: string;
}): Promise<{ ok: boolean; eventId?: string; htmlLink?: string }> {
  try {
    const calendar = getCalendar();
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: params.summary,
        start: { dateTime: params.start },
        end: { dateTime: params.end },
        attendees: params.attendees?.map(email => ({ email })),
        description: params.description,
        location: params.location,
      },
    });
    return { ok: true, eventId: event.data.id || undefined, htmlLink: event.data.htmlLink || undefined };
  } catch (err) {
    console.warn("[Calendar] createEvent failed:", err instanceof Error ? err.message : err);
    return { ok: false };
  }
}

/**
 * Create a reminder event on Google Calendar.
 * Used by Connected Call modal to create follow-up reminders.
 */
export async function createReminder(params: {
  summary: string;
  date: string; // ISO date string e.g. "2026-04-10"
  description?: string;
}): Promise<{ ok: boolean; eventId?: string; htmlLink?: string }> {
  try {
    const calendar = getCalendar();
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: params.summary,
        start: { date: params.date },
        end: { date: params.date },
        description: params.description,
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 540 }, // 9am day-of
          ],
        },
      },
    });
    return { ok: true, eventId: event.data.id || undefined, htmlLink: event.data.htmlLink || undefined };
  } catch (err) {
    console.warn("[Calendar] createReminder failed:", err instanceof Error ? err.message : err);
    return { ok: false };
  }
}
```

### Step 5: Update brief.ts to use shared auth

**File: `artifacts/api-server/src/routes/tcc/brief.ts`**

Find and DELETE these two functions:
- `function buildGmailClient(token: string)` (around line 79)
- `function buildCalendarClient(token: string)` (around line 87)

Find the `fetchLiveEmails()` function. Replace `if (!process.env.GMAIL_TOKEN) return null;` with `if (!process.env.GOOGLE_REFRESH_TOKEN) return null;` and replace `buildGmailClient(process.env.GMAIL_TOKEN)` with:

```typescript
import { getGmail, getCalendar } from "../../lib/google-auth";
// ...
const gmail = getGmail();
```

Do the same for `fetchLiveCalendar()` — replace `buildCalendarClient(...)` with `getCalendar()`.

Remove the `import { google } from "googleapis"` at the top of brief.ts since it now uses the shared lib.

### Step 6: Create the new Drizzle schema for v2 tables

**File: `artifacts/api-server/src/lib/schema-v2.ts`** (or add to existing schema file)

Add these Drizzle table definitions. They must match the column names and types exactly:

```typescript
import { pgTable, uuid, text, numeric, timestamp, date, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

// Reference existing contacts table
import { contactsTable } from "./schema"; // adjust import path to wherever contacts is defined

export const contactIntelligenceTable = pgTable("contact_intelligence", {
  id: uuid("id").defaultRandom().primaryKey(),
  contactId: uuid("contact_id").references(() => contactsTable.id, { onDelete: "cascade" }).unique(),
  aiScore: numeric("ai_score", { precision: 5, scale: 2 }),
  aiScoreReason: text("ai_score_reason"),
  aiTags: text("ai_tags").array(),
  stage: text("stage").default("new"),
  // stage values: "new" | "outreach" | "engaged" | "meeting_scheduled" | "negotiating" | "closed" | "dormant"
  lastAiScan: timestamp("last_ai_scan", { withTimezone: true }),
  linkedinUrl: text("linkedin_url"),
  socialProfiles: jsonb("social_profiles").default("{}"),
  companyInfo: jsonb("company_info").default("{}"),
  personalityNotes: text("personality_notes"),
  totalCalls: integer("total_calls").default(0),
  totalEmailsSent: integer("total_emails_sent").default(0),
  totalEmailsReceived: integer("total_emails_received").default(0),
  totalTexts: integer("total_texts").default(0),
  totalMeetings: integer("total_meetings").default(0),
  lastCommunicationDate: timestamp("last_communication_date", { withTimezone: true }),
  lastCommunicationType: text("last_communication_type"),
  lastCommunicationSummary: text("last_communication_summary"),
  nextAction: text("next_action"),
  nextActionDate: date("next_action_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_ci_contact").on(table.contactId),
  index("idx_ci_score").on(table.aiScore),
]);

export const communicationLogTable = pgTable("communication_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  contactId: uuid("contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  contactName: text("contact_name"),
  channel: text("channel").notNull(),
  // channel values: "email_sent" | "email_received" | "call_outbound" | "call_inbound" | "text_sent" | "text_received" | "meeting"
  direction: text("direction"), // "inbound" | "outbound" — for quick filtering
  subject: text("subject"),
  summary: text("summary"),
  fullContent: text("full_content"),
  sentiment: text("sentiment"),
  actionItems: text("action_items").array(),
  gmailThreadId: text("gmail_thread_id"),
  gmailMessageId: text("gmail_message_id"),
  calendarEventId: text("calendar_event_id"),
  plaudTranscriptPath: text("plaud_transcript_path"),
  loggedAt: timestamp("logged_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_cl_contact").on(table.contactId),
  index("idx_cl_date").on(table.loggedAt),
  index("idx_cl_channel").on(table.channel),
]);

export const contactBriefsTable = pgTable("contact_briefs", {
  id: uuid("id").defaultRandom().primaryKey(),
  contactId: uuid("contact_id").references(() => contactsTable.id, { onDelete: "cascade" }),
  contactName: text("contact_name").notNull(),
  briefText: text("brief_text").notNull(),
  openTasks: text("open_tasks").array(),
  recentCommunications: jsonb("recent_communications"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_cb_contact").on(table.contactId),
]);

export const businessContextTable = pgTable("business_context", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentType: text("document_type").notNull().unique(),
  content: text("content").notNull(),
  summary: text("summary"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
});

export const dailySuggestionsTable = pgTable("daily_suggestions", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull().unique(),
  urgentResponses: jsonb("urgent_responses"),
  followUps: jsonb("follow_ups"),
  top10New: jsonb("top_10_new"),
  pipelineSummary: jsonb("pipeline_summary"),
  teamAlerts: jsonb("team_alerts"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_ds_date").on(table.date),
]);

export const chatThreadsTable = pgTable("chat_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title"),
  contextType: text("context_type").default("general"),
  contextId: text("context_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const chatMessagesTable = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id").references(() => chatThreadsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_cm_thread").on(table.threadId),
  index("idx_cm_created").on(table.createdAt),
]);

export const taskWorkNotesTable = pgTable("task_work_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull(),
  date: date("date").notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_twn_task").on(table.taskId),
  index("idx_twn_date").on(table.date),
]);
```

### Step 7: Add `status` column to the existing contacts table

The contacts table needs a `status` field that is SEPARATE from `contact_intelligence.stage`:

- **`contacts.status`** = temperature: `"Hot"` | `"Warm"` | `"Cold"` | `"New"` (quick visual indicator, dropdown on contact card)
- **`contact_intelligence.stage`** = pipeline position: `"new"` | `"outreach"` | `"engaged"` | `"meeting_scheduled"` | `"negotiating"` | `"closed"` | `"dormant"`

Find the existing contacts table definition (likely in `artifacts/api-server/src/routes/tcc/contacts.ts` or a schema file). Add this column if it does not already exist:

```typescript
status: text("status").default("New"),
// values: "Hot" | "Warm" | "Cold" | "New"
```

If the table is defined via raw SQL or a migration, run:

```sql
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'New';
```

**IMPORTANT: Do NOT add a generated column `days_since_contact` to any table.** The v1 schema had one using `NOW()`, which is not allowed in generated columns. Instead, compute days since last contact at query time:

```sql
-- Example: compute at query time, NOT as a stored/generated column
SELECT *, EXTRACT(DAY FROM NOW() - last_communication_date) AS days_since_contact
FROM contact_intelligence WHERE contact_id = $1;
```

### Step 8: Export all tables from the main barrel file

Wherever `contactsTable`, `callLogTable`, etc. are currently exported from, also re-export every table from `schema-v2.ts`:

```typescript
export {
  contactIntelligenceTable,
  communicationLogTable,
  contactBriefsTable,
  businessContextTable,
  dailySuggestionsTable,
  chatThreadsTable,
  chatMessagesTable,
  taskWorkNotesTable,
} from "./schema-v2";
```

### Step 9: Run the migration

After creating the schema file, run:

```bash
npx drizzle-kit push
```

This creates the 8 new tables in the database. Verify they exist via the Supabase dashboard or `\dt` in psql.

## VERIFY BEFORE MOVING ON

1. `GET /api/healthz` still returns `{ status: "ok" }`
2. `GET /api/brief/today` still returns brief data (using new Google auth)
3. All 8 new tables exist in the database: `contact_intelligence`, `communication_log`, `contact_briefs`, `business_context`, `daily_suggestions`, `chat_threads`, `chat_messages`, `task_work_notes`
4. The `contacts` table has a `status` column with default `'New'`
5. There is NO generated column called `days_since_contact` anywhere
6. Frontend still loads and works (check-in, journal, emails, schedule, sales all functional)
7. No console errors about missing Replit Connectors (those imports should be gone from gmail.ts and gcal.ts)
8. Env vars `CHECKIN_SHEET_ID` and `JOURNAL_DOC_ID` are set (or hardcoded defaults are used)

# Prompt 08: Google Drive Folder Structure + Sheets Sync + Document Ingestion

## CONTEXT

Tony's Command Center needs to organize files in Google Drive, sync key database tables ONE-WAY to Google Sheets (Supabase -> Sheet), write check-in data to a Google Sheet, append journal entries to a Google Doc, and ingest business plan + 90-day plan documents for AI context. Ethan's changes go through Cowork -> Supabase -> Sheet. Sheet edits are NOT synced back.

## PREREQUISITES

- Prompt 00 completed (`google-auth.ts` exists with `getDrive()`, `getSheets()`, and `getDocs()` helpers)
- `GOOGLE_REFRESH_TOKEN` env var has scopes: `drive.file`, `spreadsheets`, `documents`
- Supabase tables exist: `contacts`, `task_completions`, `communication_log`, `contact_intelligence`, `business_context`, `checkins`, `journal_entries`
- Hardcoded Google Sheet/Doc IDs (with env var override):
  - Check-in Sheet: `1DVys4rDcntlb3NmuKk4O2TRLV1YgkbtXLvuz4Xx2QBI`
  - Journal Doc: `1Rm2FGbA5m02QuSxhsZUE0TyOuHSVa7AFW02zp4Wj2Y4`
  - 90-Day Plan: `1b1Ejf6Tim1gevq0BoMeV7XZ2KuXrgP2E`

## WHAT TO BUILD

### Step 1: Create Drive helper library

**Create NEW file: `artifacts/api-server/src/lib/google-drive.ts`**

```typescript
import { getDrive } from "./google-auth";

const PARENT_FOLDER_NAME = "FlipIQ Command Center";

/**
 * Find or create a folder by name under a given parent.
 * Returns the folder ID.
 */
export async function createFolderIfNotExists(
  name: string,
  parentId?: string
): Promise<string> {
  const drive = getDrive();

  const query = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const existing = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id!;
  }

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id",
  });

  console.log(`[Drive] Created folder: ${name} (${folder.data.id})`);
  return folder.data.id!;
}

/**
 * Upload a file to a specific Drive folder. Returns the file ID.
 */
export async function uploadFile(params: {
  name: string;
  folderId: string;
  content: string | Buffer;
  mimeType?: string;
}): Promise<string> {
  const drive = getDrive();
  const { name, folderId, content, mimeType } = params;

  const media = {
    mimeType: mimeType || "text/plain",
    body: typeof content === "string"
      ? require("stream").Readable.from([content])
      : require("stream").Readable.from([content]),
  };

  const file = await drive.files.create({
    requestBody: {
      name,
      parents: [folderId],
    },
    media,
    fields: "id, webViewLink",
  });

  console.log(`[Drive] Uploaded file: ${name} (${file.data.id})`);
  return file.data.id!;
}

/**
 * Search for files in a folder by name query.
 */
export async function searchFiles(params: {
  folderId: string;
  nameContains?: string;
  mimeType?: string;
  maxResults?: number;
}): Promise<{ id: string; name: string; modifiedTime: string }[]> {
  const drive = getDrive();
  const { folderId, nameContains, mimeType, maxResults } = params;

  let query = `'${folderId}' in parents and trashed=false`;
  if (nameContains) query += ` and name contains '${nameContains}'`;
  if (mimeType) query += ` and mimeType='${mimeType}'`;

  const result = await drive.files.list({
    q: query,
    fields: "files(id, name, modifiedTime)",
    pageSize: maxResults || 50,
    orderBy: "modifiedTime desc",
  });

  return (result.data.files || []).map(f => ({
    id: f.id!,
    name: f.name!,
    modifiedTime: f.modifiedTime!,
  }));
}

/**
 * Read the text content of a Google Doc by its document ID.
 */
export async function readGoogleDoc(documentId: string): Promise<string> {
  const drive = getDrive();

  const result = await drive.files.export({
    fileId: documentId,
    mimeType: "text/plain",
  });

  return result.data as string;
}

/**
 * Get or create a contact-specific subfolder under "Contact Files".
 */
export async function getOrCreateContactFolder(
  contactFilesParentId: string,
  contactName: string
): Promise<string> {
  return createFolderIfNotExists(contactName, contactFilesParentId);
}
```

### Step 2: Create Sheets helper library

**Create NEW file: `artifacts/api-server/src/lib/google-sheets.ts`**

```typescript
import { getSheets } from "./google-auth";

/**
 * Append rows to a Google Sheet.
 */
export async function appendRow(
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][]
): Promise<number> {
  const sheets = getSheets();

  const result = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  return result.data.updates?.updatedRows || 0;
}

/**
 * Update a specific range in a sheet.
 */
export async function updateSheet(
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][]
): Promise<void> {
  const sheets = getSheets();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/**
 * Clear a range and write new data (full replace).
 */
export async function clearAndWrite(
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][]
): Promise<void> {
  const sheets = getSheets();

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range,
  });

  if (values.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
  }
}

/**
 * Read all values from a sheet range.
 */
export async function readSheet(
  spreadsheetId: string,
  range: string
): Promise<(string | number)[][]> {
  const sheets = getSheets();

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return (result.data.values || []) as (string | number)[][];
}
```

### Step 3: Create Google Docs helper

**Create NEW file: `artifacts/api-server/src/lib/google-docs.ts`**

```typescript
import { getDocs } from "./google-auth";

/**
 * Append text to the end of a Google Doc.
 * Adds a newline separator before the new content.
 */
export async function appendToDoc(
  documentId: string,
  text: string
): Promise<void> {
  const docs = getDocs();

  // First, get the document to find the end index
  const doc = await docs.documents.get({ documentId });
  const endIndex = doc.data.body?.content?.slice(-1)?.[0]?.endIndex || 1;

  // Insert text at the end (before the final newline)
  const insertIndex = Math.max(endIndex - 1, 1);

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: insertIndex },
            text: `\n\n---\n${text}`,
          },
        },
      ],
    },
  });

  console.log(`[Docs] Appended ${text.length} chars to doc ${documentId}`);
}
```

### Step 4: Create Drive folder setup script

**Create NEW file: `artifacts/api-server/src/scripts/setup-drive.ts`**

```typescript
import "dotenv/config";
import { createFolderIfNotExists } from "../lib/google-drive";

async function main() {
  console.log("[setup-drive] Creating FlipIQ Command Center folder structure...\n");

  // Root folder
  const rootId = await createFolderIfNotExists("FlipIQ Command Center");
  console.log(`  Root: FlipIQ Command Center (${rootId})`);

  // Transcripts and sub-folders
  const transcriptsId = await createFolderIfNotExists("Transcripts", rootId);
  console.log(`  Transcripts/ (${transcriptsId})`);

  const meetingsId = await createFolderIfNotExists("Meetings", transcriptsId);
  console.log(`    Meetings/ (${meetingsId})`);

  const callsId = await createFolderIfNotExists("Calls", transcriptsId);
  console.log(`    Calls/ (${callsId})`);

  const generalId = await createFolderIfNotExists("General", transcriptsId);
  console.log(`    General/ (${generalId})`);

  // Contact Files and sub-folders
  const contactFilesId = await createFolderIfNotExists("Contact Files", rootId);
  console.log(`  Contact Files/ (${contactFilesId})`);

  const teamId = await createFolderIfNotExists("Team", contactFilesId);
  console.log(`    Team/ (${teamId})`);

  const clientsId = await createFolderIfNotExists("Clients", contactFilesId);
  console.log(`    Clients/ (${clientsId})`);

  const prospectsId = await createFolderIfNotExists("Prospects", contactFilesId);
  console.log(`    Prospects/ (${prospectsId})`);

  const consultantsId = await createFolderIfNotExists("Consultants", contactFilesId);
  console.log(`    Consultants/ (${consultantsId})`);

  // Meeting Notes
  const meetingNotesId = await createFolderIfNotExists("Meeting Notes", rootId);
  console.log(`  Meeting Notes/ (${meetingNotesId})`);

  // Documents
  const documentsId = await createFolderIfNotExists("Documents", rootId);
  console.log(`  Documents/ (${documentsId})`);

  console.log("\n[setup-drive] Done! Save these folder IDs as env vars:");
  console.log(`  DRIVE_ROOT_FOLDER_ID=${rootId}`);
  console.log(`  DRIVE_TRANSCRIPTS_FOLDER_ID=${transcriptsId}`);
  console.log(`  DRIVE_TRANSCRIPTS_MEETINGS_ID=${meetingsId}`);
  console.log(`  DRIVE_TRANSCRIPTS_CALLS_ID=${callsId}`);
  console.log(`  DRIVE_TRANSCRIPTS_GENERAL_ID=${generalId}`);
  console.log(`  DRIVE_CONTACT_FILES_ID=${contactFilesId}`);
  console.log(`  DRIVE_CONTACT_FILES_TEAM_ID=${teamId}`);
  console.log(`  DRIVE_CONTACT_FILES_CLIENTS_ID=${clientsId}`);
  console.log(`  DRIVE_CONTACT_FILES_PROSPECTS_ID=${prospectsId}`);
  console.log(`  DRIVE_CONTACT_FILES_CONSULTANTS_ID=${consultantsId}`);
  console.log(`  DRIVE_MEETING_NOTES_ID=${meetingNotesId}`);
  console.log(`  DRIVE_DOCUMENTS_ID=${documentsId}`);
}

main().catch(err => {
  console.error("[setup-drive] Failed:", err);
  process.exit(1);
});
```

### Step 5: Create the ONE-WAY Sheets sync module (Supabase -> Sheet)

**Create NEW file: `artifacts/api-server/src/lib/sheets-sync.ts`**

This syncs 3 sheets: Master Task List, Contact Master, Communication Log (last 30 days). Direction is ONE-WAY: Supabase -> Sheet. Ethan's changes flow through Cowork -> Supabase -> Sheet.

```typescript
import { db } from "@workspace/db";
import { contactsTable, taskCompletionsTable, communicationLogTable } from "@workspace/db";
import { gte, sql } from "drizzle-orm";
import { clearAndWrite, appendRow } from "./google-sheets";

// Hardcoded defaults with env var override
const CONTACT_SHEET_ID = process.env.CONTACT_SHEET_ID || "";
const MASTER_TASK_SHEET_ID = process.env.MASTER_TASK_SHEET_ID || "";
const COMM_LOG_SHEET_ID = process.env.COMM_LOG_SHEET_ID || "";

let lastSyncedAt: Date = new Date(0);
let syncRunning = false;

const CONTACTS_HEADER = [
  "ID", "Name", "Company", "Email", "Phone", "Status", "Next Step",
  "Last Contact Date", "Created At", "Updated At",
];

const TASKS_HEADER = [
  "ID", "Task Text", "Category", "Completed At", "Source",
];

const COMM_LOG_HEADER = [
  "ID", "Contact Name", "Type", "Direction", "Summary", "Date", "Created At",
];

async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const error = err as { code?: number; status?: number };
    if (error.code === 429 || error.status === 429) {
      console.warn("[sheets-sync] Rate limited, backing off 10 seconds...");
      await new Promise(resolve => setTimeout(resolve, 10_000));
      return await fn();
    }
    throw err;
  }
}

/**
 * Sync contacts table to CONTACT_SHEET_ID (Contact Master).
 * Strategy: full replace (clearAndWrite).
 */
async function syncContacts(): Promise<number> {
  if (!CONTACT_SHEET_ID) return 0;

  const contacts = await db.select().from(contactsTable);

  const rows: (string | number | null)[][] = [
    CONTACTS_HEADER,
    ...contacts.map(c => [
      c.id,
      c.name || "",
      c.company || "",
      c.email || "",
      c.phone || "",
      c.status || "",
      c.nextStep || "",
      c.lastContactDate || "",
      c.createdAt ? new Date(c.createdAt).toISOString() : "",
      c.updatedAt ? new Date(c.updatedAt).toISOString() : "",
    ]),
  ];

  await withRateLimit(() => clearAndWrite(CONTACT_SHEET_ID, "Contacts!A1", rows));
  return contacts.length;
}

/**
 * Sync task completions to MASTER_TASK_SHEET_ID (Master Task List).
 * Strategy: incremental append.
 */
async function syncTaskCompletions(): Promise<number> {
  if (!MASTER_TASK_SHEET_ID) return 0;

  const newTasks = await db.select()
    .from(taskCompletionsTable)
    .where(gte(taskCompletionsTable.completedAt, lastSyncedAt));

  if (newTasks.length === 0) return 0;

  const rows = newTasks.map(t => [
    t.id,
    t.taskText || "",
    t.category || "",
    t.completedAt ? new Date(t.completedAt).toISOString() : "",
    "tcc",
  ]);

  await withRateLimit(() => appendRow(MASTER_TASK_SHEET_ID, "Tasks!A:E", rows));
  return newTasks.length;
}

/**
 * Sync communication log (last 30 days) to COMM_LOG_SHEET_ID.
 * Strategy: full replace (manageable size for 30-day window).
 */
async function syncCommunicationLog(): Promise<number> {
  if (!COMM_LOG_SHEET_ID) return 0;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const logs = await db.select()
    .from(communicationLogTable)
    .where(gte(communicationLogTable.createdAt, thirtyDaysAgo));

  const rows: (string | number | null)[][] = [
    COMM_LOG_HEADER,
    ...logs.map(l => [
      l.id,
      l.contactName || "",
      l.type || "",
      l.direction || "",
      l.summary || "",
      l.date || "",
      l.createdAt ? new Date(l.createdAt).toISOString() : "",
    ]),
  ];

  await withRateLimit(() => clearAndWrite(COMM_LOG_SHEET_ID, "Log!A1", rows));
  return logs.length;
}

/**
 * Main sync entry point. Runs all jobs sequentially to stay within rate limits.
 */
export async function runSync(): Promise<void> {
  if (syncRunning) {
    console.log("[sheets-sync] Sync already running, skipping");
    return;
  }

  syncRunning = true;
  const startTime = new Date();

  try {
    console.log(`[sheets-sync] Starting sync (last synced: ${lastSyncedAt.toISOString()})...`);

    const contactCount = await syncContacts();
    const taskCount = await syncTaskCompletions();
    const commCount = await syncCommunicationLog();

    lastSyncedAt = startTime;

    const duration = Date.now() - startTime.getTime();
    console.log(
      `[sheets-sync] Sync complete in ${duration}ms. ` +
      `Contacts: ${contactCount}, Tasks: ${taskCount}, CommLog: ${commCount}`
    );
  } catch (err) {
    console.error("[sheets-sync] Sync failed:", err);
  } finally {
    syncRunning = false;
  }
}

/**
 * Start the sync loop. Call once from index.ts on server startup.
 * Runs every 5 minutes.
 */
export function startSyncLoop(): void {
  if (!CONTACT_SHEET_ID && !MASTER_TASK_SHEET_ID && !COMM_LOG_SHEET_ID) {
    console.log("[sheets-sync] No sheet IDs configured, sync disabled");
    return;
  }

  const SYNC_INTERVAL = 5 * 60 * 1000;

  setTimeout(() => { runSync(); }, 30_000);
  setInterval(() => { runSync(); }, SYNC_INTERVAL);

  console.log("[sheets-sync] Sync loop started (every 5 minutes)");
}
```

### Step 6: Check-in -> Google Sheet write (Story 1.4)

**File: `artifacts/api-server/src/routes/tcc/checkin.ts`**

After saving the check-in to Supabase, also append to the check-in Google Sheet. Add this at the top:

```typescript
import { appendRow } from "../../lib/google-sheets";

const CHECKIN_SHEET_ID = process.env.CHECKIN_SHEET_ID || "1DVys4rDcntlb3NmuKk4O2TRLV1YgkbtXLvuz4Xx2QBI";
```

After the `db.insert(checkinsTable)...` call in the POST handler, add:

```typescript
// Append check-in to Google Sheet (non-blocking, non-critical)
appendRow(CHECKIN_SHEET_ID, "Checkins!A:Z", [[
  new Date().toISOString(),
  ck.bed || "",
  ck.wake || "",
  ck.sleep || "",
  ck.workout ? "Yes" : "No",
  ck.bible ? "Yes" : "No",
  ck.mood || "",
  ck.energy || "",
  ck.notes || "",
]]).catch(err => console.warn("[checkin] Sheet write failed:", err));
```

### Step 7: Journal -> Google Doc append (Story 1.5)

**File: `artifacts/api-server/src/routes/tcc/journal.ts`**

After saving the journal entry to Supabase, also append to the journal Google Doc. Add at the top:

```typescript
import { appendToDoc } from "../../lib/google-docs";

const JOURNAL_DOC_ID = process.env.JOURNAL_DOC_ID || "1Rm2FGbA5m02QuSxhsZUE0TyOuHSVa7AFW02zp4Wj2Y4";
```

After the `db.insert(journalEntriesTable)...` call in the POST handler, add:

```typescript
// Append journal entry to Google Doc (non-blocking, non-critical)
const dateStr = new Date().toLocaleDateString("en-US", {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
});
const timeStr = new Date().toLocaleTimeString("en-US", {
  hour: "numeric", minute: "2-digit",
});

appendToDoc(JOURNAL_DOC_ID, `${dateStr} at ${timeStr}\n\n${journalText}`)
  .catch(err => console.warn("[journal] Doc append failed:", err));
```

### Step 8: Business plan + 90-day plan ingestion (Story 5.5)

**Create NEW file: `artifacts/api-server/src/lib/business-context-sync.ts`**

Daily at 4 AM, read Google Drive docs and save to `business_context` table.

```typescript
import { db } from "@workspace/db";
import { businessContextTable } from "./schema-v2";
import { eq } from "drizzle-orm";
import { readGoogleDoc } from "./google-drive";

// Hardcoded defaults with env var override
const NINETY_DAY_PLAN_DOC_ID = process.env.NINETY_DAY_PLAN_DOC_ID || "1b1Ejf6Tim1gevq0BoMeV7XZ2KuXrgP2E";
const BUSINESS_PLAN_DOC_ID = process.env.BUSINESS_PLAN_DOC_ID || "";

/**
 * Ingest business plan and 90-day plan from Google Docs into business_context table.
 */
export async function ingestBusinessContext(): Promise<void> {
  console.log("[business-context] Starting ingestion...");

  // Ingest 90-day plan
  if (NINETY_DAY_PLAN_DOC_ID) {
    try {
      const content = await readGoogleDoc(NINETY_DAY_PLAN_DOC_ID);
      await db.insert(businessContextTable).values({
        documentType: "90_day_plan",
        sourceDocId: NINETY_DAY_PLAN_DOC_ID,
        content: content.substring(0, 50000), // Cap at 50k chars
        ingestedAt: new Date(),
      }).onConflictDoUpdate({
        target: businessContextTable.documentType,
        set: {
          content: content.substring(0, 50000),
          sourceDocId: NINETY_DAY_PLAN_DOC_ID,
          ingestedAt: new Date(),
        },
      });
      console.log(`[business-context] 90-day plan ingested (${content.length} chars)`);
    } catch (err) {
      console.warn("[business-context] Failed to ingest 90-day plan:", err);
    }
  }

  // Ingest business plan
  if (BUSINESS_PLAN_DOC_ID) {
    try {
      const content = await readGoogleDoc(BUSINESS_PLAN_DOC_ID);
      await db.insert(businessContextTable).values({
        documentType: "business_plan",
        sourceDocId: BUSINESS_PLAN_DOC_ID,
        content: content.substring(0, 50000),
        ingestedAt: new Date(),
      }).onConflictDoUpdate({
        target: businessContextTable.documentType,
        set: {
          content: content.substring(0, 50000),
          sourceDocId: BUSINESS_PLAN_DOC_ID,
          ingestedAt: new Date(),
        },
      });
      console.log(`[business-context] Business plan ingested (${content.length} chars)`);
    } catch (err) {
      console.warn("[business-context] Failed to ingest business plan:", err);
    }
  }

  console.log("[business-context] Ingestion complete");
}

/**
 * Start the daily ingestion loop. Runs at 4 AM Pacific daily.
 */
export function startBusinessContextLoop(): void {
  if (!NINETY_DAY_PLAN_DOC_ID && !BUSINESS_PLAN_DOC_ID) {
    console.log("[business-context] No doc IDs configured, ingestion disabled");
    return;
  }

  // Run immediately on startup (with 60s delay to let server initialize)
  setTimeout(() => { ingestBusinessContext(); }, 60_000);

  // Then check every hour if it's 4 AM Pacific
  setInterval(() => {
    const now = new Date();
    const pacific = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const hour = pacific.getHours();
    const minute = pacific.getMinutes();

    // Run at 4:00 AM Pacific (within the first few minutes of the hour)
    if (hour === 4 && minute < 5) {
      ingestBusinessContext();
    }
  }, 60 * 60 * 1000); // Check every hour

  console.log("[business-context] Ingestion loop started (daily at 4 AM Pacific)");
}
```

### Step 9: Wire everything into the server

**File: `artifacts/api-server/src/index.ts`**

Add imports near the top:

```typescript
import { startSyncLoop } from "./lib/sheets-sync";
import { startBusinessContextLoop } from "./lib/business-context-sync";
```

After the `app.listen(...)` call, add:

```typescript
// Start Google Sheets sync loop (ONE-WAY: Supabase -> Sheet)
startSyncLoop();

// Start business context ingestion loop (daily at 4 AM Pacific)
startBusinessContextLoop();
```

### Step 10: Add a manual sync trigger route

**Create NEW file: `artifacts/api-server/src/routes/tcc/sheets-sync.ts`**

```typescript
import { Router, type IRouter } from "express";
import { runSync } from "../../lib/sheets-sync";
import { ingestBusinessContext } from "../../lib/business-context-sync";

const router: IRouter = Router();

router.post("/sheets/sync", async (_req, res): Promise<void> => {
  try {
    await runSync();
    res.json({ ok: true, message: "Sync completed" });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.post("/business-context/ingest", async (_req, res): Promise<void> => {
  try {
    await ingestBusinessContext();
    res.json({ ok: true, message: "Business context ingested" });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
```

**File: `artifacts/api-server/src/routes/index.ts`** — Add:

```typescript
import sheetsSyncRouter from "./tcc/sheets-sync";
router.use(sheetsSyncRouter);
```

### Step 11: Add env vars

Add these to your `.env` file:

```
# Google Drive folder IDs (populated by running setup-drive.ts)
DRIVE_ROOT_FOLDER_ID=
DRIVE_TRANSCRIPTS_FOLDER_ID=
DRIVE_TRANSCRIPTS_MEETINGS_ID=
DRIVE_TRANSCRIPTS_CALLS_ID=
DRIVE_TRANSCRIPTS_GENERAL_ID=
DRIVE_CONTACT_FILES_ID=
DRIVE_CONTACT_FILES_TEAM_ID=
DRIVE_CONTACT_FILES_CLIENTS_ID=
DRIVE_CONTACT_FILES_PROSPECTS_ID=
DRIVE_CONTACT_FILES_CONSULTANTS_ID=
DRIVE_MEETING_NOTES_ID=
DRIVE_DOCUMENTS_ID=

# Google Sheets IDs (create these sheets manually or use defaults)
CONTACT_SHEET_ID=
MASTER_TASK_SHEET_ID=
COMM_LOG_SHEET_ID=

# Check-in Sheet (hardcoded default, env var override)
CHECKIN_SHEET_ID=1DVys4rDcntlb3NmuKk4O2TRLV1YgkbtXLvuz4Xx2QBI

# Journal Google Doc (hardcoded default, env var override)
JOURNAL_DOC_ID=1Rm2FGbA5m02QuSxhsZUE0TyOuHSVa7AFW02zp4Wj2Y4

# Business Context Docs (hardcoded default for 90-day plan)
NINETY_DAY_PLAN_DOC_ID=1b1Ejf6Tim1gevq0BoMeV7XZ2KuXrgP2E
BUSINESS_PLAN_DOC_ID=
```

## VERIFY BEFORE MOVING ON

1. Run `npx tsx src/scripts/setup-drive.ts` — it creates the full folder structure: `FlipIQ Command Center / { Transcripts/{Meetings,Calls,General}, Contact Files/{Team,Clients,Prospects,Consultants}, Meeting Notes, Documents }`. Verify folders exist in Drive.
2. Copy the printed folder IDs into your `.env` file.
3. Create Google Sheets for contacts, tasks, and communication log. Copy their IDs into env vars.
4. Start the server — console shows `[sheets-sync] Sync loop started (every 5 minutes)` and `[business-context] Ingestion loop started (daily at 4 AM Pacific)`.
5. After ~30 seconds, console shows sync completing. Check the Contacts sheet — it should have all contacts with headers.
6. **Check-in -> Sheet:** Complete a check-in in the app. Verify data appears in the check-in sheet (`1DVys4rDcntlb3NmuKk4O2TRLV1YgkbtXLvuz4Xx2QBI`).
7. **Journal -> Doc:** Submit a journal entry. Verify the entry is appended to the journal doc (`1Rm2FGbA5m02QuSxhsZUE0TyOuHSVa7AFW02zp4Wj2Y4`) with date header.
8. **Business context ingestion:** Call `POST /api/business-context/ingest`. Verify the `business_context` table has rows for `90_day_plan` (and `business_plan` if configured) with content from the Google Docs.
9. **Communication log sync:** Verify the comm log sheet shows the last 30 days of communication data.
10. **One-way flow confirmed:** Edit a cell in the Google Sheet. Wait for sync. The edit is NOT reflected in Supabase (one-way only).
11. Server starts and runs normally with no Sheets env vars set (sync is skipped gracefully).

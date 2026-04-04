import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { contactsTable } from "@workspace/db";
import { appendToSheet, getSheetValues } from "../../lib/google-sheets";
import { readGoogleDoc } from "../../lib/google-drive";
import { businessContextTable, contactIntelligenceTable, communicationLogTable } from "../../lib/schema-v2";
import { eq, desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getSheets } from "../../lib/google-auth";
import { todayPacific } from "../../lib/dates";

const router: IRouter = Router();

const CHECKIN_SHEET_ID = process.env.CHECKIN_SHEET_ID || "1rMLE_RhdRDsC2dqRs8eIiF6bySCAkMvy1k4JlHKkRMw";
const BUSINESS_MASTER_SHEET_ID = process.env.BUSINESS_MASTER_SHEET_ID || "";
const JOURNAL_DOC_ID = process.env.JOURNAL_DOC_ID || "1kQjIFa903luN-62HkUD0tPGAmeQPC7JMN6rfnbvXYRE";
const PLAN_90_DAY_ID = process.env.PLAN_90_DAY_ID || "1b1Ejf6Tim1gevq0BoMeV7XZ2KuXrgP2E";

// ─── Business Master Sheet sync helpers ─────────────────────────────────────

async function clearAndWriteTab(spreadsheetId: string, tabName: string, rows: (string | number | null)[][]): Promise<void> {
  const sheets = getSheets();
  // Clear the tab first
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tabName}!A:Z`,
  });
  if (rows.length === 0) return;
  // Write new data
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}

export async function syncTasksTab(): Promise<void> {
  if (!BUSINESS_MASTER_SHEET_ID) return;
  try {
    const { taskCompletionsTable } = await import("@workspace/db");
    const tasks = await db.select().from(taskCompletionsTable).orderBy(desc(taskCompletionsTable.completedAt)).limit(500);
    const header = ["Task ID", "Task Text", "Completed At"];
    const rows: (string | null)[][] = tasks.map(t => [
      t.taskId,
      t.taskText,
      t.completedAt ? new Date(t.completedAt).toISOString() : null,
    ]);
    await clearAndWriteTab(BUSINESS_MASTER_SHEET_ID, "Tasks", [header, ...rows]);
    console.log(`[sheets-sync] Tasks tab synced: ${rows.length} rows`);
  } catch (err) {
    console.warn("[sheets-sync] syncTasksTab failed:", (err as Error).message);
  }
}

export async function syncContactsTab(): Promise<void> {
  if (!BUSINESS_MASTER_SHEET_ID) return;
  try {
    const contacts = await db.select().from(contactsTable).orderBy(desc(contactsTable.updatedAt)).limit(2000);
    const header = ["ID", "Name", "Company", "Status", "Phone", "Email", "Type", "Pipeline Stage", "Next Step", "Last Contact", "Created At"];
    const rows: (string | null)[][] = contacts.map(c => [
      c.id,
      c.name,
      c.company || null,
      c.status || null,
      c.phone || null,
      c.email || null,
      c.type || null,
      c.pipelineStage || null,
      c.nextStep || null,
      c.lastContactDate || null,
      c.createdAt ? new Date(c.createdAt).toISOString() : null,
    ]);
    await clearAndWriteTab(BUSINESS_MASTER_SHEET_ID, "Contacts", [header, ...rows]);
    console.log(`[sheets-sync] Contacts tab synced: ${rows.length} rows`);
  } catch (err) {
    console.warn("[sheets-sync] syncContactsTab failed:", (err as Error).message);
  }
}

export async function syncCommsTab(): Promise<void> {
  if (!BUSINESS_MASTER_SHEET_ID) return;
  try {
    const comms = await db.select().from(communicationLogTable).orderBy(desc(communicationLogTable.loggedAt)).limit(2000);
    const header = ["ID", "Contact Name", "Channel", "Direction", "Subject", "Summary", "Logged At"];
    const rows: (string | null)[][] = comms.map(c => [
      c.id,
      c.contactName || null,
      c.channel,
      c.direction || null,
      c.subject || null,
      c.summary || null,
      c.loggedAt ? new Date(c.loggedAt).toISOString() : null,
    ]);
    await clearAndWriteTab(BUSINESS_MASTER_SHEET_ID, "Comms", [header, ...rows]);
    console.log(`[sheets-sync] Comms tab synced: ${rows.length} rows`);
  } catch (err) {
    console.warn("[sheets-sync] syncCommsTab failed:", (err as Error).message);
  }
}

export function startAutoSync(): void {
  if (!BUSINESS_MASTER_SHEET_ID) {
    console.log("[sheets-sync] BUSINESS_MASTER_SHEET_ID not set — Business Master Sheet sync disabled");
    return;
  }
  console.log("[sheets-sync] Starting Business Master Sheet auto-sync (every 5 minutes)");
  const runSync = async () => {
    await Promise.allSettled([syncTasksTab(), syncContactsTab(), syncCommsTab()]);
  };
  // Run immediately on startup, then every 5 minutes
  runSync();
  setInterval(runSync, 5 * 60 * 1000);
}

// ─── Check-in append — with deduplication on today's date ─────────────────────

router.post("/sheets/checkin-append", async (req, res): Promise<void> => {
  try {
    const { date, bedtime, waketime, sleepHours, bible, workout, journal, nutrition, unplug } = req.body;
    const today = date || todayPacific();

    // Deduplication: check if today already has a check-in row
    try {
      const existing = await getSheetValues(CHECKIN_SHEET_ID, "Daily Check-in!A:A");
      const alreadyLogged = existing.some(row => row[0] === today);
      if (alreadyLogged) {
        res.json({ ok: true, skipped: true, reason: `Check-in for ${today} already logged` });
        return;
      }
    } catch { /* if sheet doesn't exist yet, proceed */ }

    const row = [
      today,
      bedtime || "",
      waketime || "",
      sleepHours || "",
      bible ? "Yes" : "No",
      workout ? "Yes" : "No",
      journal ? "Yes" : "No",
      nutrition || "",
      unplug ? "Yes" : "No",
      new Date().toLocaleTimeString("en-US"),
    ];

    await appendToSheet(CHECKIN_SHEET_ID, "Daily Check-in", row);
    res.json({ ok: true, row });
  } catch (err) {
    console.warn("[sheets-sync] checkin-append failed:", (err as Error).message);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ─── Manual Business Master Sheet sync endpoint ────────────────────────────

router.post("/sheets/sync-master", async (req, res): Promise<void> => {
  if (!BUSINESS_MASTER_SHEET_ID) {
    res.status(400).json({ ok: false, error: "BUSINESS_MASTER_SHEET_ID not configured" });
    return;
  }
  try {
    await Promise.allSettled([syncTasksTab(), syncContactsTab(), syncCommsTab()]);
    res.json({ ok: true, synced: ["Tasks", "Contacts", "Comms"] });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ─── Ingest 90-day plan document into business_context table ─────────────────

router.post("/sheets/ingest-90-day-plan", async (req, res): Promise<void> => {
  try {
    const docText = await readGoogleDoc(PLAN_90_DAY_ID);

    if (!docText || docText.length < 50) {
      res.json({ ok: false, error: "Document appears empty or too short" });
      return;
    }

    // Use Claude to summarize the document
    let summary = docText.substring(0, 500);
    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 256,
        messages: [{
          role: "user",
          content: `Summarize this 90-day business plan in 3-4 concise sentences for an AI context window:\n\n${docText.substring(0, 3000)}`,
        }],
      });
      const block = msg.content[0];
      if (block.type === "text") summary = block.text;
    } catch { /* use substring fallback */ }

    await db.insert(businessContextTable).values({
      documentType: "90_day_plan",
      content: docText.substring(0, 10000),
      summary,
      lastUpdated: new Date(),
    }).onConflictDoUpdate({
      target: businessContextTable.documentType,
      set: { content: docText.substring(0, 10000), summary, lastUpdated: new Date() },
    });

    res.json({ ok: true, contentLength: docText.length, summary });
  } catch (err) {
    console.warn("[sheets-sync] ingest-90-day-plan failed:", (err as Error).message);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ─── Get business context (for AI use) ───────────────────────────────────────

router.get("/business-context", async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(businessContextTable);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Upsert a business context document manually ──────────────────────────────

router.post("/business-context", async (req, res): Promise<void> => {
  const { documentType, content, summary } = req.body;
  if (!documentType || !content) {
    res.status(400).json({ error: "documentType and content required" });
    return;
  }

  try {
    const [row] = await db.insert(businessContextTable).values({
      documentType,
      content,
      summary: summary || content.substring(0, 200),
      lastUpdated: new Date(),
    }).onConflictDoUpdate({
      target: businessContextTable.documentType,
      set: { content, summary: summary || content.substring(0, 200), lastUpdated: new Date() },
    }).returning();

    res.json(row);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

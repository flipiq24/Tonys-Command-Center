import { Router, type IRouter } from "express";
import { db, contactNotesTable } from "@workspace/db";
import { contactsTable } from "@workspace/db";
import { appendToSheet, getSheetValues, getSheetsClient } from "../../lib/google-sheets";
import { readGoogleDoc } from "../../lib/google-drive";
import { businessContextTable, contactIntelligenceTable, communicationLogTable, planItemsTable } from "../../lib/schema-v2";
import { sync411FromSheet, syncTeamFromSheet } from "./business";
import { eq, desc, asc } from "drizzle-orm";
import { anthropic, createTrackedMessage } from "@workspace/integrations-anthropic-ai";
import { todayPacific } from "../../lib/dates";

const router: IRouter = Router();

const CHECKIN_SHEET_ID = process.env.CHECKIN_SHEET_ID || "1rMLE_RhdRDsC2dqRs8eIiF6bySCAkMvy1k4JlHKkRMw";
const BUSINESS_MASTER_SHEET_ID = process.env.BUSINESS_MASTER_SHEET_ID || "1WGuJwCoWbwyFamXXP79yxnPmYhdFPgOGhOR8_V-EQyw";
const JOURNAL_DOC_ID = process.env.JOURNAL_DOC_ID || "1kQjIFa903luN-62HkUD0tPGAmeQPC7JMN6rfnbvXYRE";
const PLAN_90_DAY_ID = process.env.PLAN_90_DAY_ID || "1b1Ejf6Tim1gevq0BoMeV7XZ2KuXrgP2E";
const BUSINESS_PLAN_ID = process.env.BUSINESS_PLAN_ID || "";

// ─── Business Master Sheet sync helpers ─────────────────────────────────────

async function clearAndWriteTab(spreadsheetId: string, tabName: string, rows: (string | number | null)[][]): Promise<void> {
  const sheets = await getSheetsClient();
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
    // Pull all plan tasks (the real task system — 411 Plan)
    const planTasks = await db.select().from(planItemsTable)
      .where(eq(planItemsTable.level, "task"))
      .orderBy(asc(planItemsTable.priorityOrder))
      .limit(500);

    const header = [
      "Task", "Source", "Owner", "Priority", "Status",
      "Category", "Completed Date", "Due Date", "Notes",
      "Atomic KPI", "Linear ID",
    ];
    const rows: (string | number | null)[][] = planTasks.map(t => [
      t.title,
      t.source || "manual",
      t.owner || "Unassigned",
      t.priority || "P2",
      t.status === "completed" ? "Completed" : "Active",
      t.category || null,
      t.completedAt ? new Date(t.completedAt).toLocaleDateString("en-US") : null,
      t.dueDate || null,
      t.workNotes || null,
      t.atomicKpi || null,
      t.linearId || null,
    ]);

    await clearAndWriteTab(BUSINESS_MASTER_SHEET_ID, "Master Task List", [header, ...rows]);
    console.log(`[sheets-sync] Tasks tab synced: ${rows.length} rows (11 columns)`);
  } catch (err) {
    console.warn("[sheets-sync] syncTasksTab failed:", (err as Error).message);
  }
}

export async function syncContactsTab(): Promise<void> {
  if (!BUSINESS_MASTER_SHEET_ID) return;
  try {
    const contacts = await db.select().from(contactsTable).orderBy(desc(contactsTable.updatedAt)).limit(10000);

    // Fetch notes, activity, and meetings for all contacts in bulk
    const [allNotes, allComms] = await Promise.all([
      db.select().from(contactNotesTable).orderBy(desc(contactNotesTable.createdAt)).limit(50000),
      db.select().from(communicationLogTable).orderBy(desc(communicationLogTable.loggedAt)).limit(50000),
    ]);
    const notesByContact = new Map<string, string[]>();
    for (const n of allNotes) {
      if (!n.contactId) continue;
      const arr = notesByContact.get(n.contactId) || [];
      arr.push(`Note ${arr.length + 1}: ${(n.text || "").substring(0, 200)}`);
      notesByContact.set(n.contactId, arr);
    }
    const commsByContact = new Map<string, string[]>();
    for (const c of allComms) {
      if (!c.contactId) continue;
      const arr = commsByContact.get(c.contactId) || [];
      const dateStr = c.loggedAt ? new Date(c.loggedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }) : "";
      let summary = (c.summary || c.subject || "").substring(0, 150).replace(/```[\s\S]*?```/g, "").replace(/\{[\s\S]*?\}/g, "").replace(/\n/g, " ").trim();
      arr.push(`${c.channel || "unknown"} (${dateStr}): ${summary}`);
      commsByContact.set(c.contactId, arr);
    }

    const header = [
      "ID", "Name", "Company", "Status", "Pipeline Stage", "Phone", "Email",
      "Type", "Category", "Title", "Lead Source", "Source",
      "Deal Value", "Probability", "Follow-Up Date", "Expected Close",
      "Next Step", "LinkedIn", "Website", "Tags",
      "Last Contact Date", "Notes", "Activity Log",
      "Created At", "Updated At",
    ];
    const rows: (string | null)[][] = contacts.map(c => [
      c.id,
      c.name,
      c.company || null,
      c.status || null,
      c.pipelineStage || null,
      c.phone || null,
      c.email || null,
      c.type || null,
      c.category || null,
      c.title || null,
      c.leadSource || null,
      c.source || null,
      c.dealValue ? String(c.dealValue) : null,
      c.dealProbability ? String(c.dealProbability) : null,
      c.followUpDate || null,
      c.expectedCloseDate || null,
      c.nextStep || null,
      c.linkedinUrl || null,
      c.website || null,
      c.tags ? (c.tags as string[]).join(", ") : null,
      c.lastContactDate || null,
      (notesByContact.get(c.id) || []).join("\n") || null,
      (commsByContact.get(c.id) || []).slice(0, 10).join("\n") || null,
      c.createdAt ? new Date(c.createdAt).toISOString() : null,
      c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    ]);
    await clearAndWriteTab(BUSINESS_MASTER_SHEET_ID, "Contact Master", [header, ...rows]);
    console.log(`[sheets-sync] Contacts tab synced: ${rows.length} rows (${header.length} columns)`);
  } catch (err) {
    console.warn("[sheets-sync] syncContactsTab failed:", (err as Error).message);
  }
}

export async function syncCommsTab(): Promise<void> {
  if (!BUSINESS_MASTER_SHEET_ID) return;
  try {
    const comms = await db.select().from(communicationLogTable).orderBy(desc(communicationLogTable.loggedAt)).limit(50000);
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
    await clearAndWriteTab(BUSINESS_MASTER_SHEET_ID, "Communication Log", [header, ...rows]);
    console.log(`[sheets-sync] Comms tab synced: ${rows.length} rows`);
  } catch (err) {
    console.warn("[sheets-sync] syncCommsTab failed:", (err as Error).message);
  }
}

export async function syncContextIngest(): Promise<void> {
  try {
    const docText = await readGoogleDoc(PLAN_90_DAY_ID);
    if (!docText || docText.length < 50) {
      console.warn("[sheets-sync] syncContextIngest: 90-day plan document appears empty");
      return;
    }
    let summary = docText.substring(0, 500);
    try {
      const msg = await createTrackedMessage("sheets_sync", {
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
    console.log(`[sheets-sync] syncContextIngest: 90-day plan ingested (${docText.length} chars)`);
  } catch (err) {
    console.warn("[sheets-sync] syncContextIngest failed:", (err as Error).message);
  }
}

export function startAutoSync(): void {
  if (!BUSINESS_MASTER_SHEET_ID) {
    console.log("[sheets-sync] BUSINESS_MASTER_SHEET_ID not set — Business Master Sheet sync disabled");
    return;
  }
  console.log("[sheets-sync] Starting Business Master Sheet auto-sync (every 5 minutes)");
  const runSync = async () => {
    await Promise.allSettled([syncTasksTab(), syncContactsTab(), syncCommsTab(), sync411FromSheet(), syncTeamFromSheet()]);
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
    await Promise.allSettled([syncTasksTab(), syncContactsTab(), syncCommsTab(), sync411FromSheet(), syncTeamFromSheet()]);
    res.json({ ok: true, synced: ["Tasks", "Contacts", "Comms", "411 Goals", "Team"] });
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
      const msg = await createTrackedMessage("sheets_sync", {
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

router.post("/sheets/ingest-business-plan", async (_req, res): Promise<void> => {
  try {
    if (!BUSINESS_PLAN_ID) {
      res.json({ ok: false, error: "BUSINESS_PLAN_ID not configured" });
      return;
    }
    const docText = await readGoogleDoc(BUSINESS_PLAN_ID);
    if (!docText || docText.length < 50) {
      res.json({ ok: false, error: "Document appears empty or too short" });
      return;
    }
    let summary = docText.substring(0, 500);
    try {
      const msg = await createTrackedMessage("sheets_sync", {
        model: "claude-haiku-4-5",
        max_tokens: 256,
        messages: [{
          role: "user",
          content: `Summarize this business plan in 3-4 concise sentences for an AI context window:\n\n${docText.substring(0, 3000)}`,
        }],
      });
      const block = msg.content[0];
      if (block.type === "text") summary = block.text;
    } catch { /* use substring fallback */ }

    await db.insert(businessContextTable).values({
      documentType: "business_plan",
      content: docText.substring(0, 10000),
      summary,
      lastUpdated: new Date(),
    }).onConflictDoUpdate({
      target: businessContextTable.documentType,
      set: { content: docText.substring(0, 10000), summary, lastUpdated: new Date() },
    });

    res.json({ ok: true, contentLength: docText.length, summary });
  } catch (err) {
    console.warn("[sheets-sync] ingest-business-plan failed:", (err as Error).message);
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

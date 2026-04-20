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

    // Build id → title map for resolving parentTaskId to parent master's title
    const idToTitle = new Map(planTasks.map(t => [t.id, t.title]));

    const header = [
      "Task", "Type", "Sub-Type", "Source", "Owner", "Co-Owner", "Priority", "Status",
      "Category", "Subcategory", "Execution Tier", "Completed Date", "Due Date", "Notes",
      "Atomic KPI", "Linear ID",
    ];
    const rows: (string | number | null)[][] = planTasks.map(t => {
      const typeLabel = t.taskType === "subtask" ? "Sub" : t.taskType === "note" ? "Note" : "Master";
      const subType = t.parentTaskId ? (idToTitle.get(t.parentTaskId) || "") : "";
      return [
        t.title,
        typeLabel,
        subType,
        t.source || "manual",
        t.owner || "Unassigned",
        t.coOwner || null,
        t.priority || "P2",
        t.status === "completed" ? "Completed" : "Active",
        t.category || null,
        t.subcategory || null,
        t.executionTier || null,
        t.completedAt ? new Date(t.completedAt).toLocaleDateString("en-US") : null,
        t.dueDate || null,
        t.workNotes || null,
        t.atomicKpi || null,
        t.linearId || null,
      ];
    });

    await clearAndWriteTab(BUSINESS_MASTER_SHEET_ID, "Master Task List", [header, ...rows]);
    console.log(`[sheets-sync] Tasks tab synced: ${rows.length} rows (${header.length} columns)`);
  } catch (err) {
    console.warn("[sheets-sync] syncTasksTab failed:", (err as Error).message);
  }
}

// ─── Sheets → DB FULL RESYNC ───
// Flushes all level="task" rows in DB, then re-imports everything from "Master Task List" sheet.
// Uses Sprint ID pattern to determine hierarchy:
//   - ADP-02 = master
//   - ADP-02.1, ADP-02.3 = sub-tasks of ADP-02 (parent inferred by stripping decimal)
// Category/subcategory rows (level != "task") are left untouched.
export async function syncTasksFromSheet(): Promise<{ ok: boolean; inserted: number; masters: number; subs: number; skipped: number; flushed: number; error?: string }> {
  if (!BUSINESS_MASTER_SHEET_ID) return { ok: false, inserted: 0, masters: 0, subs: 0, skipped: 0, flushed: 0, error: "BUSINESS_MASTER_SHEET_ID not set" };
  try {
    const rows = await getSheetValues(BUSINESS_MASTER_SHEET_ID, "Master Task List!A:Z");
    console.log(`[sheets-sync] syncTasksFromSheet: fetched ${rows.length} rows from sheet`);
    if (rows.length < 2) return { ok: false, inserted: 0, masters: 0, subs: 0, skipped: 0, flushed: 0, error: `Sheet returned only ${rows.length} rows. Check tab name 'Master Task List' or sheet permissions.` };

    const header = rows[0].map(h => (h || "").toString().trim().toLowerCase());
    const idx = (...names: string[]) => {
      for (const n of names) {
        const i = header.indexOf(n.toLowerCase());
        if (i >= 0) return i;
      }
      return -1;
    };
    const sprintIdIdx = idx("sprint id", "sprintid");
    const typeIdx = idx("type");
    const titleIdx = idx("task", "title");
    const sourceIdx = idx("source");
    const ownerIdx = idx("owner");
    const coOwnerIdx = idx("co-owner", "coowner");
    const priorityIdx = idx("priority");
    const statusIdx = idx("status");
    const categoryIdx = idx("category");
    const subcategoryIdx = idx("subcategory", "sub-category");
    const tierIdx = idx("execution tier", "tier");
    const completedIdx = idx("completed date", "completed");
    const dueIdx = idx("due date", "due");
    const notesIdx = idx("notes");
    const kpiIdx = idx("atomic kpi", "kpi");
    const linearIdx = idx("linear id");

    if (sprintIdIdx === -1) return { ok: false, inserted: 0, masters: 0, subs: 0, skipped: 0, flushed: 0, error: `'Sprint ID' column not found. Headers seen: ${JSON.stringify(header)}` };
    if (titleIdx === -1) return { ok: false, inserted: 0, masters: 0, subs: 0, skipped: 0, flushed: 0, error: `'Task' column not found. Headers seen: ${JSON.stringify(header)}` };

    const normalizeCategory = (c: string) => (c || "").toLowerCase().trim();
    const normalizeStatus = (s: string): string => {
      const v = (s || "").toLowerCase().trim();
      if (v === "completed" || v === "done") return "completed";
      if (v === "not started" || v === "pending") return "pending";
      return "active";
    };
    const normalizePriority = (p: string): string => {
      const v = (p || "").toUpperCase().trim();
      return v === "P0" || v === "P1" || v === "P2" ? v : "P2";
    };
    const stripTreePrefix = (t: string) => t.replace(/^[└├─│\s]+/, "").trim();
    const parseDate = (d: string): string | null => {
      if (!d) return null;
      const trimmed = d.trim();
      if (!trimmed) return null;
      // Accept YYYY-MM-DD directly; try parsing other formats
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      const parsed = new Date(trimmed);
      if (isNaN(parsed.getTime())) return null;
      return parsed.toISOString().split("T")[0];
    };
    // Week is now derived from dueDate on read (see /plan/weekly). We only store `month`.
    const monthFromDate = (d: string | null): string | null => d?.match(/^(\d{4}-\d{2})/)?.[1] ?? null;

    interface SheetRow {
      sprintId: string;
      parentSprintId: string | null;
      isSub: boolean;
      typeHint: string; // "Master" | "Sub" | "Note" | ""
      title: string;
      category: string;
      subcategory: string;
      owner: string;
      coOwner: string;
      priority: string;
      status: string;
      tier: string;
      dueDate: string | null;
      completedDate: string | null;
      notes: string;
      kpi: string;
      source: string;
      linearId: string;
    }

    const sheetRows: SheetRow[] = [];
    let skipped = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const sprintId = (row[sprintIdIdx] || "").toString().trim();
      const title = stripTreePrefix((row[titleIdx] || "").toString());
      if (!sprintId || !title) { skipped++; continue; }
      const decimalMatch = sprintId.match(/^([A-Z]+-\d+)\.(\d+)$/);
      const isSub = !!decimalMatch;
      const parentSprintId = isSub ? decimalMatch![1] : null;
      sheetRows.push({
        sprintId,
        parentSprintId,
        isSub,
        typeHint: typeIdx >= 0 ? (row[typeIdx] || "").toString().trim() : "",
        title,
        category: normalizeCategory((row[categoryIdx] || "").toString()),
        subcategory: subcategoryIdx >= 0 ? (row[subcategoryIdx] || "").toString().trim() : "",
        owner: ownerIdx >= 0 ? (row[ownerIdx] || "").toString().trim() : "",
        coOwner: coOwnerIdx >= 0 ? (row[coOwnerIdx] || "").toString().trim() : "",
        priority: normalizePriority(priorityIdx >= 0 ? (row[priorityIdx] || "").toString() : ""),
        status: normalizeStatus(statusIdx >= 0 ? (row[statusIdx] || "").toString() : ""),
        tier: tierIdx >= 0 ? (row[tierIdx] || "").toString().trim() : "Sprint",
        dueDate: parseDate(dueIdx >= 0 ? (row[dueIdx] || "").toString() : ""),
        completedDate: parseDate(completedIdx >= 0 ? (row[completedIdx] || "").toString() : ""),
        notes: notesIdx >= 0 ? (row[notesIdx] || "").toString().trim() : "",
        kpi: kpiIdx >= 0 ? (row[kpiIdx] || "").toString().trim() : "",
        source: sourceIdx >= 0 ? (row[sourceIdx] || "").toString().trim() : "manual",
        linearId: linearIdx >= 0 ? (row[linearIdx] || "").toString().trim() : "",
      });
    }

    // Load category/subcategory rows to resolve parentId FK
    const catRows = await db.select().from(planItemsTable).where(eq(planItemsTable.level, "category"));
    const subcatRows = await db.select().from(planItemsTable).where(eq(planItemsTable.level, "subcategory"));
    const catByName = new Map(catRows.map(c => [c.category.toLowerCase(), c.id]));
    const subcatByName = new Map(subcatRows.map(s => [`${(s.category || "").toLowerCase()}|${(s.title || "").toLowerCase()}`, s.id]));

    // FLUSH all existing tasks (preserve category/subcategory rows)
    const flushResult = await db.delete(planItemsTable).where(eq(planItemsTable.level, "task")).returning({ id: planItemsTable.id });
    const flushed = flushResult.length;

    // Split into masters + subs
    const masterRows = sheetRows.filter(r => !r.isSub);
    const subRows = sheetRows.filter(r => r.isSub);

    // Sort by sprintId naturally so priorityOrder matches the sheet sequence
    const natSort = (a: SheetRow, b: SheetRow) => a.sprintId.localeCompare(b.sprintId, undefined, { numeric: true });
    masterRows.sort(natSort);
    subRows.sort(natSort);

    // Insert masters first, build sprintId → uuid map
    const sprintToUuid = new Map<string, string>();
    const perCategoryCounter = new Map<string, number>();
    let mastersInserted = 0;

    for (const r of masterRows) {
      const catId = catByName.get(r.category) || null;
      const subcatId = r.subcategory ? subcatByName.get(`${r.category}|${r.subcategory.toLowerCase()}`) : null;
      const order = perCategoryCounter.get(r.category) ?? 0;
      perCategoryCounter.set(r.category, order + 1);
      const isNote = r.typeHint.toLowerCase() === "note";

      const [inserted] = await db.insert(planItemsTable).values({
        level: "task",
        taskType: isNote ? "note" : "master",
        category: r.category,
        subcategory: r.subcategory || null,
        title: r.title,
        owner: r.owner || null,
        coOwner: r.coOwner || null,
        priority: isNote ? null : r.priority,
        status: isNote ? null : r.status,
        priorityOrder: order,
        parentId: subcatId || catId,
        parentTaskId: null,
        dueDate: isNote ? null : r.dueDate,
        month: monthFromDate(r.dueDate) || "2026-04",
        completedAt: r.status === "completed" && r.completedDate
          ? new Date(`${r.completedDate}T00:00:00Z`)
          : null,
        atomicKpi: r.kpi || null,
        workNotes: r.notes || null,
        source: r.source || "manual",
        executionTier: r.tier || "Sprint",
        linearId: r.linearId || null,
      }).returning();

      sprintToUuid.set(r.sprintId, inserted.id);
      mastersInserted++;
    }

    // Insert subs, linking via parentTaskId from sprintToUuid map
    const perParentCounter = new Map<string, number>();
    let subsInserted = 0;
    let orphanSkipped = 0;

    for (const r of subRows) {
      const parentUuid = sprintToUuid.get(r.parentSprintId!);
      if (!parentUuid) {
        orphanSkipped++;
        continue;
      }
      const catId = catByName.get(r.category) || null;
      const subcatId = r.subcategory ? subcatByName.get(`${r.category}|${r.subcategory.toLowerCase()}`) : null;
      const order = perParentCounter.get(parentUuid) ?? 0;
      perParentCounter.set(parentUuid, order + 1);
      const isNote = r.typeHint.toLowerCase() === "note";

      await db.insert(planItemsTable).values({
        level: "task",
        taskType: isNote ? "note" : "subtask",
        category: r.category,
        subcategory: r.subcategory || null,
        title: r.title,
        owner: r.owner || null,
        coOwner: r.coOwner || null,
        priority: isNote ? null : r.priority,
        status: isNote ? null : r.status,
        priorityOrder: order,
        parentId: subcatId || catId,
        parentTaskId: parentUuid,
        dueDate: isNote ? null : r.dueDate,
        month: monthFromDate(r.dueDate) || "2026-04",
        completedAt: r.status === "completed" && r.completedDate
          ? new Date(`${r.completedDate}T00:00:00Z`)
          : null,
        atomicKpi: r.kpi || null,
        workNotes: r.notes || null,
        source: r.source || "manual",
        executionTier: r.tier || "Sprint",
        linearId: r.linearId || null,
      });

      subsInserted++;
    }

    const inserted = mastersInserted + subsInserted;
    console.log(`[sheets-sync] syncTasksFromSheet: flushed=${flushed}, inserted=${inserted} (${mastersInserted} masters, ${subsInserted} subs), skipped=${skipped + orphanSkipped}`);
    return { ok: true, inserted, masters: mastersInserted, subs: subsInserted, skipped: skipped + orphanSkipped, flushed };
  } catch (err) {
    console.warn("[sheets-sync] syncTasksFromSheet failed:", (err as Error).message);
    return { ok: false, inserted: 0, masters: 0, subs: 0, skipped: 0, flushed: 0, error: (err as Error).message };
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
      "Deal Value", "Pain Points", "Probability", "Follow-Up Date", "Expected Close",
      "Next Step", "LinkedIn", "Website", "Tags",
      "Last Contact Date", "Notes", "Activity Log",
      "Created At", "Updated At",
    ];
    const rows: (string | null)[][] = contacts.map(c => [
      c.sheetId || c.id,
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
      c.painPoints || null,
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

// ─── Sheets → DB FULL RESYNC for contacts ───
// Flushes all contacts (and cascades contact_notes; NULLs call_log/phone_log FKs).
// Re-imports every row from the "Contact Master" tab, header-driven (robust to column reordering).
// The sheet's ID column (e.g. LEAD-0001) is preserved in contacts.sheet_id.
export async function syncContactsFromSheet(): Promise<{ ok: boolean; inserted: number; flushed: number; skipped: number; error?: string }> {
  if (!BUSINESS_MASTER_SHEET_ID) return { ok: false, inserted: 0, flushed: 0, skipped: 0, error: "BUSINESS_MASTER_SHEET_ID not set" };
  try {
    const rows = await getSheetValues(BUSINESS_MASTER_SHEET_ID, "Contact Master!A:AZ");
    console.log(`[sheets-sync] syncContactsFromSheet: fetched ${rows.length} rows from sheet`);
    if (rows.length < 2) return { ok: false, inserted: 0, flushed: 0, skipped: 0, error: `Sheet returned only ${rows.length} rows. Check tab name 'Contact Master' or sheet permissions.` };

    const header = rows[0].map(h => (h || "").toString().trim().toLowerCase());
    const idx = (...names: string[]) => {
      for (const n of names) {
        const i = header.indexOf(n.toLowerCase());
        if (i >= 0) return i;
      }
      return -1;
    };

    const sheetIdIdx = idx("id");
    const nameIdx = idx("name");
    const companyIdx = idx("company");
    const statusIdx = idx("status");
    const pipelineIdx = idx("pipeline stage");
    const phoneIdx = idx("phone");
    const emailIdx = idx("email");
    const typeIdx = idx("type");
    const categoryIdx = idx("category");
    const titleIdx = idx("title");
    const leadSourceIdx = idx("lead source");
    const sourceIdx = idx("source");
    const dealValueIdx = idx("deal value");
    const painPointsIdx = idx("pain points", "pain point", "pain point(s)");
    const probabilityIdx = idx("probability");
    const followUpIdx = idx("follow-up date", "follow up date");
    const expectedCloseIdx = idx("expected close", "expected close date");
    const nextStepIdx = idx("next step");
    const linkedinIdx = idx("linkedin");
    const websiteIdx = idx("website");
    const tagsIdx = idx("tags");
    const lastContactIdx = idx("last contact date");
    const notesIdx = idx("notes");
    // Activity Log (col X) is computed — we skip on reverse sync
    const createdAtIdx = idx("created at");
    const updatedAtIdx = idx("updated at");

    if (nameIdx === -1) return { ok: false, inserted: 0, flushed: 0, skipped: 0, error: `'Name' column not found. Headers seen: ${JSON.stringify(header)}` };

    const parseDate = (d: string): string | null => {
      if (!d) return null;
      const trimmed = d.trim();
      if (!trimmed) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      const parsed = new Date(trimmed);
      if (isNaN(parsed.getTime())) return null;
      return parsed.toISOString().split("T")[0];
    };
    const parseNumber = (v: string): string | null => {
      if (!v) return null;
      const cleaned = v.replace(/[$,\s]/g, "").trim();
      if (!cleaned) return null;
      const n = Number(cleaned);
      return isNaN(n) ? null : String(n);
    };
    const parseInt2 = (v: string): number | null => {
      if (!v) return null;
      const n = parseInt(v.replace(/[%\s]/g, "").trim(), 10);
      return isNaN(n) ? null : n;
    };
    const parseTags = (v: string): string[] | null => {
      if (!v) return null;
      const parts = v.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      return parts.length ? parts : null;
    };
    const cell = (row: string[], i: number): string => (i >= 0 && row[i] !== undefined) ? row[i].toString().trim() : "";

    interface ContactRow {
      sheetId: string;
      name: string;
      company: string | null;
      status: string | null;
      pipelineStage: string | null;
      phone: string | null;
      email: string | null;
      type: string | null;
      category: string | null;
      title: string | null;
      leadSource: string | null;
      source: string | null;
      dealValue: string | null;
      painPoints: string | null;
      dealProbability: number | null;
      followUpDate: string | null;
      expectedCloseDate: string | null;
      nextStep: string | null;
      linkedinUrl: string | null;
      website: string | null;
      tags: string[] | null;
      lastContactDate: string | null;
      notes: string | null;
    }

    const contactRows: ContactRow[] = [];
    let skipped = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = cell(row, nameIdx);
      if (!name) { skipped++; continue; }
      contactRows.push({
        sheetId: cell(row, sheetIdIdx),
        name,
        company: cell(row, companyIdx) || null,
        status: cell(row, statusIdx) || null,
        pipelineStage: cell(row, pipelineIdx) || null,
        phone: cell(row, phoneIdx) || null,
        email: cell(row, emailIdx) || null,
        type: cell(row, typeIdx) || null,
        category: cell(row, categoryIdx) || null,
        title: cell(row, titleIdx) || null,
        leadSource: cell(row, leadSourceIdx) || null,
        source: cell(row, sourceIdx) || null,
        dealValue: parseNumber(cell(row, dealValueIdx)),
        painPoints: cell(row, painPointsIdx) || null,
        dealProbability: parseInt2(cell(row, probabilityIdx)),
        followUpDate: parseDate(cell(row, followUpIdx)),
        expectedCloseDate: parseDate(cell(row, expectedCloseIdx)),
        nextStep: cell(row, nextStepIdx) || null,
        linkedinUrl: cell(row, linkedinIdx) || null,
        website: cell(row, websiteIdx) || null,
        tags: parseTags(cell(row, tagsIdx)),
        lastContactDate: parseDate(cell(row, lastContactIdx)),
        notes: cell(row, notesIdx) || null,
      });
    }

    // FLUSH — contact_notes cascade out; call_log / phone_log FKs set to null.
    const flushResult = await db.delete(contactsTable).returning({ id: contactsTable.id });
    const flushed = flushResult.length;

    let inserted = 0;
    for (const r of contactRows) {
      await db.insert(contactsTable).values({
        name: r.name,
        company: r.company,
        status: r.status || "New",
        phone: r.phone,
        email: r.email,
        type: r.type,
        category: r.category,
        title: r.title,
        nextStep: r.nextStep,
        lastContactDate: r.lastContactDate,
        notes: r.notes,
        source: r.source,
        pipelineStage: r.pipelineStage || "Lead",
        dealValue: r.dealValue,
        leadSource: r.leadSource,
        linkedinUrl: r.linkedinUrl,
        website: r.website,
        tags: r.tags,
        followUpDate: r.followUpDate,
        expectedCloseDate: r.expectedCloseDate,
        dealProbability: r.dealProbability,
        painPoints: r.painPoints,
        sheetId: r.sheetId || null,
      });
      inserted++;
    }

    console.log(`[sheets-sync] syncContactsFromSheet: flushed=${flushed}, inserted=${inserted}, skipped=${skipped}`);
    return { ok: true, inserted, flushed, skipped };
  } catch (err) {
    console.warn("[sheets-sync] syncContactsFromSheet failed:", (err as Error).message);
    return { ok: false, inserted: 0, flushed: 0, skipped: 0, error: (err as Error).message };
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
  // DISABLED — unidirectional auto-sync kept overwriting Tony's Google Sheet.
  // Bidirectional sync will be implemented later via webhook triggers.
  // Manual sync is still available via POST /sheets/sync-master and /sheets/sync-tasks-from-sheet.
  console.log("[sheets-sync] Auto-sync DISABLED. Use manual endpoints or the UI Refresh button.");
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

// ─── Sheets → DB reverse sync for tasks (pulls Type + Sub-Type back into DB) ────
router.post("/sheets/sync-tasks-from-sheet", async (req, res): Promise<void> => {
  const result = await syncTasksFromSheet();
  if (result.ok) res.json(result);
  else res.status(500).json(result);
});

// ─── Sheets → DB reverse sync for contacts (flush + reimport from Contact Master tab) ────
router.post("/sheets/sync-contacts-from-sheet", async (req, res): Promise<void> => {
  const result = await syncContactsFromSheet();
  if (result.ok) res.json(result);
  else res.status(500).json(result);
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

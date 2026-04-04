import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appendToSheet, getSheetValues } from "../../lib/google-sheets";
import { readGoogleDoc } from "../../lib/google-drive";
import { businessContextTable } from "../../lib/schema-v2";
import { eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

const CHECKIN_SHEET_ID = process.env.CHECKIN_SHEET_ID || "1rMLE_RhdRDsC2dqRs8eIiF6bySCAkMvy1k4JlHKkRMw";
const JOURNAL_DOC_ID = process.env.JOURNAL_DOC_ID || "1kQjIFa903luN-62HkUD0tPGAmeQPC7JMN6rfnbvXYRE";
const PLAN_90_DAY_ID = process.env.PLAN_90_DAY_ID || "1b1Ejf6Tim1gevq0BoMeV7XZ2KuXrgP2E";

// Append a check-in row to the check-in Google Sheet
router.post("/sheets/checkin-append", async (req, res): Promise<void> => {
  try {
    const { date, bedtime, waketime, sleepHours, bible, workout, journal, nutrition, unplug } = req.body;
    const row = [
      date || new Date().toISOString().split("T")[0],
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

    await appendToSheet(CHECKIN_SHEET_ID, "Sheet1", row);
    res.json({ ok: true, row });
  } catch (err) {
    console.warn("[sheets-sync] checkin-append failed:", (err as Error).message);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// Ingest 90-day plan document into business_context table
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

// Get business context (for AI use)
router.get("/business-context", async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(businessContextTable);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Upsert a business context document manually
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

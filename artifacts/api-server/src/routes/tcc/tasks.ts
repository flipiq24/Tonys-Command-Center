import { Router, type IRouter } from "express";
import { db, taskCompletionsTable, taskWorkNotesTable } from "@workspace/db";
import { MarkTaskCompleteBody } from "@workspace/api-zod";
import { eq, gte, and } from "drizzle-orm";
import { getLinearIssues } from "../../lib/linear";
import { todayPacific } from "../../lib/dates.js";

const router: IRouter = Router();

router.get("/tasks/completed", async (req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const completions = await db
    .select()
    .from(taskCompletionsTable)
    .where(gte(taskCompletionsTable.completedAt, today));

  res.json(completions);
});

router.post("/tasks/completed", async (req, res): Promise<void> => {
  const parsed = MarkTaskCompleteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [completion] = await db
    .insert(taskCompletionsTable)
    .values({
      taskId: parsed.data.taskId,
      taskText: parsed.data.taskText,
    })
    .returning();

  res.status(201).json(completion);
});

router.delete("/tasks/completed/:taskId", async (req, res): Promise<void> => {
  const { taskId } = req.params;
  if (!taskId) {
    res.status(400).json({ error: "taskId is required" });
    return;
  }

  await db
    .delete(taskCompletionsTable)
    .where(eq(taskCompletionsTable.taskId, taskId));

  res.json({ ok: true, taskId });
});

// ── Work Notes ──────────────────────────────────────────────────────────────

router.post("/tasks/work-note", async (req, res): Promise<void> => {
  const { taskId, note } = req.body as { taskId?: string; note?: string };
  if (!taskId || !note?.trim()) {
    res.status(400).json({ error: "taskId and note are required" });
    return;
  }

  const today = todayPacific();
  const [record] = await db
    .insert(taskWorkNotesTable)
    .values({ taskId, date: today, note: note.trim() })
    .returning();

  res.status(201).json(record);
});

router.get("/tasks/work-notes/:taskId", async (req, res): Promise<void> => {
  const { taskId } = req.params;
  if (!taskId) {
    res.status(400).json({ error: "taskId is required" });
    return;
  }

  const notes = await db
    .select()
    .from(taskWorkNotesTable)
    .where(eq(taskWorkNotesTable.taskId, taskId))
    .orderBy(taskWorkNotesTable.createdAt);

  res.json(notes);
});

// Get all work notes logged today (for EOD)
router.get("/tasks/work-notes-today", async (req, res): Promise<void> => {
  const today = todayPacific();
  const notes = await db
    .select()
    .from(taskWorkNotesTable)
    .where(eq(taskWorkNotesTable.date, today));

  res.json(notes);
});

// Pull active issues from Linear to surface as tasks in TCC checklist
router.get("/tasks/linear", async (req, res): Promise<void> => {
  try {
    const issues = await getLinearIssues();
    const tasks = issues.map(issue => ({
      id: `linear-${issue.id}`,
      text: `[${issue.identifier}] ${issue.title}`,
      cat: "TECH",
      state: issue.state?.name ?? "In Progress",
      priority: issue.priority,
      linearId: issue.id,
      linearIdentifier: issue.identifier,
      source: "linear" as const,
    }));
    res.json(tasks);
  } catch (err) {
    req.log.warn({ err }, "Linear tasks fetch failed");
    res.json([]);
  }
});

export default router;

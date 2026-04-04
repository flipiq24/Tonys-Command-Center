import { Router, type IRouter } from "express";
import { db, taskCompletionsTable, taskWorkNotesTable } from "@workspace/db";
import { MarkTaskCompleteBody } from "@workspace/api-zod";
import { eq, gte, and, desc } from "drizzle-orm";
import { getLinearIssues } from "../../lib/linear";
import { todayPacific } from "../../lib/dates.js";
import { localTasksTable } from "../../lib/schema-v2";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { z } from "zod/v4";

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
  const { taskId, note, progress } = req.body as { taskId?: string; note?: string; progress?: number };
  if (!taskId || !note?.trim()) {
    res.status(400).json({ error: "taskId and note are required" });
    return;
  }

  const today = todayPacific();
  const [record] = await db
    .insert(taskWorkNotesTable)
    .values({ taskId, date: today, note: note.trim(), progress: progress ?? 0 })
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

// Get all active local tasks
router.get("/tasks/local", async (req, res): Promise<void> => {
  const tasks = await db
    .select()
    .from(localTasksTable)
    .where(eq(localTasksTable.status, "active"))
    .orderBy(localTasksTable.dueDate, localTasksTable.createdAt);
  res.json(tasks);
});

router.patch("/tasks/local/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  const { status } = req.body as { status?: string };
  await db
    .update(localTasksTable)
    .set({ status: status || "done" })
    .where(eq(localTasksTable.id, id));
  res.json({ ok: true });
});

const CreateTaskBody = z.object({
  text: z.string().min(1, "text is required"),
  dueDate: z.string().optional(),
  checkOnly: z.boolean().optional(),
  overrideWarning: z.string().optional(),
});

interface PriorityItem {
  id: string;
  text: string;
  source: "linear" | "local";
  priority?: number;
}

async function checkTaskPriority(
  taskText: string,
  linearIssues: PriorityItem[],
  localTasks: PriorityItem[]
): Promise<{ hasHigherPriority: boolean; count: number; items: PriorityItem[]; newTaskPriority: number }> {
  const allTasks = [...linearIssues.slice(0, 5), ...localTasks.slice(0, 5)];

  if (allTasks.length === 0) {
    return { hasHigherPriority: false, count: 0, items: [], newTaskPriority: 50 };
  }

  const taskList = allTasks.map((t, i) => `${i + 1}. [${t.source}] ${t.text}`).join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `You are Tony Diaz's priority checker for FlipIQ. Tony's top priority is always: Sales calls first, then ops support, then everything else.

NEW TASK: "${taskText}"

EXISTING ACTIVE TASKS:
${taskList}

Which of the existing tasks are higher priority than the new task? A task is higher priority if it's more urgent or directly moves revenue.

Return ONLY valid JSON:
{
  "newTaskPriority": <number 1-100, lower = higher priority>,
  "higherPriorityItems": [<array of 1-based indices of existing tasks that are HIGHER priority than the new task>]
}

Return ONLY the JSON object, no markdown.`
    }]
  });

  const block = msg.content[0];
  if (block.type !== "text") return { hasHigherPriority: false, count: 0, items: [], newTaskPriority: 50 };

  const raw = block.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  const parsed = JSON.parse(raw);

  const higherItems = (parsed.higherPriorityItems as number[] || [])
    .filter((i: number) => i >= 1 && i <= allTasks.length)
    .map((i: number) => allTasks[i - 1]);

  return {
    hasHigherPriority: higherItems.length > 0,
    count: higherItems.length,
    items: higherItems,
    newTaskPriority: parsed.newTaskPriority ?? 50,
  };
}

// Smart task creation with priority check
router.post("/tasks/create-with-check", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text, dueDate, checkOnly, overrideWarning } = parsed.data;

  // Fetch existing tasks for priority comparison
  let linearIssues: PriorityItem[] = [];
  let localTasks: PriorityItem[] = [];

  try {
    const issues = await getLinearIssues();
    linearIssues = issues.slice(0, 8).map(issue => ({
      id: `linear-${issue.id}`,
      text: `[${issue.identifier}] ${issue.title}`,
      source: "linear" as const,
      priority: issue.priority,
    }));
  } catch { /* ok — Linear may not be connected */ }

  try {
    const rows = await db
      .select()
      .from(localTasksTable)
      .where(eq(localTasksTable.status, "active"))
      .orderBy(localTasksTable.priority, localTasksTable.createdAt)
      .limit(8);
    localTasks = rows.map(r => ({
      id: r.id,
      text: r.text,
      source: "local" as const,
      priority: r.priority ?? undefined,
    }));
  } catch { /* ok */ }

  // Run priority check via Claude
  let priorityCheck: { hasHigherPriority: boolean; count: number; items: PriorityItem[]; newTaskPriority: number };
  try {
    priorityCheck = await checkTaskPriority(text, linearIssues, localTasks);
  } catch (err) {
    req.log.warn({ err }, "Priority check failed — skipping");
    priorityCheck = { hasHigherPriority: false, count: 0, items: [], newTaskPriority: 50 };
  }

  // If checkOnly, return the assessment without saving
  if (checkOnly) {
    res.json({ ok: true, priorityCheck });
    return;
  }

  // Save the task
  const [task] = await db
    .insert(localTasksTable)
    .values({
      text,
      dueDate: dueDate ?? null,
      priority: priorityCheck.newTaskPriority,
      status: "active",
      overrideWarning: overrideWarning ?? null,
    })
    .returning();

  res.status(201).json(task);
});

export default router;

import { Router, type IRouter } from "express";
import { db, taskCompletionsTable } from "@workspace/db";
import { MarkTaskCompleteBody } from "@workspace/api-zod";
import { gte, eq, and } from "drizzle-orm";
import { getLinearIssues } from "../../lib/linear";

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

router.post("/tasks/uncomplete", async (req, res): Promise<void> => {
  const { taskId } = req.body as { taskId?: string };
  if (!taskId) {
    res.status(400).json({ error: "taskId required" });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await db
    .delete(taskCompletionsTable)
    .where(
      and(
        eq(taskCompletionsTable.taskId, taskId),
        gte(taskCompletionsTable.completedAt, today),
      ),
    );

  res.json({ ok: true });
});

// Pull active issues from Linear to surface as tasks in TCC checklist
router.get("/tasks/linear", async (req, res): Promise<void> => {
  try {
    const issues = await getLinearIssues();
    // Map to TCC task format
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

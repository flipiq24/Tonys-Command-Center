import { Router, type IRouter } from "express";
import { db, taskCompletionsTable } from "@workspace/db";
import { MarkTaskCompleteBody } from "@workspace/api-zod";
import { gte } from "drizzle-orm";

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

export default router;

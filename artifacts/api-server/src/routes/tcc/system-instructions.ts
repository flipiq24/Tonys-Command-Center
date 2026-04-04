import { Router, type IRouter } from "express";
import { db, systemInstructionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/system-instructions", async (req, res): Promise<void> => {
  const rows = await db.select().from(systemInstructionsTable);
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.section] = row.content;
  }
  res.json(result);
});

router.post("/system-instructions", async (req, res): Promise<void> => {
  const { key, text } = req.body as { key?: string; text?: string };
  if (!key || typeof text !== "string") {
    res.status(400).json({ error: "key and text are required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(systemInstructionsTable)
    .where(eq(systemInstructionsTable.section, key));

  if (existing) {
    await db
      .update(systemInstructionsTable)
      .set({ content: text, updatedAt: new Date() })
      .where(eq(systemInstructionsTable.section, key));
  } else {
    await db.insert(systemInstructionsTable).values({ section: key, content: text });
  }

  res.json({ ok: true, key, text });
});

export default router;

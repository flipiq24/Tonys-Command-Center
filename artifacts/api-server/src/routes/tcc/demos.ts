import { Router, type IRouter } from "express";
import { db, demosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

async function getTodayDemoCount(): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const demos = await db
    .select()
    .from(demosTable)
    .where(eq(demosTable.scheduledDate, today));
  return demos.length;
}

router.get("/demos/count", async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const count = await getTodayDemoCount();
  res.json({ count, date: today });
});

router.post("/demos/increment", async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  await db.insert(demosTable).values({
    scheduledDate: today,
    status: "scheduled",
  });
  const count = await getTodayDemoCount();
  res.json({ count, date: today });
});

router.post("/demos/decrement", async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const [demo] = await db
    .select()
    .from(demosTable)
    .where(eq(demosTable.scheduledDate, today));
  
  if (demo) {
    await db.delete(demosTable).where(eq(demosTable.id, demo.id));
  }

  const count = await getTodayDemoCount();
  res.json({ count: Math.max(0, count), date: today });
});

export default router;

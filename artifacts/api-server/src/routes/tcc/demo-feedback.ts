import { Router, type IRouter } from "express";
import { analyzeDemoRecording } from "../../lib/demo-feedback";
import { listTodayEvents } from "../../lib/gcal";
import { todayPacific } from "../../lib/dates.js";

const router: IRouter = Router();

router.get("/demo-feedback/scan", async (req, res): Promise<void> => {
  const today = todayPacific();
  const results: { event: string; feedback: string | null }[] = [];

  try {
    const todayEvents = await listTodayEvents();
    const demoEvents = todayEvents.filter(e =>
      e.summary.toLowerCase().includes("flipiq demo") && new Date(e.end) < new Date()
    );

    if (demoEvents.length === 0) {
      res.json({ ok: true, date: today, demos: 0, results: [] });
      return;
    }

    for (const demoEvent of demoEvents) {
      const feedback = await analyzeDemoRecording(demoEvent.summary, today);
      results.push({ event: demoEvent.summary, feedback });
    }

    res.json({ ok: true, date: today, demos: demoEvents.length, results });
  } catch (err) {
    req.log.warn({ err }, "[demo-feedback/scan] Failed");
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Scan failed" });
  }
});

export default router;

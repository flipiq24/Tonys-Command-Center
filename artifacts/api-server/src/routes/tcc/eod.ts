import { Router, type IRouter } from "express";
import { eq, gte, sql } from "drizzle-orm";
import { db, eodReportsTable, callLogTable, demosTable, taskCompletionsTable, taskWorkNotesTable, ideasTable } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { sendViaAgentMail } from "../../lib/agentmail";
import { todayPacific } from "../../lib/dates.js";
import { communicationLogTable, businessContextTable } from "../../lib/schema-v2";

const router: IRouter = Router();

router.get("/eod-report/today", async (req, res): Promise<void> => {
  const today = todayPacific();
  const [report] = await db.select().from(eodReportsTable).where(eq(eodReportsTable.date, today));
  res.json(report || null);
});

router.post("/eod-report", async (req, res): Promise<void> => {
  const today = todayPacific();
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const [calls, demoRows, taskCompletions] = await Promise.all([
    db.select().from(callLogTable).where(gte(callLogTable.createdAt, todayDate)),
    db.select().from(demosTable).where(eq(demosTable.scheduledDate, today)),
    db.select().from(taskCompletionsTable).where(gte(taskCompletionsTable.completedAt, todayDate)),
  ]);

  const callsMade = calls.length;
  const demosBooked = demoRows.length;
  const tasksCompleted = taskCompletions.length;
  const callList = calls.map(c => `- ${c.contactName}: ${c.type}`).join("\n") || "- No calls logged";

  let reportText = "";
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{
        role: "user",
        content: `Generate an EOD (End of Day) report for Tony Diaz, CEO of FlipIQ.

Today's Data:
- Calls Made: ${callsMade}
- Demos Booked: ${demosBooked}
- Tasks Completed: ${tasksCompleted}

Call Log:
${callList}

Write a brief EOD report (3-4 paragraphs) in Tony's voice:
1. Summary of the day's sales activity
2. Key wins and opportunities identified  
3. What needs follow-up tomorrow
4. One motivating closing thought

Keep it honest, direct, and actionable. This will be sent to tony@flipiq.com and ethan@flipiq.com.`,
      }],
    });
    const block = message.content[0];
    if (block.type === "text") reportText = block.text;
  } catch (err) {
    req.log.warn({ err }, "Claude EOD report generation failed");
    reportText = `EOD Report — ${today}\n\nCalls Made: ${callsMade}\nDemos Booked: ${demosBooked}\nTasks Completed: ${tasksCompleted}\n\n${callList}\n\nKeep pushing forward tomorrow.`;
  }

  // Send to both recipients in parallel
  const recipients = ["tony@flipiq.com", "ethan@flipiq.com"];
  const sentResults = await Promise.all(
    recipients.map(async to => {
      const result = await sendViaAgentMail({
        to,
        subject: `FlipIQ EOD Report — ${today}`,
        body: reportText,
      });
      if (!result.ok) {
        req.log.warn({ to }, "AgentMail EOD send failed");
      }
      return { to, ok: result.ok };
    })
  );

  const sentTo = sentResults.filter(r => r.ok).map(r => r.to).join(",") || "failed";

  const [report] = await db
    .insert(eodReportsTable)
    .values({ date: today, callsMade, demosBooked, tasksCompleted, reportText, sentTo })
    .onConflictDoUpdate({
      target: eodReportsTable.date,
      set: { callsMade, demosBooked, tasksCompleted, reportText, sentTo },
    })
    .returning();

  res.json({ ...report, ok: true, emailsSent: sentResults });
});

// ── Shared auto-EOD logic (also called by Claude tool) ────────────────────────
export async function sendAutoEod(): Promise<{ ok: boolean; alreadySent?: boolean; error?: string; callsMade?: number; demosBooked?: number; tasksCompleted?: number }> {
  const today = todayPacific();

  const [existing] = await db.select().from(eodReportsTable).where(eq(eodReportsTable.date, today));
  if (existing) return { ok: true, alreadySent: true };

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const [calls, demoRows, taskCompletions, workedOnTasks] = await Promise.all([
    db.select().from(callLogTable).where(gte(callLogTable.createdAt, todayDate)),
    db.select().from(demosTable).where(eq(demosTable.scheduledDate, today)),
    db.select().from(taskCompletionsTable).where(gte(taskCompletionsTable.completedAt, todayDate)),
    db.select().from(taskWorkNotesTable).where(gte(taskWorkNotesTable.createdAt, todayDate)),
  ]);

  let emailsSent = 0;
  try {
    const emailLogs = await db.select().from(communicationLogTable).where(gte(communicationLogTable.createdAt, todayDate));
    emailsSent = emailLogs.filter(e => e.direction === "outbound").length;
  } catch { /* non-critical */ }

  let ideasToday: string[] = [];
  try {
    const ideas = await db.select().from(ideasTable).where(gte(ideasTable.createdAt, todayDate));
    ideasToday = ideas.map(i => i.text || "");
  } catch { /* non-critical */ }

  let overridesToday: string[] = [];
  try {
    const overrides = await db.select().from(ideasTable)
      .where(sql`${ideasTable.createdAt} >= ${todayDate} AND ${ideasTable.status} = 'override'`);
    overridesToday = overrides.map(o => o.text || "");
  } catch { /* non-critical */ }

  let outOfSequenceItems: string[] = [];
  try {
    const [businessCtx] = await db.select().from(businessContextTable).where(eq(businessContextTable.documentType, "90_day_plan"));
    if (businessCtx?.content && taskCompletions.length > 0) {
      const planContent = businessCtx.content.toLowerCase();
      outOfSequenceItems = taskCompletions
        .map(t => t.taskText || "")
        .filter(t => t && !planContent.includes(t.toLowerCase().substring(0, 20)));
    }
  } catch { /* non-critical */ }

  let noDueDateItems: string[] = [];
  try {
    const noteTaskIds = new Set(workedOnTasks.map(w => w.taskId));
    noDueDateItems = taskCompletions
      .filter(t => !noteTaskIds.has(t.taskId))
      .map(t => t.taskText || "")
      .filter(Boolean);
  } catch { /* non-critical */ }

  let demoFeedback: string[] = [];
  try {
    const { analyzeDemoRecording } = await import("../../lib/demo-feedback");
    const { listTodayEvents } = await import("../../lib/gcal");
    const todayEvents = await listTodayEvents();
    const demoEvents = todayEvents.filter(e =>
      e.summary.toLowerCase().includes("flipiq demo") && new Date(e.end) < new Date()
    );
    for (const demoEvent of demoEvents) {
      const feedback = await analyzeDemoRecording(demoEvent.summary, today);
      if (feedback) demoFeedback.push(feedback);
    }
  } catch { /* non-critical */ }

  const callsMade = calls.length;
  const demosBooked = demoRows.length;
  const tasksCompleted = taskCompletions.length;
  const callList = calls.map(c => `- ${c.contactName}: ${c.type}`).join("\n") || "- No calls logged";
  const workedOnSummary = workedOnTasks.map(t => `- ${t.taskId}: ${t.note || "no note"}`).join("\n") || "- None";
  const completionRate = Math.min(100, Math.round(((tasksCompleted + workedOnTasks.length) / 10) * 100));

  let tonyReportText = "";
  try {
    const tonyMsg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Generate Tony Diaz's EOD report for ${today} (FlipIQ CEO).

Today's Data:
- Calls made: ${callsMade}
- Demos booked/completed: ${demosBooked}
- Emails sent: ${emailsSent}
- Tasks completed: ${tasksCompleted}
- Tasks worked on:\n${workedOnSummary}
- Ideas submitted: ${ideasToday.length > 0 ? ideasToday.join(", ") : "None"}

Format as a brief EOD (4 paragraphs max):
1. Quick summary
2. Key metrics: calls, demos, tasks
3. What needs follow-up tomorrow
4. One closing thought in Tony's voice — direct and honest.`,
      }],
    });
    const block = tonyMsg.content.find(b => b.type === "text");
    if (block?.type === "text") tonyReportText = block.text;
  } catch {
    tonyReportText = `EOD Report — ${today}\n\nCalls: ${callsMade} | Demos: ${demosBooked} | Tasks: ${tasksCompleted}\n\n${callList}`;
  }

  let ethanReportText = "";
  try {
    const ethanMsg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Generate Ethan's EOD brief for ${today}. Ethan is Tony Diaz's AI chief of staff for FlipIQ.

Tony's Activity:
- Calls: ${callsMade}, Demos: ${demosBooked}, Emails: ${emailsSent}
- Tasks completed: ${tasksCompleted}, Worked on: ${workedOnTasks.length}
- Accountability score: ${completionRate}%

Items Without Due Dates (Ethan must assign):
${noDueDateItems.length > 0 ? noDueDateItems.map(t => `- ${t}`).join("\n") : "- All items have due dates ✓"}

Out-of-Sequence Work (not on 90-day plan):
${outOfSequenceItems.length > 0 ? outOfSequenceItems.map(t => `- ${t}`).join("\n") : "- All work aligned with plan ✓"}

Tony's Overrides Today:
${overridesToday.length > 0 ? overridesToday.map(o => `- ${o}`).join("\n") : "- No overrides today ✓"}

Pitch/Demo Feedback:
${demoFeedback.length > 0 ? demoFeedback.join("\n\n---\n\n") : "- No demos analyzed today"}

Format Ethan's brief with:
1. Tony's activity summary
2. Items without due dates (action items for Ethan)
3. Out-of-sequence alerts
4. Overrides today
5. Demo feedback if available
6. Accountability score: ${completionRate}%
7. Dynamic action items for Ethan tomorrow`,
      }],
    });
    const block = ethanMsg.content.find(b => b.type === "text");
    if (block?.type === "text") ethanReportText = block.text;
  } catch {
    ethanReportText = `Ethan's EOD Brief — ${today}\n\nAccountability: ${completionRate}%\nNo-due-date items: ${noDueDateItems.length}\nOut-of-sequence: ${outOfSequenceItems.length}\nOverrides: ${overridesToday.length}`;
  }

  const tonyResult = await sendViaAgentMail({ to: "tony@flipiq.com", subject: `FlipIQ EOD — ${today}`, body: tonyReportText });
  const ethanResult = await sendViaAgentMail({ to: "ethan@flipiq.com", subject: `Ethan's EOD Brief — ${today}`, body: ethanReportText });

  const sentTo = [tonyResult.ok ? "tony@flipiq.com" : "", ethanResult.ok ? "ethan@flipiq.com" : ""].filter(Boolean).join(",") || "failed";

  await db
    .insert(eodReportsTable)
    .values({ date: today, callsMade, demosBooked, tasksCompleted, reportText: tonyReportText, sentTo })
    .onConflictDoUpdate({
      target: eodReportsTable.date,
      set: { callsMade, demosBooked, tasksCompleted, reportText: tonyReportText, sentTo },
    });

  return { ok: true, alreadySent: false, callsMade, demosBooked, tasksCompleted };
}

// Auto-EOD endpoint: called by frontend timer at 4:30 PM Pacific
// Guard: only sends once per day. Generates separate reports for Tony and Ethan.
router.post("/eod-report/auto", async (req, res): Promise<void> => {
  try {
    const result = await sendAutoEod();
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Auto-EOD failed");
    res.status(500).json({ ok: false, error: "Auto-EOD failed" });
  }
});

export default router;

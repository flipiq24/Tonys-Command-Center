import { Router, type IRouter } from "express";
import { eq, gte } from "drizzle-orm";
import { db, eodReportsTable, callLogTable, demosTable, taskCompletionsTable } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { sendViaAgentMail } from "../../lib/agentmail";
import { todayPacific } from "../../lib/dates.js";

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

export default router;

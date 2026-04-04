import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, emailTrainingTable, emailSnoozesTable, systemInstructionsTable } from "@workspace/db";
import { EmailActionBody } from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { sendEmail } from "../../lib/gmail.js";
import { getGmail } from "../../lib/google-auth.js";
import { todayPacific } from "../../lib/dates.js";

const router: IRouter = Router();

// ─── Regenerate the email brain from all training data ────────────────────────
async function regenerateBrain(): Promise<string> {
  const training = await db
    .select()
    .from(emailTrainingTable)
    .orderBy(desc(emailTrainingTable.createdAt))
    .limit(200);

  if (training.length === 0) return "";

  const examples = training.map(t =>
    `- [${t.action === "thumbs_up" ? "IMPORTANT" : "NOT IMPORTANT"}] From: ${t.sender} | Subject: ${t.subject}${t.reason ? ` | Reason: ${t.reason}` : ""}`
  ).join("\n");

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are analyzing Tony Diaz's (FlipIQ CEO) email training data to build a "brain" — a compact set of rules about what emails are important to Tony.

TRAINING DATA:
${examples}

Based on this data, write a concise "Email Priority Brain" in markdown. Format:
## Tony's Email Priority Rules
### Always Important
- (list patterns from thumbs_up data)

### Never Important  
- (list patterns from thumbs_down data)

### Key Senders
- (list important senders and why)

### Tony's Decision Principles
- (2-4 high-level principles from the data)

Keep it concise and actionable. This will be injected into Claude to help classify and reply to future emails.`
      }]
    });

    const block = msg.content[0];
    return block.type === "text" ? block.text : "";
  } catch {
    // Fallback: generate simple rules without Claude
    const important = training.filter(t => t.action === "thumbs_up");
    const notImportant = training.filter(t => t.action === "thumbs_down");
    return `## Tony's Email Priority Rules\n\n### Always Important\n${important.map(t => `- ${t.sender}: ${t.subject}${t.reason ? ` (${t.reason})` : ""}`).join("\n") || "- None yet"}\n\n### Never Important\n${notImportant.map(t => `- ${t.sender}: ${t.subject}${t.reason ? ` (${t.reason})` : ""}`).join("\n") || "- None yet"}`;
  }
}

async function saveBrain(brain: string): Promise<void> {
  await db
    .insert(systemInstructionsTable)
    .values({ section: "email_brain", content: brain })
    .onConflictDoUpdate({
      target: systemInstructionsTable.section,
      set: { content: brain, updatedAt: new Date() },
    });
}

// ─── GET brain ────────────────────────────────────────────────────────────────
router.get("/emails/brain", async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(systemInstructionsTable)
    .where(eq(systemInstructionsTable.section, "email_brain"));

  const training = await db
    .select()
    .from(emailTrainingTable)
    .orderBy(desc(emailTrainingTable.createdAt))
    .limit(50);

  res.json({
    brain: row?.content || null,
    updatedAt: row?.updatedAt || null,
    trainingCount: training.length,
    recentTraining: training.slice(0, 10),
  });
});

// ─── GET snoozed ─────────────────────────────────────────────────────────────
router.get("/emails/snoozed", async (req, res): Promise<void> => {
  const today = todayPacific();
  const snoozes = await db
    .select()
    .from(emailSnoozesTable)
    .where(eq(emailSnoozesTable.date, today));

  const snoozed: Record<number, string> = {};
  for (const s of snoozes) {
    snoozed[s.emailId] = s.snoozeUntil;
  }
  res.json(snoozed);
});

// ─── POST action ─────────────────────────────────────────────────────────────
router.post("/emails/action", async (req, res): Promise<void> => {
  const parsed = EmailActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { action, emailId, sender, subject, reason, snoozeUntil } = parsed.data;

  if (action === "thumbs_up" || action === "thumbs_down") {
    await db.insert(emailTrainingTable).values({
      sender: sender || "unknown",
      subject: subject || "",
      action,
      reason: reason || null,
    });

    // Regenerate brain async (don't block response)
    res.json({ ok: true, message: "Training saved — brain updating" });

    // Fire and forget brain regeneration
    regenerateBrain()
      .then(brain => brain ? saveBrain(brain) : Promise.resolve())
      .catch(err => console.error("[emails] Brain regeneration failed:", err));
    return;
  }

  if (action === "snooze") {
    if (emailId !== null && emailId !== undefined) {
      const today = todayPacific();
      await db
        .insert(emailSnoozesTable)
        .values({ date: today, emailId, snoozeUntil: snoozeUntil || "tomorrow" })
        .onConflictDoUpdate({
          target: [emailSnoozesTable.date, emailSnoozesTable.emailId],
          set: { snoozeUntil: snoozeUntil || "tomorrow" },
        });
    }
    res.json({ ok: true, message: `Email ${emailId} snoozed` });
    return;
  }

  if (action === "suggest_reply") {
    // Load the email brain to inform the reply
    const [brainRow] = await db
      .select()
      .from(systemInstructionsTable)
      .where(eq(systemInstructionsTable.section, "email_brain"));

    const brainContext = brainRow?.content
      ? `\n\nTONY'S EMAIL BRAIN (learned from his training):\n${brainRow.content}`
      : "";

    const { notes } = parsed.data;
    let draft = "";
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: `You are Tony Diaz's AI assistant. Tony runs FlipIQ, a real estate wholesale platform. 
Draft professional, concise email replies in Tony's voice — direct, warm, action-oriented. 
Keep replies short (3-5 sentences max). Always end with a clear next step.
IMPORTANT: Write in plain prose only. No markdown, no asterisks, no bullet points, no headers, no bold, no formatting characters whatsoever. Just plain text paragraphs.${brainContext}`,
        messages: [{
          role: "user",
          content: `Draft a reply to this email:
From: ${sender}
Subject: ${subject}
${reason ? `\nContext: ${reason}` : ""}
${notes ? `\nAdditional notes from Tony: ${notes}` : ""}

Write a professional reply from Tony Diaz. Keep it brief and action-oriented. Plain text only.`,
        }],
      });
      const block = message.content[0];
      if (block.type === "text") draft = block.text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^#+\s/gm, "").replace(/^-\s/gm, "").trim();
    } catch (err) {
      req.log.warn({ err }, "Claude API failed for email reply");
      draft = `Hi ${sender?.split(" ")[0] || "there"},\n\nThanks for reaching out. Let's connect to discuss this further.\n\nBest,\nTony`;
    }
    res.json({ ok: true, draft });
    return;
  }

  if (action === "send_reply") {
    const { sender, subject, body, gmailMessageId } = parsed.data;
    if (!sender || !subject || !body) {
      res.status(400).json({ ok: false, error: "sender, subject, and body are required" });
      return;
    }

    // Extract plain email address from "Name <email@example.com>" format
    const toMatch = sender.match(/<([^>]+)>/);
    const toEmail = toMatch ? toMatch[1] : sender;

    // Look up the Gmail thread ID so this reply is threaded correctly
    let threadId: string | undefined;
    if (gmailMessageId) {
      try {
        const gmail = getGmail();
        const msg = await gmail.users.messages.get({ userId: "me", id: gmailMessageId, format: "metadata" });
        threadId = msg.data.threadId || undefined;
      } catch (err) {
        req.log.warn({ err }, "Could not fetch threadId for send_reply — sending without thread");
      }
    }

    // Append Tony's signature
    const signature = "\n\nTony Diaz\nCEO, FlipIQ";
    const fullBody = body.trimEnd() + signature;

    const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
    const result = await sendEmail({ to: toEmail, subject: replySubject, body: fullBody, threadId });
    res.json(result);
    return;
  }

  res.json({ ok: true, message: "Action processed" });
});

export default router;

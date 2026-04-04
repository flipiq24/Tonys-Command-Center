import { Router, type IRouter } from "express";
import { db, emailTrainingTable } from "@workspace/db";
import { EmailActionBody } from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

router.post("/emails/action", async (req, res): Promise<void> => {
  const parsed = EmailActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { action, emailId, sender, subject, reason } = parsed.data;

  if (action === "thumbs_up" || action === "thumbs_down") {
    await db.insert(emailTrainingTable).values({
      sender: sender || "unknown",
      subject: subject || "",
      action,
      reason: reason || null,
    });
    res.json({ ok: true, message: "Training data saved" });
    return;
  }

  if (action === "snooze") {
    res.json({ ok: true, message: `Email ${emailId} snoozed` });
    return;
  }

  if (action === "suggest_reply") {
    let draft = "";
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: `You are Tony Diaz's AI assistant. Tony runs FlipIQ, a real estate wholesale platform. 
Draft professional, concise email replies in Tony's voice — direct, warm, action-oriented. 
Keep replies short (3-5 sentences max). Always end with a clear next step.`,
        messages: [
          {
            role: "user",
            content: `Draft a reply to this email:
From: ${sender}
Subject: ${subject}

Write a professional reply from Tony Diaz. Keep it brief and action-oriented.`,
          },
        ],
      });
      const block = message.content[0];
      if (block.type === "text") draft = block.text;
    } catch (err) {
      req.log.warn({ err }, "Claude API failed for email reply");
      draft = `Hi ${sender?.split(" ")[0] || "there"},\n\nThanks for reaching out. Let's connect to discuss this further.\n\nBest,\nTony`;
    }
    res.json({ ok: true, draft });
    return;
  }

  res.json({ ok: true, message: "Action processed" });
});

export default router;

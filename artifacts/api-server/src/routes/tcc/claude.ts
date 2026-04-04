import { Router, type IRouter } from "express";
import { ClaudePromptBody } from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const SYSTEM_PROMPT = `You are Tony Diaz's Command Center AI — his personal daily operating system assistant for running FlipIQ.

ABOUT TONY:
- Tony runs FlipIQ, a real estate wholesale platform
- Tony has ADHD — he needs clear, direct, action-oriented responses
- Tony's North Star: Every Acquisition Associate closes 2 deals/month
- Revenue target: $50K break-even → $100K Phase 1 → $250K Scale

TONY'S RULES:
- "Today, I will follow the plan I wrote when I was clear."
- "I do not substitute clarity for action. I execute. I stabilize. I serve."
- Sales calls FIRST. Everything else is secondary.
- Morning block is for calls only. No meetings in the morning.

YOUR JOB:
- Keep Tony focused on SALES and EXECUTION
- Draft emails, suggest replies, format journal entries
- Provide accountability — redirect Tony if he's drifting
- Be brief and direct — Tony does NOT like to read

SCRIPTURE ANCHORS:
- "Seek first the kingdom of God" — Matthew 6:33
- "Commit your work to the Lord" — Proverbs 16:3`;

const router: IRouter = Router();

router.post("/claude", async (req, res): Promise<void> => {
  const parsed = ClaudePromptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { prompt, context } = parsed.data;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        ...(context ? [{ role: "user" as const, content: `Context: ${context}` }, { role: "assistant" as const, content: "Understood, I have that context." }] : []),
        { role: "user", content: prompt },
      ],
    });

    const block = message.content[0];
    const text = block.type === "text" ? block.text : "";
    res.json({ text, ok: true });
  } catch (err) {
    req.log.error({ err }, "Claude API error");
    res.status(500).json({ error: "Claude API error", ok: false, text: "" });
  }
});

export default router;

import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, ideasTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

const BUSINESS_PLAN = `FlipIQ is a real estate wholesale platform. Tony's priorities:
- NORTH STAR: Every Acquisition Associate closes 2 deals/month
- Revenue: $50K break-even → $100K Phase 1 → $250K scale
- Core: Sales calls, demos, follow-ups FIRST
- Tech: Only build what moves needles — no distractions
- Partners: Strategic relationships that bring deals or capital
- Marketing: Content that drives inbound leads at scale`;

router.post("/ideas/classify", async (req, res): Promise<void> => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const existingIdeas = await db.select().from(ideasTable).orderBy(desc(ideasTable.createdAt)).limit(5);
  const recentList = existingIdeas.map((i, idx) => `#${idx + 1}: [${i.category}] ${i.text}`).join("\n") || "None yet.";

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: `You are Tony Diaz's AI classifier for FlipIQ ideas. Analyze this idea and return ONLY valid JSON.

BUSINESS CONTEXT:
${BUSINESS_PLAN}

RECENT IDEAS (for context):
${recentList}

NEW IDEA: "${text}"

Classify this idea and return EXACTLY this JSON structure:
{
  "category": "Tech|Sales|Marketing|Strategic Partners|Operations|Product|Personal",
  "urgency": "Now|This Week|This Month|Someday",
  "techType": "Bug|Feature|Idea|null",
  "reason": "One sentence explaining why this category fits",
  "businessFit": "One sentence on how this moves the FlipIQ needle",
  "priority": "high|medium|low",
  "warningIfDistraction": "Optional: one sentence warning if this might distract Tony from sales"
}

Return ONLY the JSON object, no markdown, no explanation.`
      }]
    });

    const block = msg.content[0];
    if (block.type !== "text") {
      res.status(500).json({ error: "Unexpected response from AI" });
      return;
    }

    const jsonText = block.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const classification = JSON.parse(jsonText);
    res.json({ ok: true, classification });
  } catch (err) {
    res.status(500).json({ error: "Classification failed", ok: false });
  }
});

export default router;

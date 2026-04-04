import { Router, type IRouter } from "express";
import { db, ideasTable } from "@workspace/db";
import { ParkIdeaBody } from "@workspace/api-zod";
import { desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { createLinearIssue } from "../../lib/linear";
import { postTechIdeaToSlack } from "../../lib/slack";
import { z } from "zod/v4";

const router: IRouter = Router();

const BUSINESS_PLAN = `FlipIQ is a real estate wholesale platform.
- NORTH STAR: Every Acquisition Associate closes 2 deals/month
- Revenue: $50K break-even → $100K Phase 1 → $250K scale
- Core: Sales calls, demos, follow-ups FIRST
- Tech: Only build what moves needles — no distractions
- Partners: Strategic relationships that bring deals or capital
- Marketing: Content that drives inbound leads at scale`;

async function classifyIdea(text: string, recentIdeas: typeof ideasTable.$inferSelect[]): Promise<{
  category: string;
  urgency: string;
  techType: string | null;
  reason: string;
  businessFit: string;
  priority: string;
  warningIfDistraction?: string;
}> {
  const recentList = recentIdeas.slice(0, 5).map((i, idx) =>
    `#${idx + 1}: [${i.category}] ${i.text}`
  ).join("\n") || "None yet.";

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

Return EXACTLY this JSON:
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
  if (block.type !== "text") throw new Error("Bad AI response");
  const json = block.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(json);
}

// ─── Claude-powered Slack notification for Tech ideas ─────────────────────────
async function notifyTechIdeaViaClaude(idea: {
  text: string;
  urgency: string;
  techType: string | null;
  linearIdentifier?: string;
}): Promise<void> {
  const result = await postTechIdeaToSlack(idea);

  if (!result.ok) {
    console.info("[Ideas] Slack notification skipped (not connected):", idea.text.slice(0, 60));
  } else {
    console.info("[Ideas] Posted tech idea to #tech-ideas Slack channel");
  }
}

const ClassifyIdeaBody = z.object({
  text: z.string().min(1, "text is required"),
});

router.get("/ideas", async (req, res): Promise<void> => {
  const ideas = await db.select().from(ideasTable).orderBy(desc(ideasTable.createdAt));
  res.json(ideas);
});

// Pre-classify an idea before saving (so user can review and override)
router.post("/ideas/classify", async (req, res): Promise<void> => {
  const parsed = ClassifyIdeaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text } = parsed.data;
  const recentIdeas = await db.select().from(ideasTable).orderBy(desc(ideasTable.createdAt)).limit(5);

  try {
    const classification = await classifyIdea(text, recentIdeas);
    res.json({ ok: true, classification });
  } catch (err) {
    req.log.warn({ err }, "Idea classification failed");
    res.json({
      ok: true,
      classification: {
        category: "Operations",
        urgency: "This Week",
        techType: null,
        reason: "Could not auto-classify — defaulting to Operations.",
        businessFit: "Review manually.",
        priority: "medium",
      }
    });
  }
});

router.post("/ideas", async (req, res): Promise<void> => {
  const parsed = ParkIdeaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text, category, urgency, techType } = parsed.data;

  const existingIdeas = await db.select().from(ideasTable).orderBy(desc(ideasTable.createdAt));
  const priorityPosition = existingIdeas.length + 1;

  const [idea] = await db
    .insert(ideasTable)
    .values({ text, category, urgency, techType: techType ?? undefined, priorityPosition, status: "parked" })
    .returning();

  let linearIssue: { id?: string; identifier?: string; ok: boolean } = { ok: false };

  if (category === "Tech") {
    // 1. Create Linear issue
    try {
      const priorityMap: Record<string, number> = { "Now": 1, "This Week": 2, "This Month": 3, "Someday": 4 };
      linearIssue = await createLinearIssue({
        title: text,
        description: `**FlipIQ Tech Idea** parked by Tony via Command Center\n\nType: ${techType || "Idea"}\nUrgency: ${urgency}\nPriority Position: #${priorityPosition}`,
        priority: priorityMap[urgency] ?? 3,
      });
      if (linearIssue.ok) {
        req.log.info({ identifier: linearIssue.identifier }, "Created Linear issue");
      }
    } catch (err) {
      req.log.warn({ err }, "Linear issue creation failed");
    }

    // 2. Post to Slack #tech-ideas via Claude's Slack tool infrastructure (fire and forget)
    notifyTechIdeaViaClaude({
      text,
      urgency,
      techType: techType ?? null,
      linearIdentifier: linearIssue.identifier,
    }).catch(err => console.error("[ideas] Slack notification failed:", err));
  }

  res.status(201).json({
    ...idea,
    linearIssue: linearIssue.ok ? { id: linearIssue.id, identifier: linearIssue.identifier } : null,
  });
});

export default router;

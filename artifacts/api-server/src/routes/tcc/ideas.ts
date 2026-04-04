import { Router, type IRouter } from "express";
import { db, ideasTable } from "@workspace/db";
import { ParkIdeaBody } from "@workspace/api-zod";
import { desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

router.get("/ideas", async (req, res): Promise<void> => {
  const ideas = await db
    .select()
    .from(ideasTable)
    .orderBy(desc(ideasTable.createdAt));

  res.json(ideas);
});

router.post("/ideas", async (req, res): Promise<void> => {
  const parsed = ParkIdeaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text, category, urgency, techType } = parsed.data;

  const existingIdeas = await db.select().from(ideasTable);
  const priorityPosition = existingIdeas.length + 1;

  const [idea] = await db
    .insert(ideasTable)
    .values({
      text,
      category,
      urgency,
      techType: techType ?? undefined,
      priorityPosition,
      status: "parked",
    })
    .returning();

  if (category === "Tech") {
    try {
      await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: `Tony Diaz logged a new Tech idea for FlipIQ:
Type: ${techType || "Idea"}
Description: ${text}
Urgency: ${urgency}
Priority Position: #${priorityPosition}

Acknowledge this has been logged and would be posted to the Slack #tech channel.`,
          },
        ],
      });
    } catch (err) {
      req.log.warn({ err }, "Slack notification failed");
    }
  }

  res.status(201).json(idea);
});

export default router;

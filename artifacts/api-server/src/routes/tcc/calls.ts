import { Router, type IRouter } from "express";
import { db, callLogTable } from "@workspace/db";
import { LogCallBody } from "@workspace/api-zod";
import { gte } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

router.get("/calls", async (req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const calls = await db
    .select()
    .from(callLogTable)
    .where(gte(callLogTable.createdAt, today));

  res.json(calls);
});

router.post("/calls", async (req, res): Promise<void> => {
  const parsed = LogCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { contactId, contactName, type, notes } = parsed.data;
  const instructions = (req.body as Record<string, unknown>).instructions as string | undefined;

  const [call] = await db
    .insert(callLogTable)
    .values({
      contactId: contactId ?? undefined,
      contactName,
      type,
      notes: notes ?? undefined,
    })
    .returning();

  let followUpDraft: string | undefined;
  if (type === "attempt" && instructions) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: `Tony Diaz (FlipIQ) tried to call ${contactName} but got no answer.
Tony's instructions: "${instructions}"
Draft a brief follow-up email based on these instructions. Keep it short and professional.`,
          },
        ],
      });
      const textBlock = response.content.find(b => b.type === "text");
      if (textBlock?.type === "text") followUpDraft = textBlock.text;
    } catch (err) {
      req.log.warn({ err }, "Claude follow-up email failed");
    }
  }

  res.status(201).json({ ...call, followUpDraft });
});

export default router;

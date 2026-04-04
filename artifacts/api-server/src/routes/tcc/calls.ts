import { Router, type IRouter } from "express";
import { db, callLogTable } from "@workspace/db";
import { LogCallBody } from "@workspace/api-zod";
import { gte, eq, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { z } from "zod";
import { communicationLogTable, contactIntelligenceTable } from "../../lib/schema-v2";
import { createReminder } from "../../lib/gcal";

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

  if (type === "attempt" && instructions) {
    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Tony Diaz (FlipIQ CEO) tried to call ${contactName} but got no answer.
Tony's instructions: "${instructions}"
Draft a brief, professional follow-up email (3-4 sentences max). Plain text only, no subject line.`,
          },
        ],
      });

      const draftText = msg.content.find(b => b.type === "text")?.text?.trim();

      if (draftText) {
        const [updated] = await db.update(callLogTable)
          .set({ followUpText: draftText, followUpSent: false })
          .where(eq(callLogTable.id, call.id))
          .returning();
        res.status(201).json(updated ?? call);
        return;
      }
    } catch (err) {
      req.log.warn({ err }, "Claude follow-up email failed");
    }
  }

  res.status(201).json(call);
});

const ConnectedCallBody = z.object({
  contactId: z.string().uuid(),
  contactName: z.string(),
  outcomeNotes: z.string().min(1),
  nextStep: z.string().optional(),
  followUpDate: z.string().optional(),
});

router.post("/calls/connected-outcome", async (req, res): Promise<void> => {
  const parsed = ConnectedCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { contactId, contactName, outcomeNotes, nextStep, followUpDate } = parsed.data;

  try {
    await db.insert(communicationLogTable).values({
      contactId,
      contactName,
      channel: "call_outbound",
      direction: "outbound",
      subject: "Connected call",
      summary: outcomeNotes.substring(0, 300),
      fullContent: [outcomeNotes, nextStep ? `Next step: ${nextStep}` : ""].filter(Boolean).join("\n"),
    });

    if (followUpDate) {
      const nextActionText = nextStep || `Follow up with ${contactName}`;

      await db.execute(sql`
        INSERT INTO contact_intelligence (id, contact_id, next_action, next_action_date, updated_at)
        VALUES (gen_random_uuid(), ${contactId}, ${nextActionText}, ${followUpDate}, NOW())
        ON CONFLICT (contact_id) DO UPDATE SET
          next_action = ${nextActionText},
          next_action_date = ${followUpDate},
          updated_at = NOW()
      `);

      await createReminder({
        summary: `Follow up: ${contactName}`,
        date: followUpDate,
        description: `${outcomeNotes}\n\nNext step: ${nextStep || "Follow up"}`,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Connected call outcome logging failed");
    res.status(500).json({ error: "Failed to log connected call outcome" });
  }
});

export default router;

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, journalsTable, checkinsTable } from "@workspace/db";
import { SaveJournalBody } from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { todayPacific } from "../../lib/dates.js";
import { appendToDoc } from "../../lib/google-docs.js";

const JOURNAL_DOC_ID = "1kQjIFa903luN-62HkUD0tPGAmeQPC7JMN6rfnbvXYRE";

const router: IRouter = Router();

router.get("/journal/today", async (req, res): Promise<void> => {
  const today = todayPacific();
  const [journal] = await db
    .select()
    .from(journalsTable)
    .where(eq(journalsTable.date, today));

  if (!journal) {
    res.json({ id: null, date: today, rawText: null, formattedText: null, mood: null, keyEvents: null, reflection: null });
    return;
  }

  res.json(journal);
});

router.post("/journal", async (req, res): Promise<void> => {
  const parsed = SaveJournalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const today = todayPacific();
  const todayDate = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
  const rawText = parsed.data.rawText;

  let formattedText = rawText;
  let mood = "";
  let keyEvents = "";
  let reflection = "";

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `Format this journal entry from Tony Diaz into his exact journal structure. Today is ${todayDate}.

Raw entry:
${rawText}

Output EXACTLY this format and nothing else (start immediately with ### Daily Journal Entry):
### Daily Journal Entry — ${todayDate}

**Mood:**
[2-4 emotion words extracted from content]

**Key Events:**
[Bullet points of what happened, who he talked to, decisions made]

**Physical/Health Notes:**
[Extracted from content. If nothing mentioned: "No specific health concerns noted today."]

**Reflection:**
[1-2 paragraph reflection connecting content to growth themes, PSI principles, and spiritual journey. Written in second or third person analytical voice, NOT Tony's voice.]

---

**Original Entry (cleaned up):**
[Tony's raw voice-to-text, cleaned for readability — fix grammar, remove filler words, but keep his voice and meaning]`,
        },
      ],
    });

    const block = message.content[0];
    if (block.type === "text") {
      formattedText = block.text;
      
      const moodMatch = formattedText.match(/\*\*Mood:\*\*\s*\n([^\n]+)/);
      if (moodMatch) mood = moodMatch[1].trim();
      
      const keyEventsMatch = formattedText.match(/\*\*Key Events:\*\*\s*\n([\s\S]+?)(?=\n\*\*)/);
      if (keyEventsMatch) keyEvents = keyEventsMatch[1].trim();
      
      const reflectionMatch = formattedText.match(/\*\*Reflection:\*\*\s*\n([\s\S]+?)(?=\n---)/);
      if (reflectionMatch) reflection = reflectionMatch[1].trim();
    }
  } catch (err) {
    req.log.warn({ err }, "Claude API failed, saving raw text");
  }

  // Use ON CONFLICT DO UPDATE to avoid select-then-insert race condition
  const [journal] = await db
    .insert(journalsTable)
    .values({ date: today, rawText, formattedText, mood, keyEvents, reflection })
    .onConflictDoUpdate({
      target: journalsTable.date,
      set: { rawText, formattedText, mood, keyEvents, reflection },
    })
    .returning();

  // Mark journal complete on today's checkin (fire-and-forget, non-blocking)
  db.update(checkinsTable)
    .set({ journal: true })
    .where(eq(checkinsTable.date, today))
    .catch(err => console.error("[journal] Failed to mark checkin journal=true:", err));

  // Append to personal journal Google Doc (fire-and-forget, Tony only)
  if (rawText !== "[skipped]" && formattedText) {
    appendToDoc(JOURNAL_DOC_ID, `\n\n${formattedText}`)
      .catch(err => console.error("[journal] Doc append failed (non-fatal):", err));
  }

  res.json(journal);
});

export default router;

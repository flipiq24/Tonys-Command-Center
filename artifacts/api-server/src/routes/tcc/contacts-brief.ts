import { Router, type IRouter } from "express";
import { z } from "zod";
import { anthropic, createTrackedMessage } from "@workspace/integrations-anthropic-ai";
import { isAgentRuntimeEnabled } from "../../agents/flags.js";
import { runAgent } from "../../agents/runtime.js";
import { db, contactsTable } from "@workspace/db";
import { contactIntelligenceTable, communicationLogTable, contactBriefsTable } from "../../lib/schema-v2";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const BriefBody = z.object({
  contactId: z.string().uuid(),
});

router.post("/contacts/brief", async (req, res): Promise<void> => {
  const parsed = BriefBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { contactId } = parsed.data;

  try {
    const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
    if (!contact) { res.status(404).json({ error: "Contact not found" }); return; }

    const [intel] = await db.select().from(contactIntelligenceTable)
      .where(eq(contactIntelligenceTable.contactId, contactId)).limit(1);

    const recentComms = await db.select().from(communicationLogTable)
      .where(eq(communicationLogTable.contactId, contactId))
      .orderBy(desc(communicationLogTable.loggedAt))
      .limit(10);

    let openTasks: string[] = [];
    if (contact.nextStep) openTasks.push(contact.nextStep);
    if (intel?.nextAction) openTasks.push(intel.nextAction);

    let context = `Contact: ${contact.name}\nCompany: ${contact.company || "N/A"}\nType: ${contact.type || "N/A"}\nStatus (temperature): ${contact.status}\nPhone: ${contact.phone || "N/A"}\nEmail: ${contact.email || "N/A"}\nNext Step: ${contact.nextStep || "None"}`;

    if (intel) {
      context += `\n\nIntelligence:\nAI Score: ${intel.aiScore || "Not scored"}\nStage (pipeline): ${intel.stage}\nLinkedIn: ${intel.linkedinUrl || "N/A"}\nPersonality Notes: ${intel.personalityNotes || "N/A"}`;
      if (intel.companyInfo && typeof intel.companyInfo === "object") {
        const ci = intel.companyInfo as Record<string, string>;
        context += `\nCompany Info: ${ci.summary || "N/A"}`;
        if (ci.news) context += `\nRecent News: ${ci.news}`;
      }
    }

    if (openTasks.length > 0) {
      context += `\n\nOpen Tasks Related to This Person:\n${openTasks.map(t => `- ${t}`).join("\n")}`;
    }

    if (recentComms.length > 0) {
      context += `\n\nRecent Communications (last ${recentComms.length}):`;
      for (const c of recentComms) {
        context += `\n- [${c.channel}] ${c.loggedAt ? new Date(c.loggedAt).toLocaleDateString() : "?"}: ${c.summary || c.subject || "No summary"}`;
      }
    }

    const userPrompt = `You are Tony Diaz's sales assistant. Generate a pre-call brief for Tony. Be direct and actionable. Tony has ADHD so keep it scannable.

Include these sections:
1. QUICK SUMMARY (2-3 sentences: who they are, relationship status, what to talk about)
2. COMMUNICATION STYLE (one line: e.g., "Direct communicator. Don't pitch -- ask questions." or "Relationship-builder. Start with small talk.")
3. AI PERSONALITY ASSESSMENT (one line coaching tip based on their communication patterns)
4. KEY ACTION (one clear thing Tony should ask for or accomplish on this call)

${context}`;

    let briefText = "Unable to generate brief.";

    // Flag-gated: AGENT_RUNTIME_CONTACTS=true routes through runtime.
    // Runtime path sends only contact data; brief format/sections in skill body.
    if (isAgentRuntimeEnabled("contacts")) {
      const result = await runAgent("contacts", "pre-call-brief", {
        userMessage: context.trim() || `Contact: ${contact.name}`,
        caller: "direct",
        meta: { contactId },
      });
      briefText = result.text || briefText;
    } else {
      const response = await createTrackedMessage("contact_brief", {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 768,
        messages: [{ role: "user", content: userPrompt }],
      });
      const textBlock = response.content.find(b => b.type === "text");
      briefText = textBlock?.type === "text" ? textBlock.text : briefText;
    }

    await db.insert(contactBriefsTable).values({
      contactId,
      contactName: contact.name,
      briefText,
      openTasks: openTasks.length > 0 ? openTasks : [],
      recentCommunications: recentComms.slice(0, 5).map(c => ({
        channel: c.channel,
        summary: c.summary || c.subject,
        date: c.loggedAt,
      })),
    });

    res.json({
      ok: true,
      contactId,
      contactName: contact.name,
      briefText,
      aiScore: intel?.aiScore || null,
      stage: intel?.stage || "new",
      status: contact.status || "New",
      linkedinUrl: intel?.linkedinUrl || null,
      personalityNotes: intel?.personalityNotes || null,
      openTasks,
      recentComms: recentComms.slice(0, 5).map(c => ({
        channel: c.channel,
        summary: c.summary || c.subject,
        date: c.loggedAt,
      })),
    });
  } catch (err) {
    console.error("[contacts-brief] Error:", err);
    res.status(500).json({ error: "Failed to generate brief" });
  }
});

router.get("/contacts/:contactId/brief", async (req, res): Promise<void> => {
  const [brief] = await db.select().from(contactBriefsTable)
    .where(eq(contactBriefsTable.contactId, req.params.contactId))
    .orderBy(desc(contactBriefsTable.generatedAt))
    .limit(1);

  if (!brief) { res.status(404).json({ error: "No brief found" }); return; }
  res.json(brief);
});

export default router;

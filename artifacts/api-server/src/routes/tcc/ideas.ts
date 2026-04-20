import { Router, type IRouter } from "express";
import { db, ideasTable } from "@workspace/db";
import { ParkIdeaBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";
import { anthropic, createTrackedMessage } from "@workspace/integrations-anthropic-ai";
import { createLinearIssue, getLinearMembers } from "../../lib/linear";
import { postTechIdeaToSlack, postSlackMessage, listSlackUsers, notifyAssigneeViaSlack } from "../../lib/slack";
import { z } from "zod/v4";
import { businessContextTable } from "../../lib/schema-v2";

const router: IRouter = Router();

async function getBusinessContext(): Promise<string> {
  const rows = await db.select().from(businessContextTable).limit(5);
  if (!rows.length) return "";
  return rows.map(r => `[${r.documentType}] ${r.summary || r.content?.substring(0, 300) || ""}`.trim()).join("\n");
}

// ─── Team members: merge Linear users + Slack users by email ─────────────────
router.get("/ideas/team-members", async (_req, res): Promise<void> => {
  try {
    const [linearMembers, slackResult] = await Promise.allSettled([
      getLinearMembers(),
      listSlackUsers(),
    ]);

    const linear = linearMembers.status === "fulfilled" ? linearMembers.value : [];
    const slackUsers = slackResult.status === "fulfilled" ? (slackResult.value.members ?? []) : [];

    // Build a map of email → slackId from Slack users
    const slackByEmail = new Map<string, string>();
    const slackByName = new Map<string, string>();
    for (const su of slackUsers) {
      const email = su.profile?.email?.toLowerCase();
      if (email) slackByEmail.set(email, su.id);
      const displayName = (su.profile?.display_name || su.real_name || "").toLowerCase();
      if (displayName) slackByName.set(displayName, su.id);
    }

    // Start with Linear members (they have real emails)
    const members: { name: string; email: string; slackId: string | null; source: string }[] = linear.map(m => {
      const emailKey = m.email.toLowerCase();
      const slackId = slackByEmail.get(emailKey)
        || slackByName.get((m.displayName || m.name).toLowerCase())
        || null;
      return {
        name: m.displayName || m.name,
        email: m.email,
        slackId,
        source: "linear",
      };
    });

    // Add Slack-only users (those with emails not already covered by Linear)
    const coveredEmails = new Set(members.map(m => m.email.toLowerCase()));
    for (const su of slackUsers) {
      const email = su.profile?.email;
      if (!email || coveredEmails.has(email.toLowerCase())) continue;
      members.push({
        name: su.profile?.display_name || su.real_name || su.name,
        email,
        slackId: su.id,
        source: "slack" as const,
      });
    }

    // Filter out bots, noreply, and obvious non-humans
    const filtered = members.filter(m => m.email && !m.email.includes("noreply") && !m.email.includes("bot@") && m.name);
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    res.json({ ok: true, members: filtered });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err), members: [] });
  }
});

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

  const liveContext = await getBusinessContext().catch(() => "");

  const msg = await createTrackedMessage("idea_classify", {
    model: "claude-haiku-4-5",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `You are Tony Diaz's AI classifier for FlipIQ ideas. Analyze this idea and return ONLY valid JSON.

BUSINESS CONTEXT:
${liveContext ? `LIVE BUSINESS DOCUMENTS (primary source):\n${liveContext}` : BUSINESS_PLAN}

RECENT IDEAS (for context):
${recentList}

NEW IDEA: "${text}"

Return EXACTLY this JSON:
{
  "category": "Tech|Sales|Marketing|Strategic Partners|Operations|Product|Personal",
  "urgency": "Now|This Week|This Month|Someday",
  "techType": "Bug|Feature|Note|Task|Strategic|null",
  "reason": "One sentence explaining why this category fits",
  "businessFit": "One sentence on how this moves the FlipIQ needle",
  "priority": "high|medium|low",
  "warningIfDistraction": "Optional: one sentence warning if this might distract Tony from sales"
}

IMPORTANT: Use techType "Task" when the idea is a concrete action item that should be checked against the 90-day plan. Use "Strategic" when the idea is a high-level strategic direction that Ethan should review. Use "Bug", "Feature", or "Idea" only for tech-related submissions.

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

  let classification: Awaited<ReturnType<typeof classifyIdea>>;
  try {
    classification = await classifyIdea(text, recentIdeas);
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
        pushback: null,
      }
    });
    return;
  }

  // ── Pushback: check against all business context documents ──
  let pushback: { message: string; priorityRank: number | null; action: "park" | "override" | "escalate" | null } | null = null;

  try {
    const contextDocs = await db.select().from(businessContextTable);
    const northStar = contextDocs.find(d => d.documentType === "north_star")?.content || "";
    const businessPlan = contextDocs.find(d => d.documentType === "business_plan")?.content || "";
    const ninetyDayPlan = contextDocs.find(d => d.documentType === "90_day_plan")?.content || "";

    const combinedContext = [
      northStar ? `NORTH STAR:\n${northStar.substring(0, 1000)}` : "",
      businessPlan ? `BUSINESS PLAN:\n${businessPlan.substring(0, 2000)}` : "",
      ninetyDayPlan ? `90-DAY PLAN:\n${ninetyDayPlan.substring(0, 2000)}` : "",
    ].filter(Boolean).join("\n\n");

    if (combinedContext) {
      const isTechBug = classification.category === "Tech" && classification.techType === "Bug";

      if (isTechBug) {
        pushback = {
          message: "Tech bug detected. Auto-posting to #engineering with severity + priority recommendation.",
          priorityRank: null,
          action: null,
        };
        postSlackMessage({
          channel: "C0A3CS15MPT",
          text: `*Bug Report (auto-filed from TCC)*\n\n> ${text}\n\n*Severity:* ${classification.urgency || "Unknown"}\n*Priority Recommendation:* ${classification.urgency === "Now" ? "P1" : classification.urgency === "This Week" ? "P2" : "P3"}`,
        }).catch(() => {});
      } else {
        const pushbackCheck = await createTrackedMessage("idea_classify", {
          model: "claude-haiku-4-5",
          max_tokens: 512,
          messages: [{
            role: "user",
            content: `Given these business priorities:\n${combinedContext}\n\nA new idea was submitted: "${text}"\n\nDoes this conflict with or distract from current priorities? If yes, estimate what priority rank (1-100) this would be on the 90-day plan. Is this unreasonable enough to park and escalate to Ethan?\n\nRespond as JSON only: { "conflicts": true/false, "rank": number|null, "reason": "brief explanation", "unreasonable": true/false }`,
          }],
        });

        const pushbackText = pushbackCheck.content.find(b => b.type === "text");
        if (pushbackText?.type === "text") {
          try {
            const raw = pushbackText.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
            const parsed2 = JSON.parse(raw);
            if (parsed2.unreasonable) {
              pushback = {
                message: "I'm parking this and booking a meeting with Ethan to discuss.",
                priorityRank: parsed2.rank ?? null,
                action: "escalate",
              };
            } else if (parsed2.conflicts && parsed2.rank && parsed2.rank > 10) {
              pushback = {
                message: `This is #${parsed2.rank} on your 90-day plan. Convince me why it should jump to #1.`,
                priorityRank: parsed2.rank,
                action: "park",
              };
            }
          } catch { /* ignore parse errors */ }
        }
      }
    }
  } catch { /* non-critical — pushback stays null */ }

  // ── Special handling: Task type → check 90-day plan ──
  let additionalContext: string | null = null;
  if (classification.techType === "Task") {
    try {
      const ninetyDayDoc = await db.select().from(businessContextTable).limit(10);
      const plan = ninetyDayDoc.find(d => d.documentType === "90_day_plan");
      if (plan?.content) {
        additionalContext = `This idea was classified as a "Task". It has been checked against your 90-day plan:\n${plan.content.substring(0, 1500)}`;
      }
    } catch { /* non-critical */ }
  }

  // ── Special handling: Strategic type → flag for Ethan review ──
  if (classification.techType === "Strategic" && !pushback) {
    pushback = {
      message: "This is a strategic-level idea. It has been flagged for Ethan review — park it and schedule time to discuss.",
      priorityRank: null,
      action: "escalate",
    };
  }

  res.json({ ok: true, classification: { ...classification, pushback, additionalContext } });
});

router.post("/ideas/notify-override", async (req, res): Promise<void> => {
  const { text, justification } = req.body as { text?: string; justification?: string };
  try {
    await postSlackMessage({
      channel: "C0A3CS15MPT",
      text: `*Priority Override Alert*\n\nTony overrode the 90-day plan to prioritize:\n> ${text || "Unknown idea"}\n\n*Justification:* ${justification || "No justification provided"}`,
    });
    postSlackMessage({
      channel: "U0991BD321Y",
      text: `Tony overrode the plan. New priority: "${text || ""}". Justification: ${justification || "None"}`,
    }).catch(() => {});
    res.json({ ok: true });
  } catch {
    res.json({ ok: true, slackFailed: true });
  }
});

router.post("/ideas/escalate-to-ethan", async (req, res): Promise<void> => {
  const { text, rank, reasoning } = req.body as { text?: string; rank?: number; reasoning?: string };
  try {
    await postSlackMessage({
      channel: "U0991BD321Y",
      text: `*Idea Parked + Meeting Requested*\n\nTony submitted an idea that was flagged as out-of-scope and auto-parked:\n> ${text || ""}\n\nPlease schedule a meeting to discuss if this should be prioritized.`,
    });

    try {
      const { createEvent } = await import("../../lib/gcal");
      const nextSlot = new Date();
      nextSlot.setDate(nextSlot.getDate() + 1);
      nextSlot.setHours(14, 0, 0, 0);
      if (nextSlot.getDay() === 0) nextSlot.setDate(nextSlot.getDate() + 1);
      if (nextSlot.getDay() === 6) nextSlot.setDate(nextSlot.getDate() + 2);
      const endSlot = new Date(nextSlot.getTime() + 30 * 60 * 1000);

      await createEvent({
        summary: `Review plan change with Ethan — "${(text || "").substring(0, 50)}"`,
        start: nextSlot.toISOString(),
        end: endSlot.toISOString(),
        attendees: ["ethan@flipiq.com"],
        description: `Tony submitted: "${text}"\nAI priority: #${rank || "unknown"}\nTony's reasoning: "${reasoning || "Auto-parked, no justification"}"`,
      });
    } catch { /* calendar creation non-critical */ }

    res.json({ ok: true });
  } catch {
    res.json({ ok: true, slackFailed: true });
  }
});

const NotifyAssigneeBody = z.object({
  ideaText: z.string().min(1),
  category: z.string(),
  urgency: z.string(),
  dueDate: z.string(),
  assigneeName: z.string(),
  assigneeEmail: z.string().email(),
  slackUserId: z.string().optional(),
  notifyChannels: z.array(z.enum(["email", "slack"])).default(["email"]),
  note: z.string().optional(),
});

router.post("/ideas/notify-assignee", async (req, res): Promise<void> => {
  const parsed = NotifyAssigneeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { ideaText, category, urgency, dueDate, assigneeName, assigneeEmail, slackUserId, notifyChannels, note } = parsed.data;
  const results: Record<string, boolean> = {};

  try {
    if (notifyChannels.includes("email")) {
      try {
        const { sendEmail } = await import("../../lib/gmail");
        const subject = `[FlipIQ] Action Item Assigned to You: ${ideaText.substring(0, 60)}`;
        const body = [
          `Hi ${assigneeName},`,
          "",
          `Tony Diaz has assigned you an action item from FlipIQ's idea pipeline.`,
          "",
          `Idea: ${ideaText}`,
          `Category: ${category}`,
          `Urgency: ${urgency}`,
          `Due Date: ${dueDate}`,
          ...(note ? [``, `Note from Tony: ${note}`] : []),
          "",
          "Please action this by the due date.",
          "",
          "— FlipIQ Command Center",
        ].join("\n");
        const result = await sendEmail({ to: assigneeEmail, subject, body });
        results.email = result.ok;
      } catch {
        results.email = false;
      }
    }

    if (notifyChannels.includes("slack") && slackUserId) {
      try {
        const slackResult = await notifyAssigneeViaSlack({
          slackUserId,
          ideaText,
          category,
          urgency,
          dueDate,
          assigneeName,
          note,
        });
        results.slack = slackResult.ok;
      } catch {
        results.slack = false;
      }
    }

    res.json({ ok: true, results });
  } catch (err) {
    req.log.error({ err }, "notify-assignee route error");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

const CreateIdeaBody = z.object({
  text: z.string().min(1),
  category: z.string(),
  urgency: z.string(),
  techType: z.string().nullable().optional(),
  assigneeName: z.string().optional(),
  assigneeEmail: z.string().email().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  aiReflection: z.string().optional(), // JSON string of AI classification result
});

router.post("/ideas", async (req, res): Promise<void> => {
  const parsed = CreateIdeaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text, category, urgency, techType, assigneeName, assigneeEmail, dueDate, aiReflection } = parsed.data;

  const existingIdeas = await db.select().from(ideasTable).orderBy(desc(ideasTable.createdAt));
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
      assigneeName: assigneeName || undefined,
      assigneeEmail: assigneeEmail || undefined,
      dueDate: dueDate || undefined,
      aiReflection: aiReflection || undefined,
    })
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
        if (linearIssue.identifier) {
          await db.update(ideasTable).set({ linearIdentifier: linearIssue.identifier }).where(eq(ideasTable.id, idea.id)).catch(() => {});
        }
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

// ─── Generate task fields from an approved idea via AI ────────────────────────
router.post("/ideas/generate-task", async (req, res): Promise<void> => {
  try {
    const { ideaText, category, urgency, techType } = req.body as {
      ideaText: string; category: string; urgency: string; techType?: string;
    };
    if (!ideaText) { res.status(400).json({ error: "ideaText required" }); return; }

    const bizContext = await getBusinessContext();

    const claudeResponse = await createTrackedMessage("idea_classify", {
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: `You are the FlipIQ task creation assistant. Given an idea, generate structured task fields for the 411 Plan.

Available categories and their subcategories:
- adaptation: Operator Assessment, CS Dashboard, User Outreach, Success Playbook, Dead Weight Suspension
- sales: Pricing & Approach, Commitments Pipeline, Demo Workflow, Sales Materials, Prospect Pipeline
- tech: CS Dashboard (Tech), Foundation + DispoPro, AWS/Cloud Credits, AAA Build, USale Marketplace
- capital: Loan Direction Decision, P&L / Financial Plan, Investor Meetings, Kiavi Broker, Nema/Lightning Docs
- team: PM/Engineer Hire, Onboarding Manager, Adaptation Manager, Nate Transition, SOW Updates

Owners: Tony, Ethan, Ramy, Faisal, Haris, Nate, Bondilyn, Chris, TBD PM
Priorities: P0 (critical, blocks revenue today), P1 (high, must ship this week), P2 (standard, this sprint)
Execution tiers: Sprint (weekly deliverable), Strategic (multi-week initiative), Maintenance (ongoing)
Sources: OAP, Linear, TCC, manual

Business context:
${bizContext}

Return ONLY valid JSON with these exact fields:
{
  "title": "Owner: action description",
  "category": "adaptation|sales|tech|capital|team",
  "subcategoryName": "exact subcategory name from list above",
  "owner": "Tony|Ethan|Ramy|Faisal|Haris|Nate|Bondilyn|Chris|TBD PM",
  "coOwner": "Tony|Ethan|Ramy|Faisal|Haris|Nate|Bondilyn|Chris|TBD PM|null",
  "priority": "P0|P1|P2",
  "executionTier": "Sprint|Strategic|Maintenance",
  "atomicKpi": "how this moves toward 2 deals/month",
  "source": "TCC",
  "workNotes": "context from the original idea"
}

Set coOwner to whoever should support the primary owner based on idea domain and team expertise. Use null if no clear second owner.`,
      messages: [{ role: "user", content: `Idea category: ${category}\nUrgency: ${urgency}${techType ? `\nType: ${techType}` : ""}\n\nIdea: "${ideaText}"\n\nGenerate task fields.` }],
    });

    const textBlock = claudeResponse.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") { res.json({ ok: false, error: "No response" }); return; }
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.json({ ok: false, error: "No JSON in AI response" }); return; }

    const taskFields = JSON.parse(jsonMatch[0]);
    // Ensure source is always TCC for idea-generated tasks
    taskFields.source = "TCC";
    // Map urgency to due date if not set
    if (!taskFields.dueDate) {
      const now = new Date();
      if (urgency === "Now") taskFields.dueDate = now.toISOString().split("T")[0];
      else if (urgency === "This Week") {
        const fri = new Date(now); fri.setDate(fri.getDate() + (5 - fri.getDay())); taskFields.dueDate = fri.toISOString().split("T")[0];
      } else if (urgency === "This Month") {
        const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0); taskFields.dueDate = eom.toISOString().split("T")[0];
      }
    }

    res.json({ ok: true, taskFields });
  } catch (err) {
    console.warn("[Ideas] generate-task failed:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Failed to generate task fields" });
  }
});

// ─── PATCH /ideas/:id — edit an idea ──────────────────────────────────────────
router.patch("/ideas/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  const body = req.body as Record<string, unknown>;
  const updateFields: Record<string, unknown> = {};
  if ("text" in body) updateFields.text = String(body.text);
  if ("category" in body) updateFields.category = String(body.category);
  if ("urgency" in body) updateFields.urgency = String(body.urgency);
  if ("techType" in body) updateFields.techType = body.techType ? String(body.techType) : null;
  if ("status" in body) updateFields.status = String(body.status);
  if ("assigneeName" in body) updateFields.assigneeName = body.assigneeName ? String(body.assigneeName) : null;
  if ("assigneeEmail" in body) updateFields.assigneeEmail = body.assigneeEmail ? String(body.assigneeEmail) : null;
  if ("dueDate" in body) updateFields.dueDate = body.dueDate ? String(body.dueDate) : null;
  if ("aiReflection" in body) updateFields.aiReflection = body.aiReflection ? String(body.aiReflection) : null;

  try {
    const [updated] = await db.update(ideasTable).set(updateFields).where(eq(ideasTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Idea not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── DELETE /ideas/:id — delete an idea ──────────────────────────────────────
router.delete("/ideas/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  try {
    const [deleted] = await db.delete(ideasTable).where(eq(ideasTable.id, id)).returning({ id: ideasTable.id });
    if (!deleted) { res.status(404).json({ error: "Idea not found" }); return; }
    res.json({ ok: true, id: deleted.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /ideas/:id/rethink — re-classify an existing idea via AI ──────────
router.post("/ideas/:id/rethink", async (req, res): Promise<void> => {
  const { id } = req.params;
  try {
    const [idea] = await db.select().from(ideasTable).where(eq(ideasTable.id, id)).limit(1);
    if (!idea) { res.status(404).json({ error: "Idea not found" }); return; }

    // Re-classify using the same AI flow
    const recentIdeas = await db.select().from(ideasTable).orderBy(desc(ideasTable.createdAt)).limit(5);
    const classification = await classifyIdea(idea.text, recentIdeas);

    // Update idea with new classification
    const [updated] = await db.update(ideasTable).set({
      category: classification.category,
      urgency: classification.urgency,
      techType: classification.techType || null,
    }).where(eq(ideasTable.id, id)).returning();

    res.json({ ok: true, idea: updated, classification });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

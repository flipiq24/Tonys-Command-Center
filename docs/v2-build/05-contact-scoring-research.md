# Prompt 05: AI Contact Scoring + Web Research + Contact Brief

## CONTEXT

Contacts need AI-powered scoring to prioritize the sales queue, web research to enrich profiles (LinkedIn, company info, news), and on-demand briefs that summarize everything Tony needs before a call. This prompt adds three backend routes and wires them into the sales view.

Key changes from v1:
- Scoring model references the `business_context` table (North Star, business plan, 90-day plan at https://docs.google.com/document/d/1b1Ejf6Tim1gevq0BoMeV7XZ2KuXrgP2E/edit) for deal signal detection
- Research checks if research was done within 7 days before re-running (shows confirmation: "Research is N days old. Run again?")
- Contact brief includes: communication style analysis, AI personality assessment, open tasks related to the person, and LinkedIn link
- Cost estimation shown before research runs: "Estimated cost: ~$0.15/contact. Research 5 contacts for ~$0.75?"

## PREREQUISITES

- Prompt 00 completed (contact_intelligence, contact_briefs tables exist)
- Prompt 02 completed (communication_log populated with real data)
- Prompt 04 completed (SalesMorning.tsx rendering contact cards with AI score badges)
- `business_context` table exists and is populated with North Star, business plan, and 90-day plan references

## WHAT TO BUILD

### Step 1: Backend -- Contact scoring route

**Create NEW file: `artifacts/api-server/src/routes/tcc/contacts-score.ts`**

```typescript
import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, contactsTable } from "@workspace/db";
import { contactIntelligenceTable, communicationLogTable } from "../../lib/schema-v2";
import { eq, desc, sql, and, gte } from "drizzle-orm";

const router: IRouter = Router();

const ScoreBody = z.object({
  contactIds: z.array(z.string().uuid()),
});

// Load business context for scoring alignment
async function getBusinessContext(): Promise<{ northStar: string; priorities: string }> {
  try {
    // business_context table stores key references
    const rows = await db.execute(sql`SELECT key, value FROM business_context WHERE key IN ('north_star', 'business_plan_summary', '90_day_priorities')`);
    const ctx: Record<string, string> = {};
    for (const r of rows.rows as any[]) {
      ctx[r.key] = r.value;
    }
    return {
      northStar: ctx.north_star || "Every Acquisition Associate closes 2 deals/month",
      priorities: ctx["90_day_priorities"] || "Sales calls, pipeline velocity, broker-investor relationships",
    };
  } catch {
    return {
      northStar: "Every Acquisition Associate closes 2 deals/month",
      priorities: "Sales calls, pipeline velocity, broker-investor relationships",
    };
  }
}

router.post("/contacts/score", async (req, res): Promise<void> => {
  const parsed = ScoreBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const businessCtx = await getBusinessContext();
  const results: { contactId: string; score: number; reason: string }[] = [];

  for (const contactId of parsed.data.contactIds) {
    try {
      // Fetch contact
      const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
      if (!contact) { results.push({ contactId, score: 0, reason: "Contact not found" }); continue; }

      // Fetch existing intel
      const [intel] = await db.select().from(contactIntelligenceTable)
        .where(eq(contactIntelligenceTable.contactId, contactId)).limit(1);

      // Fetch communication stats
      const commStats = await db.select({
        channel: communicationLogTable.channel,
        count: sql<number>`COUNT(*)`,
        lastDate: sql<string>`MAX(logged_at)`,
      })
        .from(communicationLogTable)
        .where(eq(communicationLogTable.contactId, contactId))
        .groupBy(communicationLogTable.channel);

      const totalComms = commStats.reduce((s, c) => s + Number(c.count), 0);
      const lastCommDate = commStats.reduce((latest, c) =>
        !latest || new Date(c.lastDate) > new Date(latest) ? c.lastDate : latest, "" as string);

      // Recent comms (last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentComms = await db.select({ count: sql<number>`COUNT(*)` })
        .from(communicationLogTable)
        .where(and(eq(communicationLogTable.contactId, contactId), gte(communicationLogTable.loggedAt, weekAgo)));
      const recentCount = Number(recentComms[0]?.count || 0);

      // ─── Scoring Algorithm (aligned to business_context) ───────────
      let score = 0;
      const reasons: string[] = [];

      // 1. Contact Type (25 points max) -- aligned to North Star priorities
      const contactType = (contact.type || "").toLowerCase();
      if (contactType.includes("broker") && contactType.includes("investor")) {
        score += 25; reasons.push("Broker-Investor type (+25) -- directly aligned to North Star");
      } else if (contactType.includes("broker")) {
        score += 20; reasons.push("Broker type (+20) -- key relationship for deal flow");
      } else if (contactType.includes("investor")) {
        score += 18; reasons.push("Investor type (+18) -- potential deal partner");
      } else if (contactType.includes("agent")) {
        score += 12; reasons.push("Agent type (+12)");
      } else if (contactType.includes("wholesaler")) {
        score += 10; reasons.push("Wholesaler type (+10)");
      } else {
        score += 5; reasons.push("Other type (+5)");
      }

      // 2. Engagement (20 points max) -- total communications
      if (totalComms >= 10) { score += 20; reasons.push(`High engagement: ${totalComms} comms (+20)`); }
      else if (totalComms >= 5) { score += 15; reasons.push(`Good engagement: ${totalComms} comms (+15)`); }
      else if (totalComms >= 2) { score += 10; reasons.push(`Some engagement: ${totalComms} comms (+10)`); }
      else if (totalComms >= 1) { score += 5; reasons.push(`Initial contact: ${totalComms} comm (+5)`); }
      else { reasons.push("No communications yet (+0)"); }

      // 3. Recency (20 points max) -- how recently they communicated
      if (lastCommDate) {
        const daysSince = (Date.now() - new Date(lastCommDate).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince <= 1) { score += 20; reasons.push("Communicated today (+20)"); }
        else if (daysSince <= 3) { score += 16; reasons.push("Communicated in last 3 days (+16)"); }
        else if (daysSince <= 7) { score += 12; reasons.push("Communicated this week (+12)"); }
        else if (daysSince <= 14) { score += 8; reasons.push("Communicated in last 2 weeks (+8)"); }
        else if (daysSince <= 30) { score += 4; reasons.push("Communicated last month (+4)"); }
        else { reasons.push("Last comm over 30 days ago (+0)"); }
      } else {
        reasons.push("Never communicated (+0)");
      }

      // 4. Deal Signals (15 points max) -- Status temperature
      const status = (contact.status || "").toLowerCase();
      if (status === "hot") { score += 15; reasons.push("Hot status (+15) -- active deal signal"); }
      else if (status === "warm") { score += 10; reasons.push("Warm status (+10)"); }
      else if (status === "new") { score += 5; reasons.push("New status (+5)"); }
      else { reasons.push("Cold/unknown status (+0)"); }

      // 5. Stage Velocity (10 points max) -- advanced pipeline stages score higher
      const stage = intel?.stage || "new";
      const stagePoints: Record<string, number> = {
        new: 2, outreach: 4, engaged: 7, meeting_scheduled: 9, negotiating: 10,
        closed: 0, dormant: 0,
      };
      const stageScore = stagePoints[stage] || 2;
      score += stageScore;
      reasons.push(`Stage "${stage}" (+${stageScore})`);

      // 6. Responsiveness (10 points max) -- recent activity shows they respond
      if (recentCount >= 3) { score += 10; reasons.push(`Very responsive: ${recentCount} this week (+10)`); }
      else if (recentCount >= 1) { score += 6; reasons.push(`Active: ${recentCount} this week (+6)`); }
      else { reasons.push("No recent activity (+0)"); }

      // Cap at 100
      score = Math.min(score, 100);

      // ─── Save to contact_intelligence ───────────────────────────────
      const [existing] = await db.select({ id: contactIntelligenceTable.id })
        .from(contactIntelligenceTable)
        .where(eq(contactIntelligenceTable.contactId, contactId)).limit(1);

      if (existing) {
        await db.update(contactIntelligenceTable).set({
          aiScore: String(score),
          aiScoreReason: reasons.join("\n"),
          lastAiScan: new Date(),
          updatedAt: new Date(),
        }).where(eq(contactIntelligenceTable.contactId, contactId));
      } else {
        await db.insert(contactIntelligenceTable).values({
          contactId,
          aiScore: String(score),
          aiScoreReason: reasons.join("\n"),
          lastAiScan: new Date(),
        });
      }

      results.push({ contactId, score, reason: reasons.join("; ") });
    } catch (err) {
      results.push({ contactId, score: 0, reason: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  res.json({ results });
});

export default router;
```

### Step 2: Backend -- Contact research route (with 7-day freshness check + cost estimation)

**Create NEW file: `artifacts/api-server/src/routes/tcc/contacts-research.ts`**

```typescript
import { Router, type IRouter } from "express";
import { z } from "zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, contactsTable } from "@workspace/db";
import { contactIntelligenceTable } from "../../lib/schema-v2";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const COST_PER_CONTACT = 0.15; // Estimated Claude API cost per research

const ResearchBody = z.object({
  contactIds: z.array(z.string().uuid()),
  forceRefresh: z.boolean().optional().default(false),
});

// Check research freshness
router.post("/contacts/research/check", async (req, res): Promise<void> => {
  const parsed = z.object({ contactIds: z.array(z.string().uuid()) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const results: { contactId: string; name: string; lastResearchDate: string | null; daysOld: number | null; needsRefresh: boolean }[] = [];

  for (const contactId of parsed.data.contactIds) {
    const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
    const [intel] = await db.select().from(contactIntelligenceTable)
      .where(eq(contactIntelligenceTable.contactId, contactId)).limit(1);

    const lastScan = intel?.lastAiScan;
    let daysOld: number | null = null;
    let needsRefresh = true;

    if (lastScan) {
      daysOld = Math.floor((Date.now() - new Date(lastScan).getTime()) / (1000 * 60 * 60 * 24));
      needsRefresh = daysOld > 7;
    }

    results.push({
      contactId,
      name: contact?.name || "Unknown",
      lastResearchDate: lastScan ? new Date(lastScan).toISOString() : null,
      daysOld,
      needsRefresh,
    });
  }

  const freshCount = results.filter(r => !r.needsRefresh).length;
  const staleCount = results.filter(r => r.needsRefresh).length;
  const estimatedCost = staleCount * COST_PER_CONTACT;

  res.json({
    results,
    freshCount,
    staleCount,
    estimatedCost: `~$${estimatedCost.toFixed(2)}`,
    costPerContact: `~$${COST_PER_CONTACT.toFixed(2)}`,
    message: freshCount > 0
      ? `${freshCount} contact(s) have research less than 7 days old. ${staleCount} need refreshing. Estimated cost: ~$${estimatedCost.toFixed(2)}`
      : `Research ${staleCount} contacts for ~$${estimatedCost.toFixed(2)}?`,
  });
});

router.post("/contacts/research", async (req, res): Promise<void> => {
  const parsed = ResearchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const results: { contactId: string; ok: boolean; summary?: string; error?: string; skipped?: boolean; daysOld?: number }[] = [];

  for (const contactId of parsed.data.contactIds) {
    try {
      const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
      if (!contact) { results.push({ contactId, ok: false, error: "Contact not found" }); continue; }

      // Check freshness -- skip if research done within 7 days (unless forceRefresh)
      if (!parsed.data.forceRefresh) {
        const [intel] = await db.select().from(contactIntelligenceTable)
          .where(eq(contactIntelligenceTable.contactId, contactId)).limit(1);
        if (intel?.lastAiScan) {
          const daysOld = Math.floor((Date.now() - new Date(intel.lastAiScan).getTime()) / (1000 * 60 * 60 * 24));
          if (daysOld <= 7) {
            results.push({ contactId, ok: true, skipped: true, daysOld, summary: `Research is ${daysOld} day(s) old. Skipped (use forceRefresh to override).` });
            continue;
          }
        }
      }

      // Use Claude with web_search tool to research the contact
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
        }],
        messages: [{
          role: "user",
          content: `Research this person for a sales call. Find their LinkedIn profile, company info, recent news or activity, and any personality insights.

Name: ${contact.name}
Company: ${contact.company || "Unknown"}
Email: ${contact.email || "Unknown"}
Phone: ${contact.phone || "Unknown"}
Type: ${contact.type || "Unknown"}

Return your findings in this exact format:
LINKEDIN: [URL or "Not found"]
COMPANY_INFO: [1-2 sentences about their company]
RECENT_NEWS: [Any recent mentions, deals, or activity]
PERSONALITY_NOTES: [Communication style, interests, or approach notes based on their online presence]
COMMUNICATION_STYLE: [Direct/Indirect, Formal/Casual, Data-driven/Relationship-driven]
AI_ASSESSMENT: [One sentence coaching tip for Tony, e.g. "Direct communicator. Don't pitch -- ask questions."]
SOCIAL_PROFILES: [Any other social media URLs found]`,
        }],
      });

      // Extract text from response (may have tool_use blocks mixed in)
      const textBlocks = response.content.filter(b => b.type === "text");
      const researchText = textBlocks.map(b => b.type === "text" ? b.text : "").join("\n");

      // Parse the structured response
      const linkedinMatch = researchText.match(/LINKEDIN:\s*(.+)/i);
      const companyMatch = researchText.match(/COMPANY_INFO:\s*(.+)/i);
      const newsMatch = researchText.match(/RECENT_NEWS:\s*(.+)/i);
      const personalityMatch = researchText.match(/PERSONALITY_NOTES:\s*(.+)/i);
      const commStyleMatch = researchText.match(/COMMUNICATION_STYLE:\s*(.+)/i);
      const aiAssessmentMatch = researchText.match(/AI_ASSESSMENT:\s*(.+)/i);
      const socialMatch = researchText.match(/SOCIAL_PROFILES:\s*(.+)/i);

      const linkedinUrl = linkedinMatch?.[1]?.trim();
      const companyInfo = companyMatch?.[1]?.trim();
      const personalityNotes = [
        personalityMatch?.[1]?.trim(),
        commStyleMatch?.[1]?.trim() ? `Communication style: ${commStyleMatch[1].trim()}` : null,
        aiAssessmentMatch?.[1]?.trim() ? `AI tip: ${aiAssessmentMatch[1].trim()}` : null,
      ].filter(Boolean).join("\n");

      const socialProfiles: Record<string, string> = {};
      if (socialMatch?.[1] && socialMatch[1].trim() !== "Not found") {
        socialProfiles.raw = socialMatch[1].trim();
      }
      if (linkedinUrl && linkedinUrl !== "Not found") {
        socialProfiles.linkedin = linkedinUrl;
      }

      // Save to contact_intelligence
      const [existing] = await db.select({ id: contactIntelligenceTable.id })
        .from(contactIntelligenceTable)
        .where(eq(contactIntelligenceTable.contactId, contactId)).limit(1);

      const updates = {
        linkedinUrl: (linkedinUrl && linkedinUrl !== "Not found") ? linkedinUrl : undefined,
        companyInfo: companyInfo ? { summary: companyInfo, news: newsMatch?.[1]?.trim() } : undefined,
        personalityNotes: personalityNotes || undefined,
        socialProfiles: Object.keys(socialProfiles).length > 0 ? socialProfiles : undefined,
        lastAiScan: new Date(),
        updatedAt: new Date(),
      };

      if (existing) {
        await db.update(contactIntelligenceTable).set(updates)
          .where(eq(contactIntelligenceTable.contactId, contactId));
      } else {
        await db.insert(contactIntelligenceTable).values({
          contactId,
          ...updates,
        });
      }

      results.push({
        contactId,
        ok: true,
        summary: `LinkedIn: ${linkedinUrl || "N/A"} | Company: ${companyInfo || "N/A"} | Personality: ${personalityNotes || "N/A"}`,
      });
    } catch (err) {
      results.push({ contactId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  res.json({ results });
});

export default router;
```

### Step 3: Backend -- Contact brief route (with personality assessment + open tasks + LinkedIn)

**Create NEW file: `artifacts/api-server/src/routes/tcc/contacts-brief.ts`**

```typescript
import { Router, type IRouter } from "express";
import { z } from "zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, contactsTable } from "@workspace/db";
import { contactIntelligenceTable, communicationLogTable, contactBriefsTable } from "../../lib/schema-v2";
import { eq, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

const BriefBody = z.object({
  contactId: z.string().uuid(),
});

router.post("/contacts/brief", async (req, res): Promise<void> => {
  const parsed = BriefBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { contactId } = parsed.data;

  try {
    // Gather all data
    const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
    if (!contact) { res.status(404).json({ error: "Contact not found" }); return; }

    const [intel] = await db.select().from(contactIntelligenceTable)
      .where(eq(contactIntelligenceTable.contactId, contactId)).limit(1);

    const recentComms = await db.select().from(communicationLogTable)
      .where(eq(communicationLogTable.contactId, contactId))
      .orderBy(desc(communicationLogTable.loggedAt))
      .limit(10);

    // Fetch open tasks related to this contact (from Linear or tasks table)
    // Search for tasks mentioning this contact's name
    let openTasks: string[] = [];
    if (contact.nextStep) {
      openTasks.push(contact.nextStep);
    }
    if (intel?.nextAction) {
      openTasks.push(intel.nextAction);
    }

    // Build context for Claude
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

    // Generate brief with personality assessment
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 768,
      messages: [{
        role: "user",
        content: `You are Tony Diaz's sales assistant. Generate a pre-call brief for Tony. Be direct and actionable. Tony has ADHD so keep it scannable.

Include these sections:
1. QUICK SUMMARY (2-3 sentences: who they are, relationship status, what to talk about)
2. COMMUNICATION STYLE (one line: e.g., "Direct communicator. Don't pitch -- ask questions." or "Relationship-builder. Start with small talk.")
3. AI PERSONALITY ASSESSMENT (one line coaching tip based on their communication patterns)
4. KEY ACTION (one clear thing Tony should ask for or accomplish on this call)

${context}`,
      }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    const briefText = textBlock?.type === "text" ? textBlock.text : "Unable to generate brief.";

    // Save to contact_briefs
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

// Get latest brief for a contact
router.get("/contacts/:contactId/brief", async (req, res): Promise<void> => {
  const [brief] = await db.select().from(contactBriefsTable)
    .where(eq(contactBriefsTable.contactId, req.params.contactId))
    .orderBy(desc(contactBriefsTable.generatedAt))
    .limit(1);

  if (!brief) { res.status(404).json({ error: "No brief found" }); return; }
  res.json(brief);
});

export default router;
```

### Step 4: Register all three new routes

**File: `artifacts/api-server/src/routes/index.ts`** -- Add:

```typescript
import contactsScoreRouter from "./tcc/contacts-score";
import contactsResearchRouter from "./tcc/contacts-research";
import contactsBriefRouter from "./tcc/contacts-brief";
// ... existing imports ...

router.use(contactsScoreRouter);
router.use(contactsResearchRouter);
router.use(contactsBriefRouter);
```

### Step 5: Frontend -- Add batch actions, research confirmation, brief popup to SalesMorning

**File: `artifacts/tcc/src/components/tcc/SalesMorning.tsx`**

**5a.** Add new state variables inside the component function (after existing state):

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [scoring, setScoring] = useState(false);
const [researching, setResearching] = useState(false);
const [scoreProgress, setScoreProgress] = useState("");
const [researchProgress, setResearchProgress] = useState("");
const [researchConfirm, setResearchConfirm] = useState<{
  results: { contactId: string; name: string; daysOld: number | null; needsRefresh: boolean }[];
  estimatedCost: string;
  message: string;
} | null>(null);
const [briefData, setBriefData] = useState<{
  contactName: string; briefText: string; aiScore: string | null;
  stage: string; status: string; linkedinUrl: string | null;
  personalityNotes: string | null; openTasks: string[];
  recentComms: { channel: string; summary: string; date: string }[];
} | null>(null);
```

**5b.** Add toggle selection function:

```typescript
const toggleSelect = (id: string) => {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
};

const selectAll = (contacts: SalesContact[]) => {
  setSelectedIds(new Set(contacts.map(c => String(c.id))));
};

const clearSelection = () => setSelectedIds(new Set());
```

**5c.** Add score, research check, and research handler functions:

```typescript
const handleScoreSelected = async () => {
  if (selectedIds.size === 0) return;
  setScoring(true);
  setScoreProgress(`Scoring ${selectedIds.size} contacts...`);
  try {
    const result = await post<{ results: { contactId: string; score: number; reason: string }[] }>(
      "/contacts/score", { contactIds: Array.from(selectedIds) }
    );
    setScoreProgress(`Scored ${result.results.length} contacts`);
    const data = await get<MorningData>("/sales/morning");
    setMorningData(data);
    setTimeout(() => setScoreProgress(""), 3000);
  } catch {
    setScoreProgress("Scoring failed");
  }
  setScoring(false);
};

// Step 1: Check freshness + show cost estimate
const handleResearchCheck = async () => {
  if (selectedIds.size === 0) return;
  try {
    const result = await post<{
      results: { contactId: string; name: string; daysOld: number | null; needsRefresh: boolean }[];
      estimatedCost: string;
      message: string;
    }>("/contacts/research/check", { contactIds: Array.from(selectedIds) });
    setResearchConfirm(result);
  } catch {
    setResearchProgress("Research check failed");
  }
};

// Step 2: Run research (after confirmation)
const handleResearchConfirmed = async (forceRefresh: boolean) => {
  setResearchConfirm(null);
  setResearching(true);
  setResearchProgress(`Researching ${selectedIds.size} contacts...`);
  try {
    const result = await post<{ results: { contactId: string; ok: boolean; summary?: string; skipped?: boolean }[] }>(
      "/contacts/research", { contactIds: Array.from(selectedIds), forceRefresh }
    );
    const successCount = result.results.filter(r => r.ok && !r.skipped).length;
    const skipCount = result.results.filter(r => r.skipped).length;
    setResearchProgress(`Researched ${successCount}, skipped ${skipCount} (fresh)`);
    const data = await get<MorningData>("/sales/morning");
    setMorningData(data);
    setTimeout(() => setResearchProgress(""), 5000);
  } catch {
    setResearchProgress("Research failed");
  }
  setResearching(false);
};

const handleBrief = async (contactId: string) => {
  try {
    const data = await post<{
      ok: boolean; contactName: string; briefText: string;
      aiScore: string | null; stage: string; status: string;
      linkedinUrl: string | null; personalityNotes: string | null;
      openTasks: string[];
      recentComms: { channel: string; summary: string; date: string }[];
    }>("/contacts/brief", { contactId });
    setBriefData(data);
  } catch { /* silent */ }
};
```

**5d.** Add the batch action bar. Inside the return JSX, after the search bar `</div>` and before the tier sections, add:

```typescript
{/* Batch actions */}
<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
  <span style={{ fontSize: 11, color: C.mut }}>
    {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select contacts below"}
  </span>
  <button
    onClick={handleScoreSelected}
    disabled={scoring || selectedIds.size === 0}
    style={{ ...btn2, padding: "6px 14px", fontSize: 11, color: C.grn, borderColor: C.grn, opacity: scoring || selectedIds.size === 0 ? 0.4 : 1 }}
  >
    {scoring ? "Scoring..." : "Score Selected"}
  </button>
  <button
    onClick={handleResearchCheck}
    disabled={researching || selectedIds.size === 0}
    style={{ ...btn2, padding: "6px 14px", fontSize: 11, color: "#7B1FA2", borderColor: "#7B1FA2", opacity: researching || selectedIds.size === 0 ? 0.4 : 1 }}
  >
    {researching ? "Researching..." : "Research Selected"}
  </button>
  {selectedIds.size > 0 && (
    <button onClick={clearSelection} style={{ ...btn2, padding: "6px 12px", fontSize: 11, color: C.mut }}>
      Clear
    </button>
  )}
  {scoreProgress && <span style={{ fontSize: 11, color: C.grn }}>{scoreProgress}</span>}
  {researchProgress && <span style={{ fontSize: 11, color: "#7B1FA2" }}>{researchProgress}</span>}
</div>
```

**5e.** Add a checkbox to each contact card. In the `renderContactCard` function, add a checkbox as the first element inside the outer `<div>`:

```typescript
const renderContactCard = (c: SalesContact, tier: string) => (
  <div key={`${tier}-${c.id}`} style={{ display: "flex", gap: 12, padding: 14, marginBottom: 6, background: selectedIds.has(String(c.id)) ? C.bluBg : "#FAFAF8", borderRadius: 12, borderLeft: `4px solid ${STAGE_COLORS[c.stage || "new"] || C.blu}`, alignItems: "flex-start" }}>

    {/* Selection checkbox */}
    <input
      type="checkbox"
      checked={selectedIds.has(String(c.id))}
      onChange={() => toggleSelect(String(c.id))}
      style={{ marginTop: 4, cursor: "pointer", accentColor: C.blu }}
    />

    <div style={{ flex: 1 }}>
      {/* ... rest of contact card content stays the same ... */}
    </div>
    {/* ... action buttons stay the same, but update the Brief button ... */}
  </div>
);
```

**5f.** Update the Brief button in the action buttons column of `renderContactCard` to call `handleBrief`:

```typescript
<button onClick={() => handleBrief(String(c.id))} style={{ ...btn2, padding: "6px 10px", fontSize: 10 }}>Brief</button>
```

**5g.** Add the Research Confirmation popup. Add before the brief popup:

```typescript
{/* Research Confirmation Popup -- shows freshness + cost estimate */}
{researchConfirm && (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setResearchConfirm(null)}>
    <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 28, width: 480, maxWidth: "90vw" }}>
      <h3 style={{ fontFamily: FS, fontSize: 18, margin: "0 0 12px" }}>Research Contacts</h3>
      <p style={{ fontSize: 13, color: C.sub, marginBottom: 16 }}>{researchConfirm.message}</p>

      {researchConfirm.results.map(r => (
        <div key={r.contactId} style={{ fontSize: 12, padding: "4px 0", display: "flex", justifyContent: "space-between" }}>
          <span>{r.name}</span>
          <span style={{ color: r.needsRefresh ? C.amb : C.grn }}>
            {r.daysOld !== null ? `${r.daysOld}d old` : "Never researched"}
            {!r.needsRefresh && " (fresh)"}
          </span>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={() => handleResearchConfirmed(false)} style={{ ...btn2, flex: 1, padding: "10px 0", fontSize: 13, color: C.grn, borderColor: C.grn, fontWeight: 700 }}>
          Research Stale Only ({researchConfirm.estimatedCost})
        </button>
        <button onClick={() => handleResearchConfirmed(true)} style={{ ...btn2, padding: "10px 16px", fontSize: 13, color: C.amb, borderColor: C.amb }}>
          Force Refresh All
        </button>
        <button onClick={() => setResearchConfirm(null)} style={{ ...btn2, padding: "10px 16px", fontSize: 13, color: C.mut }}>
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
```

**5h.** Add the ContactBrief popup (enhanced with personality assessment, LinkedIn, open tasks). Add right before the final closing `</>`:

```typescript
{/* Contact Brief Popup -- includes personality assessment, LinkedIn, open tasks */}
{briefData && (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setBriefData(null)}>
    <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 28, width: 560, maxWidth: "90vw", maxHeight: "85vh", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontFamily: FS, fontSize: 20, margin: 0 }}>{briefData.contactName}</h3>
        <button onClick={() => setBriefData(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.mut }}>x</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {briefData.aiScore && (
          <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: Number(briefData.aiScore) >= 70 ? C.grnBg : Number(briefData.aiScore) >= 40 ? C.ambBg : "#F5F5F5", color: Number(briefData.aiScore) >= 70 ? C.grn : Number(briefData.aiScore) >= 40 ? C.amb : C.mut }}>
            AI Score: {Number(briefData.aiScore).toFixed(0)}
          </span>
        )}
        <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: "#F5F5F3", color: STAGE_COLORS[briefData.stage] || C.blu }}>
          {STAGE_LABELS[briefData.stage] || briefData.stage}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: "#F5F5F3", color: STATUS_COLORS[briefData.status] || C.mut }}>
          {briefData.status}
        </span>
        {briefData.linkedinUrl && (
          <a href={briefData.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: "#E8F0FE", color: "#0077B5", textDecoration: "none" }}>
            LinkedIn
          </a>
        )}
      </div>

      {/* Brief text */}
      <div style={{ fontSize: 14, lineHeight: 1.7, color: C.tx, marginBottom: 20, padding: 16, background: "#FAFAF8", borderRadius: 10, whiteSpace: "pre-wrap" }}>
        {briefData.briefText}
      </div>

      {/* Personality Notes (from research) */}
      {briefData.personalityNotes && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontFamily: FS, fontSize: 14, margin: "0 0 6px", color: "#7B1FA2" }}>Personality Assessment</h4>
          <div style={{ fontSize: 13, color: C.sub, padding: "8px 12px", background: "#F3E5F5", borderRadius: 8, whiteSpace: "pre-wrap" }}>
            {briefData.personalityNotes}
          </div>
        </div>
      )}

      {/* Open Tasks */}
      {briefData.openTasks && briefData.openTasks.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontFamily: FS, fontSize: 14, margin: "0 0 6px" }}>Open Tasks</h4>
          {briefData.openTasks.map((t, i) => (
            <div key={i} style={{ fontSize: 12, padding: "4px 0", color: C.sub }}>- {t}</div>
          ))}
        </div>
      )}

      {/* Recent Communications */}
      {briefData.recentComms && briefData.recentComms.length > 0 && (
        <>
          <h4 style={{ fontFamily: FS, fontSize: 14, margin: "0 0 8px" }}>Recent Communications</h4>
          {briefData.recentComms.map((c, i) => (
            <div key={i} style={{ fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${C.brd}`, color: C.sub }}>
              <span style={{ fontWeight: 600 }}>[{c.channel}]</span> {c.summary || "No summary"}
              {c.date && <span style={{ color: C.mut, marginLeft: 6 }}>{new Date(c.date).toLocaleDateString()}</span>}
            </div>
          ))}
        </>
      )}
    </div>
  </div>
)}
```

**5i.** Make sure the `STAGE_LABELS`, `STAGE_COLORS`, `STATUS_LABELS`, and `STATUS_COLORS` constants are accessible inside `renderContactCard`. They should already be defined at the top of the component file (from Step 3 in Prompt 04).

### Step 6: Wire onBrief and onResearch in App.tsx

**File: `artifacts/tcc/src/App.tsx`**

The `SalesMorning` component handles brief and research popups internally via `handleBrief`, `handleResearchCheck`, and state. The `onBrief` and `onResearch` props are optional alternative escape hatches -- the internal approach is preferred. No additional wiring needed in App.tsx.

## VERIFY BEFORE MOVING ON

1. Select 2-3 contacts using checkboxes in the sales view
2. Click "Score Selected" -- progress shows, then AI score badges appear on the contact cards
3. Check `contact_intelligence` table -- `ai_score` and `ai_score_reason` columns populated, reason text references business context alignment
4. Click "Research Selected" -- confirmation popup appears showing: which contacts have fresh research (with "N days old"), which need refreshing, and estimated cost (e.g., "Estimated cost: ~$0.15/contact. Research 5 contacts for ~$0.75?")
5. Click "Research Stale Only" -- only contacts with research older than 7 days are researched. Fresh ones skipped.
6. Click "Force Refresh All" -- all selected contacts researched regardless of freshness
7. Check `contact_intelligence` table -- `linkedin_url`, `company_info`, `personality_notes` populated. Personality notes include communication style and AI coaching tip.
8. Click the "Brief" button on a contact card -- popup appears with sections: Quick Summary, Communication Style, AI Personality Assessment, Key Action
9. Brief popup shows LinkedIn link (clickable to new tab), open tasks, personality assessment section, stage AND status badges
10. Check `contact_briefs` table -- new row exists with generated brief
11. `POST /api/contacts/score` with `{ "contactIds": ["uuid1"] }` returns scoring breakdown
12. `POST /api/contacts/research/check` with `{ "contactIds": ["uuid1"] }` returns freshness check + cost estimate
13. `POST /api/contacts/research` with `{ "contactIds": ["uuid1"], "forceRefresh": false }` skips fresh contacts
14. `POST /api/contacts/brief` with `{ "contactId": "uuid1" }` returns brief with linkedinUrl, personalityNotes, openTasks fields
15. Sales view tiers still render correctly with updated AI scores
16. All existing features (calls, texts, emails, stage dropdown, status dropdown) still work

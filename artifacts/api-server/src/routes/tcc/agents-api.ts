// /api/agents/* — settings dashboard backend.
// Phase 0: training-state + start training run + minimal proposals list.
// Phase 6 will flesh this out with memory edit, run history, full dashboard.

import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, agentTrainingRunsTable, agentMemoryProposalsTable, agentFeedbackTable, agentSkillsTable, agentMemoryEntriesTable, agentRunsTable } from "@workspace/db";
import { and, eq, desc, isNull, sql, inArray, asc } from "drizzle-orm";
import { getTrainingState, applyApprovedProposal, rejectProposal } from "../../agents/proposals.js";
import { analyzeFeedback } from "../../agents/coach.js";
import { snapshotFlags } from "../../agents/flags.js";

const router: IRouter = Router();

// ── List specialists (sidebar) ───────────────────────────────────────────────
router.get("/agents", async (_req, res): Promise<void> => {
  // Distinct agents from agent_skills + flag state
  const rows = await db.selectDistinct({ agent: agentSkillsTable.agent }).from(agentSkillsTable);
  const flags = snapshotFlags();
  res.json({
    agents: rows.map(r => ({
      name: r.agent,
      runtime_enabled: flags[`AGENT_RUNTIME_${r.agent.toUpperCase()}`] === true,
    })),
    feedback_pipeline_enabled: flags.FEEDBACK_PIPELINE_ENABLED === true,
  });
});

// ── Training state for one agent (drives Train button + badge) ───────────────
router.get("/agents/:agent/training-state", async (req, res): Promise<void> => {
  const agent = req.params.agent;
  if (!agent) { res.status(400).json({ error: "agent required" }); return; }
  const state = await getTrainingState(agent);
  res.json(state);
});

// ── Start a training run (Train button) ──────────────────────────────────────
const StartBody = z.object({
  feedback_ids: z.array(z.string()).min(1),
  started_by: z.string().email().optional(),
});

router.post("/agents/:agent/training/start", async (req, res): Promise<void> => {
  const agent = req.params.agent;
  if (!agent) { res.status(400).json({ error: "agent required" }); return; }
  const parsed = StartBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Pre-check: any running run for this agent? (TTL sweeper would mark stuck runs failed — Phase 1)
  const [running] = await db.select({ id: agentTrainingRunsTable.id })
    .from(agentTrainingRunsTable)
    .where(and(eq(agentTrainingRunsTable.agent, agent), eq(agentTrainingRunsTable.status, "running")))
    .limit(1);
  if (running) {
    res.status(409).json({ error: "Training already running for this agent", run_id: running.id });
    return;
  }

  // Validate feedback ids belong to this agent + are unconsumed
  const fbRows = await db.select({ id: agentFeedbackTable.id })
    .from(agentFeedbackTable)
    .where(and(
      eq(agentFeedbackTable.agent, agent),
      inArray(agentFeedbackTable.id, parsed.data.feedback_ids),
      isNull(agentFeedbackTable.consumedAt),
    ));
  if (fbRows.length !== parsed.data.feedback_ids.length) {
    res.status(400).json({ error: "Some feedback_ids invalid, already consumed, or wrong agent" });
    return;
  }

  // Create the run row first (status=running) so the Train button locks immediately.
  const [run] = await db.insert(agentTrainingRunsTable).values({
    agent,
    startedBy: parsed.data.started_by || "unknown",
    status: "running",
    feedbackIds: parsed.data.feedback_ids,
  }).returning({ id: agentTrainingRunsTable.id });

  // Fire Coach (Phase 0 stub — marks no_proposal).
  // Don't await — let it run in the background; client polls /training-state.
  analyzeFeedback({
    trainingRunId: run.id,
    agent,
    feedbackIds: parsed.data.feedback_ids,
  }).catch(err => {
    console.error(`[agents-api] Coach failed for run ${run.id}:`, err);
    db.update(agentTrainingRunsTable).set({
      status: "failed",
      finishedAt: new Date(),
      failureReason: err instanceof Error ? err.message : String(err),
    }).where(eq(agentTrainingRunsTable.id, run.id)).catch(() => { /* swallow */ });
  });

  res.json({ ok: true, run_id: run.id });
});

// ── List unconsumed feedback for the Train modal ─────────────────────────────
router.get("/agents/:agent/feedback", async (req, res): Promise<void> => {
  const agent = req.params.agent;
  if (!agent) { res.status(400).json({ error: "agent required" }); return; }
  const showConsumed = req.query.consumed === "true";

  const rows = await db.select().from(agentFeedbackTable)
    .where(showConsumed
      ? eq(agentFeedbackTable.agent, agent)
      : and(eq(agentFeedbackTable.agent, agent), isNull(agentFeedbackTable.consumedAt))!)
    .orderBy(desc(agentFeedbackTable.createdAt))
    .limit(100);

  res.json({ feedback: rows });
});

// ── List proposals ───────────────────────────────────────────────────────────
router.get("/agents/:agent/proposals", async (req, res): Promise<void> => {
  const agent = req.params.agent;
  if (!agent) { res.status(400).json({ error: "agent required" }); return; }
  const status = (req.query.status as string) || "pending";

  const rows = await db.select().from(agentMemoryProposalsTable)
    .where(and(eq(agentMemoryProposalsTable.agent, agent), eq(agentMemoryProposalsTable.status, status)))
    .orderBy(desc(agentMemoryProposalsTable.createdAt))
    .limit(50);

  res.json({ proposals: rows });
});

// ── Approve / reject a proposal ──────────────────────────────────────────────
const DecisionBody = z.object({
  decided_by: z.string().email().optional(),
  rejection_reason: z.string().optional(),
});

router.post("/proposals/:proposalId/approve", async (req, res): Promise<void> => {
  const id = req.params.proposalId;
  if (!id) { res.status(400).json({ error: "proposalId required" }); return; }
  const parsed = DecisionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    await applyApprovedProposal(id, parsed.data.decided_by || "unknown");
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/proposals/:proposalId/reject", async (req, res): Promise<void> => {
  const id = req.params.proposalId;
  if (!id) { res.status(400).json({ error: "proposalId required" }); return; }
  const parsed = DecisionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  await rejectProposal(id, parsed.data.decided_by || "unknown", parsed.data.rejection_reason);
  res.json({ ok: true });
});

// ── Memory inspection (read-only Phase 0; edit lands Phase 6) ────────────────
router.get("/agents/:agent/memory", async (req, res): Promise<void> => {
  const agent = req.params.agent;
  if (!agent) { res.status(400).json({ error: "agent required" }); return; }

  const rows = await db.select({
    kind: agentMemoryEntriesTable.kind,
    section_name: agentMemoryEntriesTable.sectionName,
    version: agentMemoryEntriesTable.version,
    updated_at: agentMemoryEntriesTable.updatedAt,
    updated_by: agentMemoryEntriesTable.updatedBy,
  }).from(agentMemoryEntriesTable)
    .where(eq(agentMemoryEntriesTable.agent, agent))
    .orderBy(agentMemoryEntriesTable.kind, agentMemoryEntriesTable.sectionName);

  res.json({ entries: rows });
});

router.get("/agents/:agent/memory/:section", async (req, res): Promise<void> => {
  const agent = req.params.agent;
  const section = req.params.section;
  if (!agent || !section) { res.status(400).json({ error: "agent + section required" }); return; }
  const kind = (req.query.kind as string) || "memory";

  const [row] = await db.select().from(agentMemoryEntriesTable)
    .where(and(
      eq(agentMemoryEntriesTable.agent, agent),
      eq(agentMemoryEntriesTable.kind, kind),
      eq(agentMemoryEntriesTable.sectionName, section),
    )).limit(1);

  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

// ── Edit a memory entry (write-gated to kind='memory' per D5) ────────────────
const MemoryWriteBody = z.object({
  content: z.string(),
  updated_by: z.string().optional(),
});

router.put("/agents/:agent/memory/:section", async (req, res): Promise<void> => {
  const agent = req.params.agent;
  const section = req.params.section;
  if (!agent || !section) { res.status(400).json({ error: "agent + section required" }); return; }

  const parsed = MemoryWriteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const kind = (req.query.kind as string) || "memory";

  // D5: outside of approved Coach proposals, only kind='memory' is writable
  // through this endpoint. Identity-tier kinds stay developer-locked
  // (changes flow through git + the seed script).
  if (kind !== "memory") {
    res.status(403).json({
      error: `kind='${kind}' is git-locked — only kind='memory' can be edited via this endpoint`,
    });
    return;
  }

  const updatedBy = parsed.data.updated_by || "tony";

  const [existing] = await db.select().from(agentMemoryEntriesTable)
    .where(and(
      eq(agentMemoryEntriesTable.agent, agent),
      eq(agentMemoryEntriesTable.kind, kind),
      eq(agentMemoryEntriesTable.sectionName, section),
    )).limit(1);

  if (existing) {
    await db.update(agentMemoryEntriesTable).set({
      content: parsed.data.content,
      version: sql`${agentMemoryEntriesTable.version} + 1`,
      updatedAt: new Date(),
      updatedBy,
    }).where(eq(agentMemoryEntriesTable.id, existing.id));
  } else {
    await db.insert(agentMemoryEntriesTable).values({
      agent,
      kind,
      sectionName: section,
      content: parsed.data.content,
      updatedBy,
    });
  }

  res.json({ ok: true });
});

// ── Run history per agent (Phase 6 dashboard table) ─────────────────────────
router.get("/agents/:agent/runs", async (req, res): Promise<void> => {
  const agent = req.params.agent;
  if (!agent) { res.status(400).json({ error: "agent required" }); return; }

  const limit = Math.min(parseInt((req.query.limit as string) || "50", 10) || 50, 500);
  const skill = req.query.skill as string | undefined;

  const where = skill
    ? and(eq(agentRunsTable.agent, agent), eq(agentRunsTable.skill, skill))!
    : eq(agentRunsTable.agent, agent);

  const rows = await db.select().from(agentRunsTable)
    .where(where)
    .orderBy(desc(agentRunsTable.createdAt))
    .limit(limit);

  res.json({ runs: rows });
});

// ── Skill registry per agent (read-only Phase 6; model_override edit later) ──
router.get("/agents/:agent/skills", async (req, res): Promise<void> => {
  const agent = req.params.agent;
  if (!agent) { res.status(400).json({ error: "agent required" }); return; }

  const rows = await db.select().from(agentSkillsTable)
    .where(eq(agentSkillsTable.agent, agent))
    .orderBy(asc(agentSkillsTable.skillName));

  res.json({ skills: rows });
});

const SkillOverrideBody = z.object({
  model_override: z.string().nullable(),
});

router.put("/agents/:agent/skills/:skill/model-override", async (req, res): Promise<void> => {
  const agent = req.params.agent;
  const skillName = req.params.skill;
  if (!agent || !skillName) { res.status(400).json({ error: "agent + skill required" }); return; }

  const parsed = SkillOverrideBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  await db.update(agentSkillsTable)
    .set({ modelOverride: parsed.data.model_override, updatedAt: new Date() })
    .where(and(eq(agentSkillsTable.agent, agent), eq(agentSkillsTable.skillName, skillName)));

  res.json({ ok: true });
});

// ── Direct skill invocation (for fixture replay scripts) ─────────────────────
// Lets operator scripts run an agent skill via HTTP without importing the SDK.
// Used by lib/db/scripts/replay-classification-fixture.mjs to measure accuracy
// of the orchestrator's classify skill (R4 fixture gate). Does NOT need any
// AGENT_RUNTIME_<X> flag — this route always uses runAgent directly.
const InvokeBody = z.object({
  user_message: z.string().min(1),
  caller: z.enum(["direct", "orchestrator", "coach", "cron"]).optional(),
});

router.post("/agents/:agent/skills/:skill/invoke", async (req, res): Promise<void> => {
  const agent = req.params.agent;
  const skillName = req.params.skill;
  if (!agent || !skillName) { res.status(400).json({ error: "agent + skill required" }); return; }

  const parsed = InvokeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Lazy import so this file doesn't pull the runtime when only feedback APIs
  // are needed.
  const { runAgent } = await import("../../agents/runtime.js");

  try {
    const result = await runAgent(agent, skillName, {
      userMessage: parsed.data.user_message,
      caller: parsed.data.caller || "direct",
      meta: { invoked_via: "api/agents/skills/invoke" },
    });
    res.json({
      ok: true,
      text: result.text,
      turns: result.turns,
      tool_calls: result.toolCalls,
      run_id: result.runId,
      resolved: result.resolved,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;

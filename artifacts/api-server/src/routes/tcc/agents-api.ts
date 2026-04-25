// /api/agents/* — settings dashboard backend.
// Phase 0: training-state + start training run + minimal proposals list.
// Phase 6 will flesh this out with memory edit, run history, full dashboard.

import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, agentTrainingRunsTable, agentMemoryProposalsTable, agentFeedbackTable, agentSkillsTable, agentMemoryEntriesTable } from "@workspace/db";
import { and, eq, desc, isNull, sql, inArray } from "drizzle-orm";
import { getTrainingState, applyApprovedProposal, rejectProposal } from "../../agents/proposals.js";
import { analyzeFeedback } from "../../agents/coach.js";
import { snapshotFlags } from "../../agents/flags.js";

const router: IRouter = Router();

// ── List specialists (sidebar) ───────────────────────────────────────────────
router.get("/api/agents", async (_req, res): Promise<void> => {
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
router.get("/api/agents/:agent/training-state", async (req, res): Promise<void> => {
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

router.post("/api/agents/:agent/training/start", async (req, res): Promise<void> => {
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
router.get("/api/agents/:agent/feedback", async (req, res): Promise<void> => {
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
router.get("/api/agents/:agent/proposals", async (req, res): Promise<void> => {
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

router.post("/api/proposals/:proposalId/approve", async (req, res): Promise<void> => {
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

router.post("/api/proposals/:proposalId/reject", async (req, res): Promise<void> => {
  const id = req.params.proposalId;
  if (!id) { res.status(400).json({ error: "proposalId required" }); return; }
  const parsed = DecisionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  await rejectProposal(id, parsed.data.decided_by || "unknown", parsed.data.rejection_reason);
  res.json({ ok: true });
});

// ── Memory inspection (read-only Phase 0; edit lands Phase 6) ────────────────
router.get("/api/agents/:agent/memory", async (req, res): Promise<void> => {
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

router.get("/api/agents/:agent/memory/:section", async (req, res): Promise<void> => {
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

export default router;

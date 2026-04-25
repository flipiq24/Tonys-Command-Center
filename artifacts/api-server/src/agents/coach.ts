// Coach — analyzes a Train-button training run and emits 0 or 1 proposal.
// SKELETON ONLY in Phase 0. Phase 1 will fill in the actual Coach analysis logic
// (read selected feedback rows + their snapshots + agent's memory files, call
// Claude with submit_proposal tool, write proposal row).
//
// Per D3, D10: Coach is fired ONLY by the Train button on /settings/agents/<x>.
// Never by chat. Never automatically.

import { db, agentTrainingRunsTable, agentFeedbackTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

export interface AnalyzeFeedbackInput {
  trainingRunId: string;
  agent: string;
  feedbackIds: string[];
}

export interface AnalyzeFeedbackResult {
  /** Proposal id if Coach produced one. Null if 'no_proposal' (feedback was noise / nothing actionable). */
  proposalId: string | null;
  /** Reason if no_proposal. */
  noProposalReason?: string;
}

/**
 * Phase 0 stub. Marks the training run as 'no_proposal' and returns null.
 * Real implementation lands in Phase 1 (see plan.md Phase 1 task list).
 *
 * Why a stub now: the Train button UI + GET /training-state must be wireable
 * end-to-end in Phase 0, and that requires a callable analyzeFeedback to exist.
 */
export async function analyzeFeedback(input: AnalyzeFeedbackInput): Promise<AnalyzeFeedbackResult> {
  // Mark feedback rows consumed under this run.
  await db.update(agentFeedbackTable).set({
    consumedAt: new Date(),
    trainingRunId: input.trainingRunId,
    consumedOutcome: "no_proposal",
  }).where(and(
    eq(agentFeedbackTable.agent, input.agent),
    inArray(agentFeedbackTable.id, input.feedbackIds),
  ));

  // Mark run as no_proposal — Phase 0 stub never produces proposals.
  await db.update(agentTrainingRunsTable).set({
    status: "no_proposal",
    finishedAt: new Date(),
    failureReason: "Phase 0 stub — Coach implementation pending in Phase 1",
  }).where(eq(agentTrainingRunsTable.id, input.trainingRunId));

  return { proposalId: null, noProposalReason: "Phase 0 stub" };
}

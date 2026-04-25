// recordFeedback — universal feedback capture (FEEDBACK_SYSTEM.md §3, §4).
// Called from every legacy feedback channel (thumbs, override, reorder, etc.)
// alongside existing legacy table writes during transition.
//
// Behavior:
//   - If FEEDBACK_PIPELINE_ENABLED=false: returns silently (Phase 0 default).
//   - If true: writes one agent_feedback row with snapshot.
//   - Snapshot capture is delegated to per-agent functions in ./snapshots/<agent>.ts.
//     Until those exist (Phase 1), we accept a pre-built snapshot from the caller.
//
// This file is the entry point — UI handlers call recordFeedback() directly.
// Coach/Train consumes from agent_feedback via proposals.ts.

import { db, agentFeedbackTable } from "@workspace/db";
import { isFeedbackPipelineEnabled } from "./flags.js";

export type FeedbackSourceType =
  | "thumbs"      // 👍/👎
  | "reorder"    // drag-drop with tonyExplanation (tasks)
  | "override"   // forced bypass (priority warning, scope block)
  | "correction" // edit-after-AI (compose modal notes, OCR field fix)
  | "rating"     // 1-5 stars (future)
  | "free_text"; // standalone review

export interface RecordFeedbackInput {
  agent: string;                       // 'email' | 'tasks' | ...
  skill: string;                       // 'reply.draft' | 'classify' | ...
  sourceType: FeedbackSourceType;
  sourceId: string;                    // emailId / taskId / ideaId / eventId — caller's id
  rating?: 1 | -1 | null;
  reviewText?: string | null;
  /**
   * World-state JSON at the moment of the feedback. Per FEEDBACK_SYSTEM.md §4.2,
   * each agent has its own snapshot shape. Caller is responsible for assembling
   * the right shape (we'll add captureSnapshot helpers in Phase 1).
   */
  contextSnapshot: Record<string, unknown>;
}

export interface RecordFeedbackResult {
  /** True if a row was written. False if the pipeline is disabled (no-op). */
  recorded: boolean;
  /** The agent_feedback.id, when recorded. */
  feedbackId?: string;
}

export async function recordFeedback(input: RecordFeedbackInput): Promise<RecordFeedbackResult> {
  if (!isFeedbackPipelineEnabled()) {
    return { recorded: false };
  }

  try {
    const inserted = await db.insert(agentFeedbackTable).values({
      agent: input.agent,
      skill: input.skill,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      rating: input.rating ?? null,
      reviewText: input.reviewText ?? null,
      contextSnapshot: input.contextSnapshot,
    }).returning({ id: agentFeedbackTable.id });

    return { recorded: true, feedbackId: inserted[0]?.id };
  } catch (err) {
    // Don't fail the calling handler on a feedback write — log and return.
    console.error("[recordFeedback] failed:", err instanceof Error ? err.message : err);
    return { recorded: false };
  }
}

// Snapshot dispatcher — routes to per-agent capturer.
// Each agent has its own snapshot shape (see FEEDBACK_SYSTEM.md §4.2).
//
// Snapshot capturers are NOT AI calls. They're handler-side TS that does
// DB reads. Coach later reasons over the captured JSONB.
//
// All capturers are best-effort: if a sub-query fails, return what we have
// (partial snapshot). Never throw — recordFeedback wraps with try/catch but
// we return a safe fallback if everything fails.

import { captureEmailSnapshot } from "./email.js";
import { captureTasksSnapshot } from "./tasks.js";
import { captureIdeasSnapshot } from "./ideas.js";
import { captureBriefSnapshot } from "./brief.js";
import { captureContactsSnapshot } from "./contacts.js";
import { captureCallsSnapshot } from "./calls.js";
import { captureCheckinSnapshot } from "./checkin.js";
import { captureJournalSnapshot } from "./journal.js";
import { captureScheduleSnapshot } from "./schedule.js";
import { captureIngestSnapshot } from "./ingest.js";
import { captureOrchestratorSnapshot } from "./orchestrator.js";

type SnapshotFn = (skill: string, sourceId: string, extra?: Record<string, unknown>) => Promise<Record<string, unknown>>;

const REGISTRY: Record<string, SnapshotFn> = {
  email: captureEmailSnapshot,
  tasks: captureTasksSnapshot,
  ideas: captureIdeasSnapshot,
  brief: captureBriefSnapshot,
  contacts: captureContactsSnapshot,
  calls: captureCallsSnapshot,
  checkin: captureCheckinSnapshot,
  journal: captureJournalSnapshot,
  schedule: captureScheduleSnapshot,
  ingest: captureIngestSnapshot,
  orchestrator: captureOrchestratorSnapshot,
};

export async function captureSnapshot(
  agent: string,
  skill: string,
  sourceId: string,
  extra?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fn = REGISTRY[agent];
  if (!fn) {
    return { agent, skill, sourceId, captured_at: new Date().toISOString(), note: "no capturer registered for agent" };
  }
  try {
    const snap = await fn(skill, sourceId, extra);
    return { agent, skill, sourceId, captured_at: new Date().toISOString(), ...snap };
  } catch (err) {
    return {
      agent, skill, sourceId,
      captured_at: new Date().toISOString(),
      capture_error: err instanceof Error ? err.message : String(err),
    };
  }
}

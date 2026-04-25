// Feature flags — per-specialist runtime gating for big-bang migration.
// Default OFF in production; flip one specialist at a time via env.
//
// Each flag:
//   AGENT_RUNTIME_<UPPER_NAME>=true   → handler routes through runAgent()
//   AGENT_RUNTIME_<UPPER_NAME>=false  → handler keeps legacy inline prompt
//
// Plus:
//   FEEDBACK_PIPELINE_ENABLED=true    → recordFeedback() writes rows
//                                       (off: feedback calls are no-ops, safe to ship)

export type AgentName =
  | "orchestrator"
  | "email"
  | "tasks"
  | "ideas"
  | "brief"
  | "contacts"
  | "calls"
  | "checkin"
  | "journal"
  | "schedule"
  | "ingest"
  | "coach";

const KNOWN_AGENTS: AgentName[] = [
  "orchestrator", "email", "tasks", "ideas", "brief",
  "contacts", "calls", "checkin", "journal", "schedule",
  "ingest", "coach",
];

function readEnv(key: string): boolean {
  const v = process.env[key];
  if (v === undefined) return false;
  return v === "true" || v === "1";
}

export function isAgentRuntimeEnabled(agent: AgentName): boolean {
  return readEnv(`AGENT_RUNTIME_${agent.toUpperCase()}`);
}

export function isFeedbackPipelineEnabled(): boolean {
  return readEnv("FEEDBACK_PIPELINE_ENABLED");
}

export function snapshotFlags(): Record<string, boolean> {
  const out: Record<string, boolean> = {
    FEEDBACK_PIPELINE_ENABLED: isFeedbackPipelineEnabled(),
  };
  for (const a of KNOWN_AGENTS) {
    out[`AGENT_RUNTIME_${a.toUpperCase()}`] = isAgentRuntimeEnabled(a);
  }
  return out;
}

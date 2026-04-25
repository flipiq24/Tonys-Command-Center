// Orchestrator — chat-path entrypoint. Replaces the legacy 23-tool monolith
// at routes/tcc/claude.ts:1566.
//
// SKELETON ONLY in Phase 0. Phase 2 fills in the classify→delegate→synthesize
// driver per the plan, plus 50-message classification fixture for ≥90%
// accuracy gate before flag flip.

export interface OrchestratorRequest {
  threadId: string;
  userMessage: string;
}

export interface OrchestratorResponse {
  text: string;
  delegatedTo?: string;        // which specialist handled it (if any)
  skill?: string;
}

/**
 * Phase 0 stub. Throws — orchestrator chat path lives behind
 * AGENT_RUNTIME_ORCHESTRATOR=true and only Phase 2 makes it functional.
 */
export async function runOrchestrator(_req: OrchestratorRequest): Promise<OrchestratorResponse> {
  throw new Error("Orchestrator runtime is a Phase 0 stub. Land Phase 2 before flipping AGENT_RUNTIME_ORCHESTRATOR.");
}

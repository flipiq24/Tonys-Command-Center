// runAgent — single entrypoint for invoking an agent skill.
// Direct-path UI handlers and Orchestrator's delegate tools both go through this.
//
// Behavior:
//   1. Loads skill registry row (model, max_tokens, tools, memory_sections).
//   2. Builds layered system prompt (L1/L2/L3) with cache markers via prompt-builder.
//   3. Calls Anthropic via createTrackedMessage so usage gets logged to ai_usage_logs.
//   4. Logs an agent_runs row for per-skill cost/latency analytics.
//
// NOTE Phase 0: tool registry resolution + multi-turn loop are stubbed.
// Tools are declared via the skill row but not yet bound to handlers — that
// happens in Phase 1 when individual tool files are created. Until then,
// runAgent simply produces a single non-tool response.

import { createTrackedMessage } from "@workspace/integrations-anthropic-ai";
import { db, agentRunsTable } from "@workspace/db";
import { buildPrompt } from "./prompt-builder.js";

// Derived types — avoids adding @anthropic-ai/sdk as a direct api-server dep.
type AnthropicMessage = Awaited<ReturnType<typeof createTrackedMessage>>;
type AnthropicMessageParam = { role: "user" | "assistant"; content: string | Array<{ type: string; [k: string]: unknown }> };
type AnthropicContentBlock = AnthropicMessage["content"][number];

export interface RunAgentInput {
  /** First user-turn content. Either a plain string or Anthropic content blocks. */
  userMessage: string | AnthropicMessageParam["content"];
  /** Optional override of the skill's declared model (e.g. for A/B). */
  modelOverride?: string;
  /** Optional override of the skill's declared max_tokens. */
  maxTokensOverride?: number;
  /** Free-form metadata stored on agent_runs for debugging. */
  meta?: Record<string, unknown>;
  /** Caller path — 'direct' (UI button) | 'orchestrator' (chat) | 'coach' | 'cron'. */
  caller?: "direct" | "orchestrator" | "coach" | "cron";
  /** Chat thread id when caller='orchestrator'. */
  callerThreadId?: string;
}

export interface RunAgentResult {
  /** The Anthropic response object (preserves access to content blocks, stop_reason, etc.). */
  response: AnthropicMessage;
  /** Convenience: extracted text from the first text block. */
  text: string;
  /** Per-run row id (agent_runs.id). */
  runId: string;
  /** Echo of the resolved model + max_tokens used. */
  resolved: { model: string; maxTokens: number };
}

export async function runAgent(
  agent: string,
  skillName: string,
  input: RunAgentInput,
): Promise<RunAgentResult> {
  const start = Date.now();

  const built = await buildPrompt(agent, skillName);
  const model = input.modelOverride || built.model;
  const maxTokens = input.maxTokensOverride || built.maxTokens;

  const messages = [
    {
      role: "user" as const,
      content: typeof input.userMessage === "string"
        ? [{ type: "text" as const, text: input.userMessage }]
        : input.userMessage,
    },
  ];

  const featureName = `agent_${agent}_${skillName.replace(/\./g, "_")}`;

  let response: AnthropicMessage;
  let errorMessage: string | undefined;
  try {
    response = await createTrackedMessage(
      featureName,
      {
        model,
        max_tokens: maxTokens,
        system: built.systemBlocks,
        messages: messages as any,
        // tools: TODO Phase 1 — resolve built.toolNames against agent_tools registry
      },
      { agent, skill: skillName, caller: input.caller || "direct", ...input.meta },
    );
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    // Log failed run then rethrow.
    const failed = await logRun({
      agent, skillName,
      caller: input.caller, callerThreadId: input.callerThreadId,
      response: null, durationMs: Date.now() - start,
      status: "error", errorMessage,
    });
    void failed;
    throw err;
  }

  const text = extractText(response);
  const runId = await logRun({
    agent, skillName,
    caller: input.caller, callerThreadId: input.callerThreadId,
    response, durationMs: Date.now() - start,
    status: "success",
  });

  return {
    response,
    text,
    runId,
    resolved: { model, maxTokens },
  };
}

function extractText(response: AnthropicMessage): string {
  const block = response.content.find((b: AnthropicContentBlock) => b.type === "text");
  if (block && block.type === "text") return (block as { type: "text"; text: string }).text;
  return "";
}

interface LogRunArgs {
  agent: string;
  skillName: string;
  caller?: string;
  callerThreadId?: string;
  response: AnthropicMessage | null;
  durationMs: number;
  status: "success" | "error";
  errorMessage?: string;
}

async function logRun(args: LogRunArgs): Promise<string> {
  try {
    const usage = args.response?.usage;
    const inserted = await db.insert(agentRunsTable).values({
      agent: args.agent,
      skill: args.skillName,
      caller: args.caller || null,
      callerThreadId: args.callerThreadId || null,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      cacheReadTokens: (usage as any)?.cache_read_input_tokens ?? 0,
      cacheCreationTokens: (usage as any)?.cache_creation_input_tokens ?? 0,
      durationMs: args.durationMs,
      status: args.status,
      errorMessage: args.errorMessage || null,
    }).returning({ id: agentRunsTable.id });
    return inserted[0]?.id || "";
  } catch {
    // Logging is best-effort; never fail a run because of it.
    return "";
  }
}

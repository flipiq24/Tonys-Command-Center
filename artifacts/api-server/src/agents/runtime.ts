// runAgent — single entrypoint for invoking an agent skill.
// Direct-path UI handlers and Orchestrator's delegate tools both go through this.
//
// Behavior:
//   1. Loads skill registry row (model, max_tokens, tools, memory_sections).
//   2. Builds layered system prompt (L1/L2/L3) with cache markers via prompt-builder.
//   3. Resolves the skill's declared tools against the agent_tools registry.
//   4. Multi-turn loop with Anthropic: text response → done; tool_use → execute
//      handler → feed result → next turn. Caps at MAX_TURNS to prevent runaway.
//   5. Calls Anthropic via createTrackedMessage so usage gets logged to ai_usage_logs.
//   6. Logs an agent_runs row for per-skill cost/latency analytics.
//
// The tool resolution mechanism here is the single contract used by:
//   - Coach's narrow read/write tools (Phase 1)
//   - The 42 chat-orchestrator tools (Phase 2 wrapper pass)
//   - Each specialist's domain tools (Phase 3-5)
// Every tool wrapper has the same shape (see ./tools/index.ts ToolHandler).

import { createTrackedMessage } from "@workspace/integrations-anthropic-ai";
import { db, agentRunsTable } from "@workspace/db";
import { buildPrompt } from "./prompt-builder.js";
import { resolveTools, type ToolHandler, type AnthropicToolSpec, type AgentContext } from "./tools/index.js";

// Derived types — avoids adding @anthropic-ai/sdk as a direct api-server dep.
type AnthropicMessage = Awaited<ReturnType<typeof createTrackedMessage>>;
type AnthropicMessageParam = { role: "user" | "assistant"; content: string | Array<{ type: string; [k: string]: unknown }> };
type AnthropicContentBlock = AnthropicMessage["content"][number];

const MAX_TURNS = 8; // Cap on multi-turn tool loops. Coach should never exceed 3-4 turns.

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
  /** Optional restriction: subset of skill's declared tools to allow. Used for @-mention scoping. */
  toolScope?: string[];
  /** User email for handler authorization (e.g. Gmail tools need user-scoped tokens). */
  user?: string;
  /** Training-run id when caller='coach' — passed to submit_proposal handler. */
  trainingRunId?: string;
}

export interface RunAgentResult {
  /** The final Anthropic response object (after tool loop completes). */
  response: AnthropicMessage;
  /** Convenience: extracted text from the final assistant turn. */
  text: string;
  /** Per-run row id (agent_runs.id). */
  runId: string;
  /** Echo of the resolved model + max_tokens used. */
  resolved: { model: string; maxTokens: number };
  /** Number of model turns taken (1 = single-shot, >1 = used tools). */
  turns: number;
  /** Tool calls that fired during the loop (for debugging). */
  toolCalls: Array<{ name: string; input: Record<string, unknown>; output: string }>;
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

  // ── Resolve tools ───────────────────────────────────────────────────────────
  // Skill declares names; toolScope (if provided) further restricts to a subset.
  const declared = built.toolNames;
  const allowed = input.toolScope
    ? declared.filter(n => input.toolScope!.includes(n))
    : declared;
  const { specs, handlers } = await resolveTools(allowed);

  const ctx: AgentContext = {
    agent,
    skill: skillName,
    caller: input.caller || "direct",
    callerThreadId: input.callerThreadId,
    user: input.user,
    trainingRunId: input.trainingRunId,
  };

  // ── Multi-turn loop ─────────────────────────────────────────────────────────
  const messages: any[] = [
    {
      role: "user",
      content: typeof input.userMessage === "string"
        ? [{ type: "text", text: input.userMessage }]
        : input.userMessage,
    },
  ];

  const featureName = `agent_${agent}_${skillName.replace(/\./g, "_")}`;
  const toolCalls: RunAgentResult["toolCalls"] = [];
  let response: AnthropicMessage = null as any;
  let turns = 0;
  let errorMessage: string | undefined;

  try {
    while (turns < MAX_TURNS) {
      turns++;
      const params: any = {
        model,
        max_tokens: maxTokens,
        system: built.systemBlocks,
        messages,
      };
      if (specs.length > 0) params.tools = specs;

      response = await createTrackedMessage(
        featureName,
        params,
        { agent, skill: skillName, caller: input.caller || "direct", turn: turns, ...input.meta },
      );

      // Stop conditions: end_turn, max_tokens, or stop_sequence — model is done.
      if (response.stop_reason !== "tool_use") break;

      // Otherwise: collect every tool_use block, run handlers, append tool_results.
      const toolUseBlocks = response.content.filter((b: AnthropicContentBlock) => b.type === "tool_use") as Array<{
        type: "tool_use"; id: string; name: string; input: Record<string, unknown>;
      }>;

      // Append the assistant turn so the next call sees its own tool_use blocks.
      messages.push({ role: "assistant", content: response.content });

      // Execute each tool, build the user turn with tool_results.
      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];
      for (const tu of toolUseBlocks) {
        const handler = handlers[tu.name];
        if (!handler) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `✗ Tool '${tu.name}' is not registered for this skill`,
            is_error: true,
          });
          toolCalls.push({ name: tu.name, input: tu.input, output: "tool not registered" });
          continue;
        }
        try {
          const result = await handler(tu.input, ctx);
          const text = typeof result === "string" ? result : JSON.stringify(result);
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: text });
          toolCalls.push({ name: tu.name, input: tu.input, output: text.slice(0, 500) });
        } catch (err) {
          const errText = err instanceof Error ? err.message : String(err);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `✗ Tool error: ${errText}`,
            is_error: true,
          });
          toolCalls.push({ name: tu.name, input: tu.input, output: `error: ${errText}` });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    await logRun({
      agent, skillName,
      caller: input.caller, callerThreadId: input.callerThreadId,
      response: null, durationMs: Date.now() - start,
      status: "error", errorMessage,
    });
    throw err;
  }

  if (turns >= MAX_TURNS && response.stop_reason === "tool_use") {
    // Model wanted more turns; we capped. Final text might be empty — that's
    // fine, downstream callers can detect via stop_reason or empty text.
    console.warn(`[runAgent] ${agent}.${skillName} hit MAX_TURNS=${MAX_TURNS}; stopping loop.`);
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
    turns,
    toolCalls,
  };
}

function extractText(response: AnthropicMessage): string {
  if (!response) return "";
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

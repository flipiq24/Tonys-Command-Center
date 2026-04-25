// Tool resolution contract — the single mechanism all agent tools use.
// Coach uses it first (Phase 1). Later phases reuse it for the 42 chat tools
// + each specialist's domain tools. Behavior must remain stable across
// migrations — this is the load-bearing seam between LLM and existing handlers.
//
// Three pieces fit together:
//   1. ToolHandler — async function called by the runtime when Anthropic emits tool_use.
//   2. agent_tools row — DB registry: tool_name → handler module path.
//   3. resolveTool() — dynamic-import resolver used by runtime.ts multi-turn loop.

import { db, agentToolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── The handler contract — every tool wrapper exports a function of this shape ──
//
// `input` is the parsed JSON Anthropic returned in tool_use.input. Schema is
// validated against the registry's input_schema by the runtime BEFORE this runs.
//
// `ctx` carries cross-cutting context (caller, agent, skill, threadId, user).
// Wrappers ignore it unless they need to scope by user / log to a thread / etc.
//
// The return value is JSON-serializable. The runtime stringifies it into the
// next user-turn's tool_result content. Wrappers may return:
//   - a string  (passed through verbatim — used by legacy chat tools that
//                already format human-readable strings like "✓ Message posted")
//   - any JSON-serializable value (object/array/number — runtime JSON.stringify's it)
//
// Throwing is also valid; runtime catches and converts to a tool_result with
// `is_error: true`. Don't use throws for "expected failures" (auth missing,
// not connected) — return a string with a ⚠️ / ✗ prefix instead, matching
// today's chat-tool convention. See ai-outputs/audit/current-tools-audit.md.

export interface AgentContext {
  agent: string;
  skill: string;
  caller: "direct" | "orchestrator" | "coach" | "cron";
  callerThreadId?: string;
  user?: string;        // email when known
  // Training-run id when caller='coach' — submit_proposal etc. need this.
  trainingRunId?: string;
}

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: AgentContext,
) => Promise<string | unknown>;

// ── Tool spec passed to Anthropic ────────────────────────────────────────────
export interface AnthropicToolSpec {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

// ── Resolver — registry-row → loaded handler ─────────────────────────────────
//
// We dynamic-import the handler module by path. Modules export a default
// ToolHandler:
//
//   // src/agents/tools/coach/read_feedback.ts
//   export default async function readFeedback(input, ctx) { ... }
//
// `handler_path` in the registry is relative to this file's directory:
//   handler_path = 'coach/read_feedback'  →  ./coach/read_feedback.js
//
// We cache resolved modules per-process — they're pure code, never change.

const CACHE = new Map<string, ToolHandler>();

export async function resolveTool(toolName: string): Promise<{ handler: ToolHandler; spec: AnthropicToolSpec } | null> {
  const cached = CACHE.get(toolName);
  if (cached) {
    // We still need the spec — pull it again (DB row, light query).
    const spec = await loadSpec(toolName);
    return spec ? { handler: cached, spec } : null;
  }

  const [row] = await db.select().from(agentToolsTable)
    .where(eq(agentToolsTable.toolName, toolName))
    .limit(1);
  if (!row) return null;

  // Native Anthropic tools (web_search, etc.) have no JS handler — they're
  // executed server-side by Anthropic. is_native=1 short-circuits resolution.
  if (row.isNative === 1) {
    const noopHandler: ToolHandler = async () => {
      throw new Error(`Tool '${toolName}' is native (Anthropic-side); should not be resolved locally.`);
    };
    CACHE.set(toolName, noopHandler);
    return {
      handler: noopHandler,
      spec: {
        name: row.toolName,
        description: row.description || "",
        input_schema: row.inputSchema as AnthropicToolSpec["input_schema"],
      },
    };
  }

  // Dynamic import. Handler files live under src/agents/tools/<handler_path>.
  // Default export must be a ToolHandler.
  const mod = await import(`./${row.handlerPath}.js`).catch((err) => {
    throw new Error(`Tool '${toolName}' handler import failed (${row.handlerPath}): ${err instanceof Error ? err.message : err}`);
  });
  const handler = (mod.default || mod[toolName]) as ToolHandler | undefined;
  if (typeof handler !== "function") {
    throw new Error(`Tool '${toolName}' module ${row.handlerPath} has no default export of type ToolHandler`);
  }

  CACHE.set(toolName, handler);
  return {
    handler,
    spec: {
      name: row.toolName,
      description: row.description || "",
      input_schema: row.inputSchema as AnthropicToolSpec["input_schema"],
    },
  };
}

async function loadSpec(toolName: string): Promise<AnthropicToolSpec | null> {
  const [row] = await db.select().from(agentToolsTable)
    .where(eq(agentToolsTable.toolName, toolName))
    .limit(1);
  if (!row) return null;
  return {
    name: row.toolName,
    description: row.description || "",
    input_schema: row.inputSchema as AnthropicToolSpec["input_schema"],
  };
}

// ── Bulk-resolve a skill's declared tools (used by runtime per-call) ─────────
export async function resolveTools(toolNames: string[]): Promise<{
  specs: AnthropicToolSpec[];
  handlers: Record<string, ToolHandler>;
}> {
  const specs: AnthropicToolSpec[] = [];
  const handlers: Record<string, ToolHandler> = {};
  for (const name of toolNames) {
    const r = await resolveTool(name);
    if (!r) {
      console.warn(`[resolveTools] tool '${name}' not in registry — skipping`);
      continue;
    }
    specs.push(r.spec);
    handlers[name] = r.handler;
  }
  return { specs, handlers };
}

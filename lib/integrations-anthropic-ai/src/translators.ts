// Bidirectional shape adapter between the Anthropic SDK (what every call
// site uses today) and the Vercel AI SDK (what we route through under the
// hood). The contract is: call sites continue to call createTrackedMessage
// with Anthropic-shaped params and receive an Anthropic.Message back —
// regardless of which provider actually ran.
//
// Lossy mappings are documented inline. The biggest one: a multi-block
// `system` (used for Anthropic prompt cache markers) is flattened to a
// single string. Cache hints are preserved separately via providerOptions
// when provider==='anthropic'; for other providers the markers are lost
// (they have no equivalent feature anyway).

import type Anthropic from "@anthropic-ai/sdk";
import type { ModelMessage, GenerateTextResult, FinishReason, ToolSet } from "ai";
import { tool, jsonSchema } from "ai";

// ─── Param translation: Anthropic → Vercel AI SDK ────────────────────────────

// Anthropic tool entries can be a "custom" tool (name + description +
// input_schema) or a native tool (web_search_*, bash_*, computer_*, etc.) —
// each with a different shape. We accept anything and filter for custom
// tools at translation time. Native tools are dropped (not portable across
// providers anyway).
export interface AnthropicCallParams {
  model?: string;
  max_tokens?: number;
  system?: string | Array<{ type: "text"; text: string; cache_control?: unknown }>;
  messages: Array<{
    role: "user" | "assistant";
    content: string | Array<any>;
  }>;
  tools?: unknown[];
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
}

export interface AiSdkCallParams {
  system?: string;
  messages: ModelMessage[];
  maxOutputTokens?: number;
  tools?: ToolSet;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  /** Provider-specific options (Anthropic cache control etc.) */
  providerOptions?: Record<string, Record<string, unknown>>;
}

export function anthropicToAiSdk(params: AnthropicCallParams, opts: { provider: string }): AiSdkCallParams {
  const out: AiSdkCallParams = {
    messages: translateMessages(params.messages),
  };

  // System: flatten multi-block to string. Cache markers lost in v1.
  if (typeof params.system === "string") {
    out.system = params.system;
  } else if (Array.isArray(params.system)) {
    out.system = params.system.map((b) => b.text).join("\n\n");
  }

  if (typeof params.max_tokens === "number") out.maxOutputTokens = params.max_tokens;
  if (typeof params.temperature === "number") out.temperature = params.temperature;
  if (typeof params.top_p === "number") out.topP = params.top_p;
  if (Array.isArray(params.stop_sequences)) out.stopSequences = params.stop_sequences;

  if (Array.isArray(params.tools) && params.tools.length > 0) {
    const toolSet: Record<string, ReturnType<typeof tool>> = {};
    for (const t of params.tools as Array<Record<string, unknown>>) {
      const name = t.name as string | undefined;
      const inputSchema = t.input_schema;
      // Skip native Anthropic tools (web_search_*, bash_*, computer_*) — they
      // have no input_schema and aren't supported across providers anyway.
      if (!name || !inputSchema) continue;
      toolSet[name] = tool({
        description: t.description as string | undefined,
        inputSchema: jsonSchema(inputSchema as any),
        // No `execute` — runtime executes tools manually and feeds tool_result back.
      });
    }
    if (Object.keys(toolSet).length > 0) out.tools = toolSet as ToolSet;
  }

  // Anthropic-only: opt-in prompt cache for the system prompt when present.
  // Provider adapter ignores this when provider!=='anthropic'.
  if (opts.provider === "anthropic" && Array.isArray(params.system)) {
    out.providerOptions = {
      anthropic: {
        // Marks the most recent system block as ephemeral cache write.
        cacheControl: { type: "ephemeral" },
      },
    };
  }

  return out;
}

function translateMessages(input: AnthropicCallParams["messages"]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of input) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content } as ModelMessage);
      continue;
    }
    // Anthropic content blocks → Vercel content parts.
    const parts: any[] = [];
    let assistantToolCalls: any[] = [];
    let userToolResults: any[] = [];
    for (const b of m.content) {
      if (b.type === "text") {
        parts.push({ type: "text", text: b.text });
      } else if (b.type === "image") {
        parts.push({
          type: "image",
          image: typeof b.source?.data === "string"
            ? `data:${b.source.media_type};base64,${b.source.data}`
            : b.source?.url ?? "",
        });
      } else if (b.type === "tool_use") {
        // Assistant tool call: { id, name, input }
        assistantToolCalls.push({
          type: "tool-call",
          toolCallId: b.id,
          toolName: b.name,
          input: b.input,
        });
      } else if (b.type === "tool_result") {
        // User tool result: { tool_use_id, content, is_error? }
        userToolResults.push({
          type: "tool-result",
          toolCallId: b.tool_use_id,
          toolName: "tool",
          output: typeof b.content === "string" ? { type: "text", value: b.content } : { type: "json", value: b.content },
        });
      }
    }
    if (m.role === "assistant") {
      // Assistant message: text parts followed by tool calls.
      out.push({ role: "assistant", content: [...parts, ...assistantToolCalls] } as ModelMessage);
    } else {
      // User message: text parts AND tool results (Vercel splits them by role).
      if (userToolResults.length > 0) {
        // Vercel expects tool results in role:'tool' messages.
        if (parts.length > 0) {
          out.push({ role: "user", content: parts } as ModelMessage);
        }
        out.push({ role: "tool", content: userToolResults } as ModelMessage);
      } else {
        out.push({ role: "user", content: parts } as ModelMessage);
      }
    }
  }
  return out;
}

// ─── Response translation: Vercel AI SDK → Anthropic.Message ─────────────────

export function aiSdkToAnthropic(
  result: GenerateTextResult<ToolSet, never>,
  modelId: string,
): Anthropic.Message {
  const content: Array<Anthropic.ContentBlock> = [];

  // Walk Vercel's content array; pull text and tool-call blocks.
  if (result.text) {
    content.push({ type: "text", text: result.text } as Anthropic.ContentBlock);
  }
  if (Array.isArray(result.toolCalls)) {
    for (const tc of result.toolCalls) {
      content.push({
        type: "tool_use",
        id: tc.toolCallId,
        name: tc.toolName,
        input: (tc as any).input ?? {},
      } as unknown as Anthropic.ContentBlock);
    }
  }
  // If neither text nor tool calls produced anything, drop in an empty text block.
  if (content.length === 0) {
    content.push({ type: "text", text: "" } as Anthropic.ContentBlock);
  }

  const meta = (result.providerMetadata ?? {}) as Record<string, Record<string, unknown>>;
  const anthropicMeta = (meta.anthropic ?? {}) as Record<string, unknown>;

  // Synthesize an Anthropic Message. id/role/type are fabricated for non-Anthropic
  // providers — call sites only use { content, stop_reason, usage } in practice.
  return {
    id: (anthropicMeta.id as string) ?? `msg_synth_${Date.now().toString(36)}`,
    type: "message",
    role: "assistant",
    model: modelId,
    content,
    stop_reason: mapFinishReason(result.finishReason),
    stop_sequence: null,
    usage: {
      input_tokens: (result.usage as any)?.inputTokens ?? 0,
      output_tokens: (result.usage as any)?.outputTokens ?? 0,
      cache_read_input_tokens:
        (anthropicMeta.cacheReadInputTokens as number) ??
        (result.usage as any)?.cachedInputTokens ?? 0,
      cache_creation_input_tokens:
        (anthropicMeta.cacheCreationInputTokens as number) ?? 0,
      service_tier: "standard" as any,
    } as unknown as Anthropic.Message["usage"],
  } as Anthropic.Message;
}

function mapFinishReason(r: FinishReason | undefined): Anthropic.Message["stop_reason"] {
  switch (r) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    case "tool-calls":
      return "tool_use";
    case "content-filter":
    case "error":
    case "other":
    default:
      return "end_turn";
  }
}

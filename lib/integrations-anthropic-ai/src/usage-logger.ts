import { anthropic } from "./client";
import type Anthropic from "@anthropic-ai/sdk";

// ─── Model Pricing (per 1M tokens) ──────────────────────────────────────────
const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  // Anthropic
  "claude-haiku-4-5": { inputPerM: 1.00, outputPerM: 5.00 },
  "claude-haiku-4-5-20251001": { inputPerM: 1.00, outputPerM: 5.00 },
  "claude-sonnet-4-5-20250514": { inputPerM: 3.00, outputPerM: 15.00 },
  "claude-sonnet-4-6": { inputPerM: 3.00, outputPerM: 15.00 },
  "claude-sonnet-4-5": { inputPerM: 3.00, outputPerM: 15.00 },
  "claude-opus-4-5": { inputPerM: 15.00, outputPerM: 75.00 },
  // OpenAI (for future use)
  "gpt-4o": { inputPerM: 2.50, outputPerM: 10.00 },
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.60 },
  "gpt-4.1": { inputPerM: 2.00, outputPerM: 8.00 },
  "gpt-4.1-mini": { inputPerM: 0.40, outputPerM: 1.60 },
  "gpt-4.1-nano": { inputPerM: 0.10, outputPerM: 0.40 },
};

function calcCost(tokens: number, pricePerM: number): number {
  return (tokens / 1_000_000) * pricePerM;
}

// ─── DB Logger (fire-and-forget) ─────────────────────────────────────────────
let _db: any = null;
let _table: any = null;

async function getDb() {
  if (!_db) {
    try {
      const dbMod = await import("@workspace/db");
      _db = dbMod.db;
      _table = dbMod.aiUsageLogsTable;
    } catch {
      // DB not available — skip logging silently
    }
  }
  return { db: _db, table: _table };
}

interface LogEntry {
  featureName: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCostUsd: string;
  outputCostUsd: string;
  totalCostUsd: string;
  requestSummary: string | null;
  responseSummary: string | null;
  fullRequest: unknown;
  fullResponse: unknown;
  durationMs: number;
  status: string;
  errorMessage?: string | null;
  metadata?: unknown;
}

function logToDb(entry: LogEntry): void {
  getDb().then(({ db, table }) => {
    if (!db || !table) return;
    db.insert(table).values(entry).catch((err: Error) => {
      console.warn("[ai-usage] log failed:", err.message);
    });
  }).catch(() => {});
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function summarizeRequest(params: any): string {
  const parts: string[] = [];
  if (typeof params.system === "string") {
    parts.push(params.system.slice(0, 150));
  }
  if (Array.isArray(params.messages)) {
    const userMsg = params.messages.find((m: any) => m.role === "user");
    if (userMsg) {
      const text = typeof userMsg.content === "string"
        ? userMsg.content
        : Array.isArray(userMsg.content)
          ? userMsg.content.map((b: any) => b.text || "").join(" ")
          : "";
      parts.push(text.slice(0, 200));
    }
  }
  return parts.join(" | ").slice(0, 400);
}

function summarizeResponse(response: Anthropic.Message): string {
  const textBlocks = response.content.filter((b) => b.type === "text");
  return textBlocks.map((b) => (b as any).text || "").join(" ").slice(0, 500);
}

function serializeRequest(params: any): unknown {
  // Store messages content but truncate very long ones
  try {
    const { messages, system, model, max_tokens, tools } = params;
    return {
      model,
      max_tokens,
      system: typeof system === "string" ? system.slice(0, 2000) : system,
      tools: tools ? tools.map((t: any) => t.name || t) : undefined,
      messages: Array.isArray(messages) ? messages.map((m: any) => ({
        role: m.role,
        content: typeof m.content === "string"
          ? m.content.slice(0, 2000)
          : Array.isArray(m.content)
            ? m.content.map((b: any) => ({
              type: b.type,
              text: b.text ? b.text.slice(0, 2000) : undefined,
              ...(b.type === "image" ? { image: "[image data]" } : {}),
            }))
            : m.content,
      })) : messages,
    };
  } catch {
    return { error: "Failed to serialize request" };
  }
}

function serializeResponse(response: Anthropic.Message): unknown {
  try {
    return {
      id: response.id,
      model: response.model,
      role: response.role,
      stop_reason: response.stop_reason,
      usage: response.usage,
      content: response.content.map((b) => {
        if (b.type === "text") return { type: "text", text: (b as any).text?.slice(0, 3000) };
        if (b.type === "tool_use") return { type: "tool_use", name: (b as any).name, id: (b as any).id };
        return { type: b.type };
      }),
    };
  } catch {
    return { error: "Failed to serialize response" };
  }
}

// ─── Main export: drop-in replacement for anthropic.messages.create ──────────
export async function createTrackedMessage(
  featureName: string,
  params: Parameters<typeof anthropic.messages.create>[0],
  meta?: Record<string, unknown>,
): Promise<Anthropic.Message> {
  const start = Date.now();
  try {
    const response = await anthropic.messages.create(params) as Anthropic.Message;
    const durationMs = Date.now() - start;
    const { input_tokens, output_tokens } = response.usage;
    const model = typeof params.model === "string" ? params.model : "unknown";
    const pricing = MODEL_PRICING[model] ?? { inputPerM: 0, outputPerM: 0 };
    const inputCost = calcCost(input_tokens, pricing.inputPerM);
    const outputCost = calcCost(output_tokens, pricing.outputPerM);

    logToDb({
      featureName,
      provider: "anthropic",
      model,
      inputTokens: input_tokens,
      outputTokens: output_tokens,
      totalTokens: input_tokens + output_tokens,
      inputCostUsd: inputCost.toFixed(6),
      outputCostUsd: outputCost.toFixed(6),
      totalCostUsd: (inputCost + outputCost).toFixed(6),
      requestSummary: summarizeRequest(params),
      responseSummary: summarizeResponse(response),
      fullRequest: serializeRequest(params),
      fullResponse: serializeResponse(response),
      durationMs,
      status: "success",
      metadata: meta ?? null,
    });

    return response;
  } catch (err) {
    const durationMs = Date.now() - start;
    const model = typeof params.model === "string" ? params.model : "unknown";
    logToDb({
      featureName,
      provider: "anthropic",
      model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      inputCostUsd: "0",
      outputCostUsd: "0",
      totalCostUsd: "0",
      requestSummary: summarizeRequest(params),
      responseSummary: null,
      fullRequest: serializeRequest(params),
      fullResponse: null,
      durationMs,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      metadata: meta ?? null,
    });
    throw err;
  }
}

// ─── For streaming calls (chat) — log after stream completes ─────────────────
export function logStreamedUsage(
  featureName: string,
  model: string,
  usage: { input_tokens: number; output_tokens: number },
  durationMs: number,
  requestSummary?: string,
  responseSummary?: string,
  meta?: Record<string, unknown>,
): void {
  const pricing = MODEL_PRICING[model] ?? { inputPerM: 0, outputPerM: 0 };
  const inputCost = calcCost(usage.input_tokens, pricing.inputPerM);
  const outputCost = calcCost(usage.output_tokens, pricing.outputPerM);

  logToDb({
    featureName,
    provider: "anthropic",
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.input_tokens + usage.output_tokens,
    inputCostUsd: inputCost.toFixed(6),
    outputCostUsd: outputCost.toFixed(6),
    totalCostUsd: (inputCost + outputCost).toFixed(6),
    requestSummary: requestSummary ?? null,
    responseSummary: responseSummary ?? null,
    fullRequest: null,
    fullResponse: null,
    durationMs,
    status: "success",
    metadata: meta ?? null,
  });
}

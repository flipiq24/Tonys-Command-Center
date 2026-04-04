import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export async function postSlackMessage(params: {
  channel: string;
  text: string;
  blocks?: unknown[];
}): Promise<{ ok: boolean; ts?: string; error?: string }> {
  try {
    const res = await connectors.proxy("slack", "/api/chat.postMessage", {
      method: "POST",
      body: JSON.stringify({
        channel: params.channel,
        text: params.text,
        ...(params.blocks ? { blocks: params.blocks } : {}),
      }),
    }) as { ok?: boolean; ts?: string; error?: string };

    return { ok: !!res.ok, ts: res.ts, error: res.error };
  } catch (err) {
    const msg = String(err);
    // Graceful fallback — Slack not yet connected (OAuth not completed)
    if (msg.includes("not_setup") || msg.includes("not_added") || msg.includes("unauthorized") || msg.includes("404")) {
      console.warn("[Slack] Not connected — skipping message to", params.channel);
      return { ok: false, error: "slack_not_connected" };
    }
    console.error("[Slack] postMessage error:", err);
    return { ok: false, error: String(err) };
  }
}

export async function postTechIdeaToSlack(idea: {
  text: string;
  urgency: string;
  techType: string | null;
  linearIdentifier?: string;
}): Promise<{ ok: boolean }> {
  const urgencyEmoji: Record<string, string> = {
    "Now": "🔴",
    "This Week": "🟡",
    "This Month": "🟢",
    "Someday": "⚪",
  };
  const emoji = urgencyEmoji[idea.urgency] ?? "💡";
  const typeLabel = idea.techType ? ` [${idea.techType}]` : "";
  const linearRef = idea.linearIdentifier ? ` • Linear: ${idea.linearIdentifier}` : "";

  const text = `${emoji} *New Tech Idea${typeLabel}* (${idea.urgency})${linearRef}\n> ${idea.text}`;

  return postSlackMessage({ channel: "#tech-ideas", text });
}

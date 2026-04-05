// Slack integration via SLACK_TOKEN env var (Bot/User OAuth token)
// Used by Claude's tool-use loop for reading and posting to Slack

const SLACK_API = "https://slack.com/api";

function getToken(): string | null {
  return process.env.SLACK_TOKEN || null;
}

async function slackFetch<T = Record<string, unknown>>(
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T & { ok: boolean; error?: string }> {
  const token = getToken();
  if (!token) {
    return { ok: false, error: "slack_not_connected" } as T & { ok: boolean; error?: string };
  }

  const res = await fetch(`${SLACK_API}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body || {}),
  });

  const data = await res.json() as T & { ok: boolean; error?: string };
  return data;
}

// ─── Post a message ────────────────────────────────────────────────────────────
export async function postSlackMessage(params: {
  channel: string;
  text: string;
  blocks?: unknown[];
}): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const result = await slackFetch<{ ts?: string }>("chat.postMessage", {
    channel: params.channel,
    text: params.text,
    ...(params.blocks ? { blocks: params.blocks } : {}),
  });

  if (!result.ok) {
    if (result.error === "slack_not_connected") {
      console.warn("[Slack] SLACK_TOKEN not set — skipping message to", params.channel);
    } else {
      console.warn("[Slack] postMessage error:", result.error);
    }
  }
  return { ok: result.ok, ts: result.ts, error: result.error };
}

// ─── Read recent messages from a channel ──────────────────────────────────────
export async function getSlackChannelHistory(params: {
  channel: string;
  limit?: number;
}): Promise<{
  ok: boolean;
  messages?: { text: string; user?: string; ts: string; username?: string }[];
  error?: string;
}> {
  const result = await slackFetch<{
    messages?: { text: string; user?: string; ts: string; username?: string }[];
  }>("conversations.history", {
    channel: params.channel,
    limit: params.limit ?? 20,
  });

  return { ok: result.ok, messages: result.messages, error: result.error };
}

// ─── List channels ─────────────────────────────────────────────────────────────
export async function listSlackChannels(): Promise<{
  ok: boolean;
  channels?: { id: string; name: string; is_member: boolean }[];
  error?: string;
}> {
  const result = await slackFetch<{
    channels?: { id: string; name: string; is_member: boolean }[];
  }>("conversations.list", {
    types: "public_channel,private_channel",
    limit: 100,
    exclude_archived: true,
  });

  return { ok: result.ok, channels: result.channels, error: result.error };
}

// ─── Search Slack messages ─────────────────────────────────────────────────────
export async function searchSlack(query: string): Promise<{
  ok: boolean;
  messages?: { text: string; channel?: { name: string }; ts: string; permalink?: string }[];
  error?: string;
}> {
  const result = await slackFetch<{
    messages?: { matches?: { text: string; channel?: { name: string }; ts: string; permalink?: string }[] };
  }>("search.messages", { query, count: 10 });

  return {
    ok: result.ok,
    messages: result.messages?.matches,
    error: result.error,
  };
}

// ─── List workspace users ──────────────────────────────────────────────────────
export async function listSlackUsers(): Promise<{
  ok: boolean;
  members?: { id: string; name: string; real_name?: string; profile?: { email?: string; display_name?: string } }[];
  error?: string;
}> {
  const result = await slackFetch<{
    members?: { id: string; name: string; real_name?: string; deleted?: boolean; is_bot?: boolean; profile?: { email?: string; display_name?: string } }[];
  }>("users.list", { limit: 200 });

  const filtered = (result.members ?? []).filter(m => !m.deleted && !m.is_bot && m.name !== "slackbot");
  return { ok: result.ok, members: filtered, error: result.error };
}

// ─── DM a user directly ────────────────────────────────────────────────────────
export async function notifyAssigneeViaSlack(params: {
  slackUserId: string;
  ideaText: string;
  category: string;
  urgency: string;
  dueDate: string;
  assigneeName: string;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const urgencyEmoji: Record<string, string> = { "Now": "🔴", "This Week": "🟡", "This Month": "🟢", "Someday": "⚪" };
  const emoji = urgencyEmoji[params.urgency] ?? "💡";
  const dueLine = params.dueDate ? `\n*Due:* ${params.dueDate}` : "";
  const noteLine = params.note ? `\n*Note from Tony:* ${params.note}` : "";
  const text = `${emoji} *Action item assigned to you by Tony Diaz*\n>${params.ideaText}\n*Category:* ${params.category} • *Urgency:* ${params.urgency}${dueLine}${noteLine}`;

  const result = await slackFetch<{ ts?: string }>("chat.postMessage", {
    channel: params.slackUserId,
    text,
  });
  return { ok: result.ok, error: result.error };
}

// ─── Tech idea helper ─────────────────────────────────────────────────────────
export async function postTechIdeaToSlack(idea: {
  text: string;
  urgency: string;
  techType: string | null;
  linearIdentifier?: string;
}): Promise<{ ok: boolean }> {
  const urgencyEmoji: Record<string, string> = {
    "Now": "🔴", "This Week": "🟡", "This Month": "🟢", "Someday": "⚪",
  };
  const emoji = urgencyEmoji[idea.urgency] ?? "💡";
  const typeLabel = idea.techType ? ` [${idea.techType}]` : "";
  const linearRef = idea.linearIdentifier ? ` • Linear: ${idea.linearIdentifier}` : "";
  const text = `${emoji} *New Tech Idea${typeLabel}* (${idea.urgency})${linearRef}\n> ${idea.text}`;

  return postSlackMessage({ channel: "#tech-ideas", text });
}

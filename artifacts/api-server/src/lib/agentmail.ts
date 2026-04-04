import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export async function agentMailRequest<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await connectors.proxy("agentmail", path, {
    method: options.method ?? "GET",
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  return res as T;
}

export async function sendViaAgentMail(params: {
  to: string;
  subject: string;
  body: string;
  inboxId?: string;
}): Promise<{ messageId?: string; ok: boolean }> {
  try {
    // List inboxes to find the right one
    const inboxes = await agentMailRequest<{ inboxes?: { id: string; email: string }[] }>("/v1/inboxes");
    const inbox = params.inboxId
      ? inboxes.inboxes?.find(i => i.id === params.inboxId)
      : inboxes.inboxes?.[0];

    if (!inbox) {
      throw new Error("No AgentMail inbox found");
    }

    const result = await agentMailRequest<{ message_id?: string }>(`/v1/inboxes/${inbox.id}/messages`, {
      method: "POST",
      body: {
        to: [{ email: params.to }],
        subject: params.subject,
        body: params.body,
      },
    });

    return { messageId: result.message_id, ok: true };
  } catch (err) {
    console.error("AgentMail send error:", err);
    return { ok: false };
  }
}

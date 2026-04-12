// AgentMail has been replaced with Resend for system email sending.
// The sheet-scan feature that depended on AgentMail inboxes is no longer available
// via this module. Use sendSystemEmail() for outbound system emails.

const RESEND_BASE = "https://api.resend.com";

function getResendKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY env var is required for system emails");
  return key;
}

export async function sendSystemEmail(params: {
  to: string;
  subject: string;
  body: string;
  from?: string;
}): Promise<{ ok: boolean; messageId?: string }> {
  try {
    const res = await fetch(`${RESEND_BASE}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getResendKey()}`,
      },
      body: JSON.stringify({
        from: params.from || "TCC <onboarding@resend.dev>",
        to: [params.to],
        subject: params.subject,
        html: params.body,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[resend] Send error:", res.status, text);
      return { ok: false };
    }

    const data = await res.json() as { id?: string };
    return { ok: true, messageId: data.id };
  } catch (err) {
    console.error("[resend] Send error:", err);
    return { ok: false };
  }
}

// Legacy exports — agentMailRequest is no longer functional since Replit connectors
// were removed. Callers that used it for inbox polling (sheet-scan) should be updated.
export async function agentMailRequest<T = unknown>(
  _path: string,
  _options: { method?: string; body?: unknown } = {}
): Promise<T> {
  throw new Error("AgentMail is no longer available. Replit connectors have been removed.");
}

export async function sendViaAgentMail(params: {
  to: string;
  subject: string;
  body: string;
  inboxId?: string;
}): Promise<{ messageId?: string; ok: boolean }> {
  // Redirect to Resend
  return sendSystemEmail(params);
}

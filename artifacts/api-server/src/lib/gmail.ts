// Gmail integration via Replit google-mail connector
// Uses googleapis package with token from Replit Connectors
import { google } from "googleapis";

let connectionSettings: {
  settings: {
    expires_at?: string;
    access_token?: string;
    oauth?: { credentials?: { access_token?: string } };
  };
} | null = null;

async function getAccessToken(): Promise<string> {
  if (
    connectionSettings &&
    connectionSettings.settings.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token!;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) throw new Error("X-Replit-Token not found");

  const data = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-mail",
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
  ).then(r => r.json()) as { items?: typeof connectionSettings[] };

  connectionSettings = data.items?.[0] ?? null;

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("Gmail not connected");
  }
  return accessToken;
}

// WARNING: Never cache this client. Tokens expire.
export async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export async function listRecentEmails(maxResults = 10): Promise<{
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
}[]> {
  try {
    const gmail = await getUncachableGmailClient();
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      q: "is:unread",
    });

    const messages = list.data.messages || [];
    const results = [];

    for (const msg of messages.slice(0, maxResults)) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = detail.data.payload?.headers || [];
      const get = (name: string) => headers.find(h => h.name === name)?.value || "";

      results.push({
        id: msg.id!,
        from: get("From"),
        subject: get("Subject"),
        snippet: detail.data.snippet || "",
        date: get("Date"),
      });
    }

    return results;
  } catch (err) {
    console.warn("[Gmail] listRecentEmails failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function draftReply(params: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}): Promise<{ ok: boolean; draftId?: string; error?: string }> {
  try {
    const gmail = await getUncachableGmailClient();
    const raw = Buffer.from(
      [
        `To: ${params.to}`,
        `Subject: ${params.subject}`,
        `Content-Type: text/plain; charset=UTF-8`,
        ``,
        params.body,
      ].join("\r\n")
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw,
          ...(params.threadId ? { threadId: params.threadId } : {}),
        },
      },
    });

    return { ok: true, draftId: draft.data.id || undefined };
  } catch (err) {
    console.warn("[Gmail] draftReply failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: String(err) };
  }
}

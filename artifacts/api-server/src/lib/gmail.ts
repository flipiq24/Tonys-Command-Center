// Gmail integration — dual-mode:
//   Mode A (production): GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN
//     → Full gmail.readonly access, tokens auto-refresh (never expire mid-session)
//   Mode B (connector fallback): Replit google-mail connector
//     → Limited add-on scopes; inbox read may fail (Insufficient Permission)
// Mode A takes priority when all 3 env vars are set.

import { google } from "googleapis";

// ─── Mode A: Refresh token OAuth client ──────────────────────────────────────

function buildRefreshTokenClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

function hasRefreshTokens(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
}

// ─── Mode B: Replit connector token ──────────────────────────────────────────

let connectionSettings: {
  settings: {
    expires_at?: string;
    access_token?: string;
    oauth?: { credentials?: { access_token?: string } };
  };
} | null = null;

async function getConnectorAccessToken(): Promise<string> {
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

// ─── Public: get a fresh Gmail client ────────────────────────────────────────
// WARNING: Never cache this client. Tokens expire.

export async function getUncachableGmailClient() {
  if (hasRefreshTokens()) {
    // Mode A: full gmail.readonly access via refresh token
    const auth = buildRefreshTokenClient();
    return google.gmail({ version: "v1", auth });
  }

  // Mode B: Replit connector (limited scopes)
  const accessToken = await getConnectorAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

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

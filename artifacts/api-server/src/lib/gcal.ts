// Google Calendar integration — dual-mode:
//   Mode A (production): GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN
//     → Full calendar access, tokens auto-refresh (never expire mid-session)
//   Mode B (connector fallback): Replit google-calendar connector
//     → Limited scopes; may still work for calendar.readonly
// Mode A takes priority when all 3 env vars are set.
// Note: Google Calendar and Gmail share the same OAuth credentials and refresh token.

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
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-calendar",
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
  ).then(r => r.json()) as { items?: typeof connectionSettings[] };

  connectionSettings = data.items?.[0] ?? null;

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("Google Calendar not connected");
  }
  return accessToken;
}

// ─── Public: get a fresh Calendar client ─────────────────────────────────────
// WARNING: Never cache this client. Tokens expire.

export async function getUncachableGoogleCalendarClient() {
  if (hasRefreshTokens()) {
    // Mode A: full calendar access via refresh token
    const auth = buildRefreshTokenClient();
    return google.calendar({ version: "v3", auth });
  }

  // Mode B: Replit connector
  const accessToken = await getConnectorAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

export async function getTodayEvents(): Promise<{
  id: string;
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
}[]> {
  try {
    const cal = await getUncachableGoogleCalendarClient();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const response = await cal.events.list({
      calendarId: "primary",
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    return (response.data.items || []).map(e => ({
      id: e.id || "",
      summary: e.summary || "(no title)",
      start: e.start?.dateTime || e.start?.date || "",
      end: e.end?.dateTime || e.end?.date || "",
      description: e.description || undefined,
      location: e.location || undefined,
    }));
  } catch (err) {
    console.warn("[GCal] getTodayEvents failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function createEvent(params: {
  summary: string;
  description?: string;
  start: string;
  end: string;
  attendees?: string[];
}): Promise<{ ok: boolean; eventId?: string; error?: string }> {
  try {
    const cal = await getUncachableGoogleCalendarClient();
    const event = await cal.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: params.summary,
        description: params.description,
        start: { dateTime: params.start },
        end: { dateTime: params.end },
        attendees: params.attendees?.map(email => ({ email })),
      },
    });
    return { ok: true, eventId: event.data.id || undefined };
  } catch (err) {
    console.warn("[GCal] createEvent failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: String(err) };
  }
}

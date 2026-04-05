import { google } from "googleapis";

// ── Connector-based auth (Replit integrations) ─────────────────────────────
// gmail and calendar use the Replit google-mail / google-calendar connectors
// so they never need a manually managed GOOGLE_REFRESH_TOKEN.

interface ConnectorCache {
  accessToken: string;
  expiresAt: number; // unix ms
}

const _connectorCache: Record<string, ConnectorCache> = {};

async function getConnectorAccessToken(connectorName: string): Promise<string> {
  const cached = _connectorCache[connectorName];
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) throw new Error("X-Replit-Token not found (REPL_IDENTITY / WEB_REPL_RENEWAL missing)");
  if (!hostname) throw new Error("REPLIT_CONNECTORS_HOSTNAME missing");

  const res = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=${connectorName}`,
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
  );
  const data = await res.json() as any;
  const conn = data.items?.[0];

  const accessToken: string | undefined =
    conn?.settings?.access_token ||
    conn?.settings?.oauth?.credentials?.access_token;

  if (!accessToken) throw new Error(`${connectorName} connector not connected or missing access_token`);

  const expiresAt: number =
    conn?.settings?.expires_at
      ? new Date(conn.settings.expires_at).getTime()
      : conn?.settings?.oauth?.credentials?.expiry_date
      ?? Date.now() + 55 * 60 * 1000; // default: 55 min

  _connectorCache[connectorName] = { accessToken, expiresAt };
  return accessToken;
}

function makeOAuth2Client(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return auth;
}

export async function getGmail() {
  const token = await getConnectorAccessToken("google-mail");
  return google.gmail({ version: "v1", auth: makeOAuth2Client(token) });
}

export async function getCalendar() {
  const token = await getConnectorAccessToken("google-calendar");
  return google.calendar({ version: "v3", auth: makeOAuth2Client(token) });
}

// ── Legacy env-var-based auth (Drive, Docs, People, Tasks) ─────────────────

let _auth: InstanceType<typeof google.auth.OAuth2> | null = null;

export function getGoogleAuth() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      "Google OAuth not configured. Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN"
    );
  }
  if (!_auth) {
    _auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    _auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    _auth.on("tokens", (tokens) => {
      if (tokens.refresh_token) {
        console.warn(
          "[google-auth] WARNING: Google issued a new refresh token. " +
          "Update GOOGLE_REFRESH_TOKEN env var with the new token to prevent auth failures."
        );
      }
    });
  }
  return _auth;
}

export async function withGoogleAuth<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const isInvalidGrant =
      err?.message?.includes("invalid_grant") ||
      err?.response?.data?.error === "invalid_grant";
    if (isInvalidGrant) {
      _auth = null;
      throw new Error(
        "Google OAuth token expired. Update GOOGLE_REFRESH_TOKEN env var with a fresh token."
      );
    }
    throw err;
  }
}

export function getDrive() {
  return google.drive({ version: "v3", auth: getGoogleAuth() });
}

export function getSheets() {
  return google.sheets({ version: "v4", auth: getGoogleAuth() });
}

export function getPeople() {
  return google.people({ version: "v1", auth: getGoogleAuth() });
}

export function getDocs() {
  return google.docs({ version: "v1", auth: getGoogleAuth() });
}

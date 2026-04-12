import { google } from "googleapis";

// ── Unified OAuth2 auth for ALL Google APIs ─────────────────────────────────
// Uses a single OAuth2 refresh token for Gmail, Calendar, Drive, Sheets,
// Docs, People, and Tasks. Replaces the former Replit Connectors approach.

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

// Kept async to avoid breaking callers that await these
export async function getGmail() {
  return google.gmail({ version: "v1", auth: getGoogleAuth() });
}

export async function getCalendar() {
  return google.calendar({ version: "v3", auth: getGoogleAuth() });
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

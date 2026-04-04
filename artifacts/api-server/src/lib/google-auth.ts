import { google } from "googleapis";

let _auth: InstanceType<typeof google.auth.OAuth2> | null = null;

export function getGoogleAuth() {
  if (!_auth) {
    _auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    _auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
  return _auth;
}

export function getGmail() {
  return google.gmail({ version: "v1", auth: getGoogleAuth() });
}

export function getCalendar() {
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

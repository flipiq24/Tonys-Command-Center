import { google } from "googleapis";

let sheetConnectionSettings: any;

async function getSheetsAccessToken() {
  if (
    sheetConnectionSettings?.settings?.expires_at &&
    new Date(sheetConnectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return sheetConnectionSettings.settings.access_token as string;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) throw new Error("X-Replit-Token not found");

  sheetConnectionSettings = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-sheet`,
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
  )
    .then((r) => r.json())
    .then((d) => d.items?.[0]);

  const accessToken =
    sheetConnectionSettings?.settings?.access_token ||
    sheetConnectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!accessToken) throw new Error("Google Sheet not connected");
  return accessToken as string;
}

async function getSheets() {
  const accessToken = await getSheetsAccessToken();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth });
}

export { getSheets as getSheetsClient };

export async function appendToSheet(
  spreadsheetId: string,
  sheetName: string,
  values: (string | number | boolean | null)[]
) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}

export async function getSheetValues(spreadsheetId: string, range: string): Promise<string[][]> {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values || []) as string[][];
}

export async function updateCell(spreadsheetId: string, range: string, value: string) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

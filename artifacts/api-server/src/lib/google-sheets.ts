// Direct fetch-based Google Sheets client — bypasses googleapis library
// which has bundling issues with esbuild.

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

let _cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (_cachedToken && Date.now() < _cachedToken.expiresAt - 60_000) {
    return _cachedToken.token;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const data = await res.json();
  _cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return _cachedToken.token;
}

async function sheetsRequest(url: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API ${res.status}: ${err}`);
  }

  return res.json();
}

// Keep the old export name for compatibility
export async function getSheetsClient() {
  // Return a minimal shim that the clearAndWriteTab function in sheets-sync.ts uses
  const token = await getAccessToken();
  return {
    spreadsheets: {
      values: {
        clear: async ({ spreadsheetId, range }: { spreadsheetId: string; range: string }) => {
          return sheetsRequest(
            `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
            { method: "POST", body: JSON.stringify({}) }
          );
        },
        update: async ({ spreadsheetId, range, valueInputOption, requestBody }: {
          spreadsheetId: string; range: string; valueInputOption: string; requestBody: { values: any[][] };
        }) => {
          return sheetsRequest(
            `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`,
            { method: "PUT", body: JSON.stringify(requestBody) }
          );
        },
      },
    },
  };
}

export async function appendToSheet(
  spreadsheetId: string,
  sheetName: string,
  values: (string | number | boolean | null)[]
) {
  const range = encodeURIComponent(`${sheetName}!A:Z`);
  await sheetsRequest(
    `${SHEETS_BASE}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [values] }) }
  );
}

export async function getSheetValues(spreadsheetId: string, range: string): Promise<string[][]> {
  const data = await sheetsRequest(
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`
  );
  return (data.values || []) as string[][];
}

/**
 * Upsert a row in a sheet: find by column A value (e.g. date), update if exists, append if not.
 * Returns the 1-based row number where data was written.
 */
export async function upsertSheetRow(
  spreadsheetId: string,
  sheetName: string,
  keyValue: string,
  values: (string | number | boolean | null)[]
): Promise<number> {
  const rows = await getSheetValues(spreadsheetId, `${sheetName}!A:A`);
  let rowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === keyValue) { rowIndex = i + 1; break; } // 1-based
  }
  const range = encodeURIComponent(`${sheetName}!A${rowIndex > 0 ? rowIndex : rows.length + 1}`);
  await sheetsRequest(
    `${SHEETS_BASE}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ values: [values] }) }
  );
  return rowIndex > 0 ? rowIndex : rows.length + 1;
}

export async function updateCell(spreadsheetId: string, range: string, value: string) {
  await sheetsRequest(
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ values: [[value]] }) }
  );
}

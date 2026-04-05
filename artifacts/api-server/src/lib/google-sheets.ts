import { ReplitConnectors } from "@replit/connectors-sdk";

function getConnectors() {
  return new ReplitConnectors();
}

async function sheetsRequest(path: string, options: { method?: string; body?: unknown } = {}) {
  const connectors = getConnectors();
  const { method = "GET", body } = options;

  const fetchOpts: RequestInit = { method };
  if (body) {
    fetchOpts.body = JSON.stringify(body);
    (fetchOpts as any).headers = { "Content-Type": "application/json" };
  }

  const res = await connectors.proxy("google-sheet", path, fetchOpts as any);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Sheets API ${method} ${path} → ${res.status}: ${errText}`);
  }
  return res.json();
}

export async function appendToSheet(spreadsheetId: string, sheetName: string, values: (string | number | boolean | null)[]) {
  await sheetsRequest(
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName + "!A:Z")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: { values: [values] } }
  );
}

export async function getSheetValues(spreadsheetId: string, range: string): Promise<string[][]> {
  const res = await sheetsRequest(`/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`);
  return (res.values || []) as string[][];
}

export async function updateCell(spreadsheetId: string, range: string, value: string) {
  await sheetsRequest(
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: { values: [[value]] } }
  );
}

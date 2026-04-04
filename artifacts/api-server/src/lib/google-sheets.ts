import { getSheets } from "./google-auth";

export async function appendToSheet(spreadsheetId: string, sheetName: string, values: (string | number | boolean | null)[]) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}

export async function getSheetValues(spreadsheetId: string, range: string): Promise<string[][]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values || []) as string[][];
}

export async function updateCell(spreadsheetId: string, range: string, value: string) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

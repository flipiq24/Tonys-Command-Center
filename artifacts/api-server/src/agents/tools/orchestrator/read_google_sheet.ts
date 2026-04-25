// read_google_sheet — orchestrator wrapper. Reads rows from a Google Sheet.

import type { ToolHandler } from "../index.js";
import { getSheetValues } from "../../../lib/google-sheets.js";

const handler: ToolHandler = async (input) => {
  try {
    const range = input.range ? `${input.tab_name}!${input.range}` : String(input.tab_name);
    const rows = await getSheetValues(String(input.sheet_id), range);
    if (!rows || rows.length === 0) return `No data found in sheet "${input.tab_name}".`;
    return rows.slice(0, 100).map(r => r.join(" | ")).join("\n");
  } catch (err) {
    return `Google Sheet read failed: ${err instanceof Error ? err.message : String(err)}`;
  }
};

export default handler;

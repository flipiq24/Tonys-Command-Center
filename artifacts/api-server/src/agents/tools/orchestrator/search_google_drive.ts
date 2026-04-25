// search_google_drive — orchestrator wrapper. Searches Drive by name/fullText.

import type { ToolHandler } from "../index.js";
import { getDrive } from "../../../lib/google-auth.js";

const handler: ToolHandler = async (input) => {
  try {
    const drive = getDrive();
    const q = String(input.query);
    const limit = typeof input.limit === "number" ? Math.min(input.limit, 20) : 10;
    const res = await drive.files.list({
      q: `name contains '${q.replace(/'/g, "\\'")}' or fullText contains '${q.replace(/'/g, "\\'")}'`,
      pageSize: limit,
      fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
    });
    const files = res.data.files || [];
    if (files.length === 0) return `No Drive files found for "${q}".`;
    return files.map((f, i) => {
      const type = (f.mimeType || "").replace("application/vnd.google-apps.", "").replace("application/", "");
      const modified = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString("en-US") : "unknown";
      return `${i + 1}. ${f.name} [${type}] — modified ${modified}\n   ID: ${f.id}${f.webViewLink ? `\n   ${f.webViewLink}` : ""}`;
    }).join("\n\n");
  } catch (err) {
    return `Drive search failed: ${err instanceof Error ? err.message : String(err)}`;
  }
};

export default handler;

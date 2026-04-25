// read_google_doc — orchestrator wrapper. Reads full text of a Google Doc.

import type { ToolHandler } from "../index.js";
import { getDocText } from "../../../lib/google-docs.js";

const handler: ToolHandler = async (input) => {
  try {
    const text = await getDocText(String(input.doc_id));
    if (!text) return `Google Doc "${input.doc_id}" is empty or could not be read.`;
    return text.slice(0, 8000);
  } catch (err) {
    return `Google Doc read failed: ${err instanceof Error ? err.message : String(err)}`;
  }
};

export default handler;

// web_search — native Anthropic tool (web_search_20250305). The runtime
// short-circuits is_native=1 rows; this handler should never be invoked.

import type { ToolHandler } from "../index.js";

const handler: ToolHandler = async () => {
  throw new Error("native tool — should not be resolved locally");
};

export default handler;

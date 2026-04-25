// browse_url — native Anthropic tool. The runtime short-circuits is_native=1
// rows; this handler should never be invoked.

import type { ToolHandler } from "../index.js";

const handler: ToolHandler = async () => {
  throw new Error("native tool — should not be resolved locally");
};

export default handler;

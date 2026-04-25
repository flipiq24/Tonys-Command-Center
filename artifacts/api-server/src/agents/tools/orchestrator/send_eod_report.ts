// send_eod_report — orchestrator wrapper. Triggers EOD report send.

import type { ToolHandler } from "../index.js";
import { sendAutoEod } from "../../../routes/tcc/eod.js";

const handler: ToolHandler = async () => {
  const result = await sendAutoEod();
  if (result.alreadySent) return `✓ EOD report already sent today — no duplicate sent.`;
  if (!result.ok) return `✗ EOD report failed to generate.`;
  return `✓ EOD report sent!\n- Calls: ${result.callsMade ?? 0}\n- Demos: ${result.demosBooked ?? 0}\n- Tasks completed: ${result.tasksCompleted ?? 0}\n\nTony's summary → tony@flipiq.com\nEthan's accountability brief → ethan@flipiq.com`;
};

export default handler;

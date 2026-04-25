// create_calendar_reminder — orchestrator wrapper. Quick personal reminder
// (no attendees, no scope gatekeeper, default 30-min duration).

import type { ToolHandler } from "../index.js";
import { createEvent } from "../../../lib/gcal.js";

const handler: ToolHandler = async (input) => {
  try {
    const startDt = String(input.datetime);
    const endDate = new Date(startDt);
    endDate.setMinutes(endDate.getMinutes() + 30);
    const result = await createEvent({
      summary: String(input.title),
      description: input.notes ? String(input.notes) : undefined,
      start: startDt,
      end: endDate.toISOString(),
    });
    if (result.ok) return `✓ Reminder created: "${input.title}" at ${new Date(startDt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} (ID: ${result.eventId})`;
    return `✗ Failed to create reminder: ${result.error}`;
  } catch (err) {
    return `Reminder creation failed: ${err instanceof Error ? err.message : String(err)}`;
  }
};

export default handler;

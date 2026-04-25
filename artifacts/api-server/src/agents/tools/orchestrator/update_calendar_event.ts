// update_calendar_event — orchestrator wrapper. Patches an existing event.

import type { ToolHandler } from "../index.js";
import { getCalendar } from "../../../lib/google-auth.js";

const handler: ToolHandler = async (input) => {
  try {
    const cal = await getCalendar();
    const patch: Record<string, unknown> = {};
    if (input.summary) patch.summary = String(input.summary);
    if (input.description) patch.description = String(input.description);
    if (input.location) patch.location = String(input.location);
    if (input.start) patch.start = { dateTime: String(input.start) };
    if (input.end) patch.end = { dateTime: String(input.end) };
    const res = await cal.events.patch({ calendarId: "primary", eventId: String(input.event_id), requestBody: patch });
    return `✓ Calendar event updated: "${res.data.summary}" (ID: ${res.data.id})`;
  } catch (err) {
    return `Failed to update event: ${err instanceof Error ? err.message : String(err)}`;
  }
};

export default handler;

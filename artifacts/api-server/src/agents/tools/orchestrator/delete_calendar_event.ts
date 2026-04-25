// delete_calendar_event — orchestrator wrapper. Deletes a calendar event by ID.

import type { ToolHandler } from "../index.js";
import { getCalendar } from "../../../lib/google-auth.js";

const handler: ToolHandler = async (input) => {
  try {
    const cal = await getCalendar();
    await cal.events.delete({ calendarId: "primary", eventId: String(input.event_id) });
    return `✓ Calendar event deleted (ID: ${input.event_id})`;
  } catch (err) {
    return `Failed to delete event: ${err instanceof Error ? err.message : String(err)}`;
  }
};

export default handler;

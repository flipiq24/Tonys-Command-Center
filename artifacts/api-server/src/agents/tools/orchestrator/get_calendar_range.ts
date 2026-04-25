// get_calendar_range — orchestrator wrapper. Lists calendar events between
// two ISO dates, max 50.

import type { ToolHandler } from "../index.js";
import { getCalendar } from "../../../lib/google-auth.js";

const handler: ToolHandler = async (input) => {
  try {
    const cal = await getCalendar();
    const timeMin = new Date(String(input.start_date)).toISOString();
    const timeMax = new Date(String(input.end_date)).toISOString();
    const res = await cal.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });
    const events = res.data.items || [];
    if (events.length === 0) return `No calendar events found between ${input.start_date} and ${input.end_date}.`;
    return events.map((e, i) => {
      const start = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : e.start?.date || "";
      const end = e.end?.dateTime ? new Date(e.end.dateTime).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }) : "";
      const attendees = (e.attendees || []).map(a => a.email).join(", ");
      return `${i + 1}. ${e.summary || "(no title)"}\n   ${start}${end ? ` – ${end}` : ""}${e.location ? `\n   📍 ${e.location}` : ""}${attendees ? `\n   👥 ${attendees}` : ""}${e.description ? `\n   ${e.description.slice(0, 100)}` : ""}\n   ID: ${e.id}`;
    }).join("\n\n");
  } catch (err) {
    return `Calendar range fetch failed: ${err instanceof Error ? err.message : String(err)}`;
  }
};

export default handler;

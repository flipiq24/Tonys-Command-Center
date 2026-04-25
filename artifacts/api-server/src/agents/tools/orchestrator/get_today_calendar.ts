// get_today_calendar — orchestrator wrapper. Fetches today's Google Calendar events.

import type { ToolHandler } from "../index.js";
import { getTodayEvents } from "../../../lib/gcal.js";

const handler: ToolHandler = async () => {
  const events = await getTodayEvents();
  if (events.length === 0) return "No events on Tony's calendar today (or Google Calendar not yet authorized).";
  return events.map((e, i) => {
    const start = new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const end = new Date(e.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${i + 1}. ${e.summary}\n   ${start} – ${end}${e.location ? `\n   📍 ${e.location}` : ""}${e.description ? `\n   ${e.description.slice(0, 100)}` : ""}`;
  }).join("\n\n");
};

export default handler;

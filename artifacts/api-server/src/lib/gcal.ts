import { getCalendar } from "./google-auth";
import { pacificDayRangeISO } from "./dates";

// Add one day to a YYYY-MM-DD string (used for Google Calendar's exclusive
// end-date convention on all-day events).
function addOneDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export async function listTodayEvents(): Promise<{
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}[]> {
  try {
    const calendar = await getCalendar();
    const { timeMin, timeMax } = pacificDayRangeISO();

    const events = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      timeZone: "America/Los_Angeles",
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });

    return (events.data.items || []).map(e => ({
      id: e.id || "",
      summary: e.summary || "Untitled",
      start: e.start?.dateTime || e.start?.date || "",
      end: e.end?.dateTime || e.end?.date || "",
      location: e.location || undefined,
      description: e.description || undefined,
    }));
  } catch (err) {
    console.warn("[Calendar] listTodayEvents failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

// Alias for backward compatibility with existing code
export const getTodayEvents = listTodayEvents;

export async function createEvent(params: {
  summary: string;
  start: string;
  end: string;
  allDay?: boolean;
  attendees?: string[];
  description?: string;
  location?: string;
  colorId?: string;
  createMeetLink?: boolean;
}): Promise<{ ok: boolean; eventId?: string; htmlLink?: string; meetLink?: string; error?: string }> {
  try {
    const calendar = await getCalendar();
    const withMeet = params.createMeetLink || (params.attendees && params.attendees.length > 0);
    // Google Calendar all-day events use `date` (YYYY-MM-DD) and require the
    // end date to be EXCLUSIVE (i.e. day after the last day of the event).
    const startBlock = params.allDay ? { date: params.start } : { dateTime: params.start };
    const endBlock = params.allDay ? { date: addOneDay(params.end) } : { dateTime: params.end };
    const event = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: withMeet ? 1 : 0,
      requestBody: {
        summary: params.summary,
        start: startBlock,
        end: endBlock,
        attendees: params.attendees?.map(email => ({ email })),
        description: params.description,
        location: params.location,
        colorId: params.colorId,
        ...(withMeet ? {
          conferenceData: {
            createRequest: {
              requestId: `tcc-${Date.now()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        } : {}),
      },
    });
    const meetLink = event.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === "video")?.uri;
    return {
      ok: true,
      eventId: event.data.id || undefined,
      htmlLink: event.data.htmlLink || undefined,
      meetLink: meetLink || undefined,
    };
  } catch (err) {
    console.warn("[Calendar] createEvent failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: String(err) };
  }
}

export async function createReminder(params: {
  summary: string;
  date: string;
  description?: string;
}): Promise<{ ok: boolean; eventId?: string; htmlLink?: string }> {
  try {
    const calendar = await getCalendar();
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: params.summary,
        start: { date: params.date },
        end: { date: params.date },
        description: params.description,
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 540 },
          ],
        },
      },
    });
    return { ok: true, eventId: event.data.id || undefined, htmlLink: event.data.htmlLink || undefined };
  } catch (err) {
    console.warn("[Calendar] createReminder failed:", err instanceof Error ? err.message : err);
    return { ok: false };
  }
}

export async function listUpcomingEvents(days = 7): Promise<{
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  attendees?: string[];
}[]> {
  try {
    const calendar = await getCalendar();
    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const events = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });

    return (events.data.items || []).map(e => ({
      id: e.id || "",
      summary: e.summary || "Untitled",
      start: e.start?.dateTime || e.start?.date || "",
      end: e.end?.dateTime || e.end?.date || "",
      location: e.location || undefined,
      description: e.description || undefined,
      attendees: e.attendees?.map(a => a.email || "").filter(Boolean),
    }));
  } catch (err) {
    console.warn("[Calendar] listUpcomingEvents failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

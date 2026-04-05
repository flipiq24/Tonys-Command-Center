import { getCalendar } from "./google-auth";

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
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const events = await calendar.events.list({
      calendarId: "primary",
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
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
  attendees?: string[];
  description?: string;
  location?: string;
  colorId?: string;
  createMeetLink?: boolean;
}): Promise<{ ok: boolean; eventId?: string; htmlLink?: string; meetLink?: string; error?: string }> {
  try {
    const calendar = await getCalendar();
    const withMeet = params.createMeetLink || (params.attendees && params.attendees.length > 0);
    const event = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: withMeet ? 1 : 0,
      requestBody: {
        summary: params.summary,
        start: { dateTime: params.start },
        end: { dateTime: params.end },
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

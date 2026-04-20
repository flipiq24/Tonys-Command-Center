const LA_TZ = "America/Los_Angeles";

export function todayPacific(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: LA_TZ });
}

function pacificOffset(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LA_TZ,
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const name = parts.find(p => p.type === "timeZoneName")?.value ?? "GMT-08:00";
  const m = name.match(/GMT([+-]\d{2}):?(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "-08:00";
}

// Returns ISO strings for midnight Pacific today and midnight Pacific tomorrow,
// suitable for Google Calendar timeMin/timeMax. Works regardless of server TZ
// and handles PDT/PST correctly.
export function pacificDayRangeISO(at: Date = new Date()): { timeMin: string; timeMax: string } {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: LA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  const offset = pacificOffset(at);
  const startLocal = new Date(`${ymd}T00:00:00${offset}`);
  const endLocal = new Date(startLocal.getTime() + 24 * 60 * 60 * 1000);
  return { timeMin: startLocal.toISOString(), timeMax: endLocal.toISOString() };
}

// Debug script — pulls Tony's live Google Calendar for today (Pacific)
// Run: node artifacts/api-server/scripts/debug-calendar.mjs
import { google } from "googleapis";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

function loadEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch {}
}

loadEnv(resolve(repoRoot, ".env"));
loadEnv(resolve(repoRoot, "artifacts/api-server/.env"));

const LA_TZ = "America/Los_Angeles";

function pacificOffset(at) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LA_TZ,
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const name = parts.find(p => p.type === "timeZoneName")?.value ?? "GMT-08:00";
  const m = name.match(/GMT([+-]\d{2}):?(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "-08:00";
}

function pacificDayRangeISO(at = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: LA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  const offset = pacificOffset(at);
  const startLocal = new Date(`${ymd}T00:00:00${offset}`);
  const endLocal = new Date(startLocal.getTime() + 24 * 60 * 60 * 1000);
  return { timeMin: startLocal.toISOString(), timeMax: endLocal.toISOString(), pacificDate: ymd, offset };
}

const now = new Date();
const { timeMin, timeMax, pacificDate, offset } = pacificDayRangeISO(now);

console.log("=".repeat(80));
console.log("Server UTC now :", now.toISOString());
console.log("Pacific now    :", now.toLocaleString("en-US", { timeZone: LA_TZ, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }));
console.log("Pacific date   :", pacificDate, "(offset", offset + ")");
console.log("timeMin (UTC)  :", timeMin);
console.log("timeMax (UTC)  :", timeMax);
console.log("=".repeat(80));

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
  console.error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN in .env");
  process.exit(1);
}

const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: "v3", auth });

const res = await calendar.events.list({
  calendarId: "primary",
  timeMin,
  timeMax,
  timeZone: LA_TZ,
  singleEvents: true,
  orderBy: "startTime",
  maxResults: 100,
});

const rawEvents = res.data.items || [];
// Apply same filter as fetchLiveCalendar
const events = rawEvents.filter(e => {
  if (e.status === "cancelled") return false;
  if (e.start?.date && !e.start?.dateTime) return false;
  return true;
});
console.log(`\nRAW events from Google : ${rawEvents.length}`);
console.log(`After all-day + cancelled filter (what UI gets) : ${events.length}\n`);

for (const e of events) {
  const startRaw = e.start?.dateTime || e.start?.date;
  const endRaw = e.end?.dateTime || e.end?.date;
  const startLabel = startRaw
    ? new Date(startRaw).toLocaleString("en-US", { timeZone: LA_TZ, hour: "numeric", minute: "2-digit", hour12: true })
    : "(all-day)";
  const endLabel = endRaw
    ? new Date(endRaw).toLocaleString("en-US", { timeZone: LA_TZ, hour: "numeric", minute: "2-digit", hour12: true })
    : "";
  const allDay = !!e.start?.date;
  const attendees = (e.attendees || []).length;
  const recurring = e.recurringEventId ? " [recurring]" : "";
  const cancelled = e.status === "cancelled" ? " [CANCELLED]" : "";
  console.log(
    `• ${startLabel}${endLabel ? " – " + endLabel : ""}${allDay ? " (all-day)" : ""}  ${e.summary || "(no title)"}${attendees > 1 ? ` [${attendees} attendees]` : ""}${recurring}${cancelled}`
  );
  if (e.location) console.log(`    📍 ${e.location}`);
  if (startRaw) console.log(`    raw start: ${startRaw}`);
  if (endRaw) console.log(`    raw end:   ${endRaw}`);
}

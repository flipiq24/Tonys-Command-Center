import { useState, useEffect } from "react";
import { C, F, FS } from "./constants";
import type { CalItem } from "./types";

interface Props {
  items: CalItem[];
  onClose: () => void;
  onSchedule: () => void;
}

function parseTimeToPacificMinutes(t: string): number | null {
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function getPacificNowMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === "hour")?.value || "0");
  const m = parseInt(parts.find(p => p.type === "minute")?.value || "0");
  return (h === 24 ? 0 : h) * 60 + m;
}

function calendarUrl(htmlLink?: string, eventId?: string): string {
  if (htmlLink) return htmlLink;
  if (eventId) {
    const encoded = btoa(eventId).replace(/=+$/, "");
    return `https://www.google.com/calendar/event?eid=${encoded}`;
  }
  return "https://calendar.google.com";
}

export function CalendarSidebar({ items, onClose, onSchedule }: Props) {
  const [nowMin, setNowMin] = useState(getPacificNowMinutes);

  useEffect(() => {
    const timer = setInterval(() => setNowMin(getPacificNowMinutes()), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{
      position: "fixed", top: 52, right: 0, bottom: 0, width: 300,
      background: C.card, borderLeft: `1px solid ${C.brd}`,
      zIndex: 40, overflow: "auto", padding: "14px 16px",
      boxShadow: "-4px 0 20px rgba(0,0,0,0.08)", fontFamily: F,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontFamily: FS, fontSize: 15, fontWeight: 700, color: C.tx }}>Today's Schedule</span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.mut }}
        >✕</button>
      </div>

      {/* Items */}
      {items.map((c, i) => {
        const itemMin = parseTimeToPacificMinutes(c.t);
        const isPast = itemMin !== null ? itemMin < nowMin : false;
        const isCurrent = (() => {
          if (itemMin === null) return false;
          const nextItem = items[i + 1];
          const nextMin = nextItem ? parseTimeToPacificMinutes(nextItem.t) : null;
          return itemMin <= nowMin && (nextMin === null || nextMin > nowMin);
        })();

        return (
          <div
            key={`${c.t}-${i}`}
            style={{
              position: "relative",
              display: "flex",
              gap: 8,
              padding: "7px 0",
              borderBottom: `1px solid ${C.brd}`,
              opacity: isPast && !isCurrent ? 0.45 : 1,
              transition: "opacity 0.3s",
            }}
          >
            {/* NOW bar */}
            {isCurrent && (
              <div style={{
                position: "absolute",
                left: 0, right: 0, top: -1,
                height: 2,
                background: "#2563EB",
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
              }}>
                <span style={{
                  background: "#2563EB", color: "#fff",
                  fontSize: 8, fontWeight: 700,
                  padding: "1px 4px", borderRadius: 3,
                  marginLeft: 6, letterSpacing: 0.5,
                  textTransform: "uppercase", fontFamily: F,
                }}>NOW</span>
              </div>
            )}

            {/* Time — clickable calendar link */}
            <a
              href={calendarUrl(c.htmlLink, c.calendarEventId)}
              target="_blank"
              rel="noopener noreferrer"
              title={c.htmlLink || c.calendarEventId ? "Open event in Google Calendar" : "Open Google Calendar"}
              style={{
                fontSize: 10, fontWeight: 700,
                color: isCurrent ? "#2563EB" : (c.real ? C.blu : C.mut),
                minWidth: 55, flexShrink: 0,
                textDecoration: "none", cursor: "pointer",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.65"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            >
              {c.t}
            </a>

            {/* Title + note */}
            <div style={{
              fontSize: 11, fontWeight: c.real ? 700 : 400,
              color: isCurrent ? "#2563EB" : (c.real ? C.blu : C.tx),
              flex: 1, lineHeight: 1.4,
            }}>
              {c.n}
              {c.note && <span style={{ color: C.amb, marginLeft: 4 }}>⚡</span>}
              {c.loc && <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>📍 {c.loc}</div>}
            </div>
          </div>
        );
      })}

      {items.length === 0 && (
        <div style={{ padding: "24px 0", textAlign: "center", color: C.mut, fontSize: 12 }}>
          No events loaded
        </div>
      )}

      {/* View full schedule CTA */}
      <button
        onClick={onSchedule}
        style={{
          width: "100%", marginTop: 16, padding: "10px 0",
          background: C.blu, color: "#fff", border: "none", borderRadius: 10,
          fontFamily: F, fontSize: 13, fontWeight: 700, cursor: "pointer",
          letterSpacing: 0.2,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.88"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
      >
        View Full Schedule →
      </button>
    </div>
  );
}

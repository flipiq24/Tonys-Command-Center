import { useState, useEffect } from "react";
import { C, F, FS } from "./constants";
import type { CalItem } from "./types";

interface Props {
  items: CalItem[];
  onClose: () => void;
  onSchedule: () => void;
}

function parseTime(t: string): Date | null {
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}

function calendarUrl(eventId?: string): string {
  if (eventId) {
    const encoded = btoa(eventId).replace(/=+$/, "");
    return `https://www.google.com/calendar/event?eid=${encoded}`;
  }
  return "https://calendar.google.com";
}

export function CalendarSidebar({ items, onClose, onSchedule }: Props) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
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
        <button
          onClick={onSchedule}
          style={{
            fontFamily: FS, fontSize: 15, margin: 0, background: "none", border: "none",
            cursor: "pointer", color: C.tx, padding: 0, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 6,
          }}
          title="Open full schedule"
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.blu; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.tx; }}
        >
          Schedule
          <span style={{ fontSize: 11, color: C.mut, fontFamily: F, fontWeight: 400 }}>↗</span>
        </button>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.mut }}
        >
          ✕
        </button>
      </div>

      {/* Items */}
      {items.map((c, i) => {
        const itemTime = parseTime(c.t);
        const isPast = itemTime ? itemTime < now : false;
        const isCurrent = (() => {
          if (!itemTime) return false;
          const nextItem = items[i + 1];
          const nextTime = nextItem ? parseTime(nextItem.t) : null;
          return itemTime <= now && (!nextTime || nextTime > now);
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
              href={calendarUrl(c.calendarEventId)}
              target="_blank"
              rel="noopener noreferrer"
              title={c.calendarEventId ? "Open in Google Calendar" : "Open Google Calendar"}
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
    </div>
  );
}

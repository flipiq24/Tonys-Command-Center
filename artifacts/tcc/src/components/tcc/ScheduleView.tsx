import { useState, useEffect } from "react";
import { C, F, FS, card, btn1, btn2 } from "./constants";
import type { CalItem } from "./types";
import { DeepLink } from "./DeepLink";

interface Props {
  items: CalItem[];
  onEnterSales: () => void;
  onEnterTasks: () => void;
}

function parseTime(t: string): Date | null {
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]); const min = parseInt(m[2]); const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}

export function ScheduleView({ items, onEnterSales, onEnterTasks }: Props) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const nowTime = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <div style={{ maxWidth: 760, margin: "24px auto", padding: "0 20px" }}>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Today's Schedule</h3>
          <span style={{ fontSize: 12, color: C.mut }}>{items.length} items · Now: {nowTime}</span>
        </div>

        {items.length === 0 && (
          <div style={{ padding: "24px 0", textAlign: "center", color: C.mut, fontSize: 14 }}>
            No calendar items loaded. Connect Google Calendar for live schedule.
          </div>
        )}

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
              key={`${c.t}-${c.n}-${i}`}
              style={{
                position: "relative",
                display: "flex",
                gap: 12,
                padding: "12px 14px",
                marginBottom: 4,
                background: isCurrent ? "#EFF6FF" : (c.real ? C.bluBg : "#FAFAF8"),
                borderRadius: 10,
                borderLeft: `4px solid ${isCurrent ? "#2563EB" : (c.real ? C.blu : C.brd)}`,
                opacity: isPast && !isCurrent ? 0.55 : 1,
                transition: "opacity 0.3s",
              }}
            >
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
                    background: "#2563EB",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: 3,
                    marginLeft: 8,
                    fontFamily: F,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  }}>NOW</span>
                </div>
              )}
              <span style={{ fontSize: 13, fontWeight: 700, color: isCurrent ? "#2563EB" : (c.real ? C.blu : C.mut), minWidth: 75, flexShrink: 0 }}>{c.t}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: c.real ? 700 : 500, color: isPast && !isCurrent ? C.sub : C.tx }}>
                  {c.n}
                </div>
                {c.loc && <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>📍 {c.loc}</div>}
                {c.note && <div style={{ fontSize: 12, color: C.amb, marginTop: 2 }}>⚡ {c.note}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, alignSelf: "center", flexShrink: 0 }}>
                {c.real
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: isCurrent ? "#2563EB" : C.blu, background: "#fff", padding: "2px 8px", borderRadius: 4 }}>
                      {isCurrent ? "▶ NOW" : "MEETING"}
                    </span>
                  : <span style={{ fontSize: 10, color: C.mut }}>note</span>
                }
                {c.calendarEventId
                  ? <DeepLink type="calendar" id={c.calendarEventId} />
                  : (
                    <a
                      href="https://calendar.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open Google Calendar"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        color: C.mut,
                        fontSize: 11,
                        textDecoration: "none",
                        border: `1px solid ${C.brd}`,
                        borderRadius: 4,
                        padding: "2px 6px",
                        background: C.card,
                        flexShrink: 0,
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.blu; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.mut; }}
                    >
                      <span>📅</span>
                      <span>Calendar</span>
                    </a>
                  )
                }
                {c.gmailMessageId && <DeepLink type="email" id={c.gmailMessageId} />}
                {c.slackChannelId && c.slackMessageTs && <DeepLink type="slack" id="" channelId={c.slackChannelId} messageTs={c.slackMessageTs} />}
                {c.linearIdentifier && <DeepLink type="linear" id="" identifier={c.linearIdentifier} />}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={onEnterSales} style={{ ...btn1, width: "100%", padding: 18, fontSize: 17, marginBottom: 10 }}>
        📞 Enter Sales Mode →
      </button>
      <button onClick={onEnterTasks} style={{ ...btn2, width: "100%", padding: 14, marginBottom: 40 }}>
        ✅ Enter Task Mode
      </button>
    </div>
  );
}

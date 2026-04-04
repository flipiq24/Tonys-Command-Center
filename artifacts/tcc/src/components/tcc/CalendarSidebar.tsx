import { C, FS } from "./constants";
import type { CalItem } from "./types";
import { DeepLink } from "./DeepLink";

interface Props {
  items: CalItem[];
  onClose: () => void;
}

export function CalendarSidebar({ items, onClose }: Props) {
  return (
    <div style={{ position: "fixed", top: 52, right: 0, bottom: 0, width: 300, background: C.card, borderLeft: `1px solid ${C.brd}`, zIndex: 40, overflow: "auto", padding: "14px 16px", boxShadow: "-4px 0 20px rgba(0,0,0,0.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ fontFamily: FS, fontSize: 15, margin: 0 }}>📅 Schedule</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.mut }}>✕</button>
      </div>
      {items.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.brd}` }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.real ? C.blu : C.mut, minWidth: 55 }}>{c.t}</span>
          <div style={{ fontSize: 11, fontWeight: c.real ? 700 : 400, color: c.real ? C.blu : C.tx, flex: 1 }}>
            {c.n}{c.note && <span style={{ color: C.amb, marginLeft: 4 }}>⚡</span>}
          </div>
          <div style={{ flexShrink: 0 }}>
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
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.blu; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.mut; }}
                >
                  <span>📅</span>
                  <span>Calendar</span>
                </a>
              )
            }
          </div>
        </div>
      ))}
    </div>
  );
}
